import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { readFileSync } from "node:fs";
import fixture from "./fixtures/nda/manifest.json";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { documents, tenants, user, matterMembers, matters } from "@workspace/db/schema";
import { ensureDefaultMatter } from "../src/platform/matters.js";
import { createWorkflow } from "../src/platform/workflow.js";
import {
  createDocument,
  uploadDocument,
  processDocument,
  resolveEdits,
  listVersions,
  getDocument,
} from "../src/content/documents.js";
import { setApprovalPolicy } from "../src/core/approval.js";
import { createClause } from "../src/content/clauses.js";
import { deleteObject } from "../src/core/storage.js";
import { runPlaybook } from "../src/ai/tabular/playbook.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import { getReview } from "../src/ai/tabular/queries.js";
import {
  getReviewCompletion,
  setFindingDisposition,
  proposeFindingRedline,
} from "../src/ai/tabular/contract-review.js";
import { validateFinding, normalizeEvidenceText } from "../src/ai/tabular/finding.js";
import { listCommits, getCommitChanges, recordCommit } from "../src/core/commit.js";

const userId = `review-contract-${randomUUID()}`;
const actor = { type: "user" as const, userId };
const uploadedIds: string[] = [];
const extraUserIds: string[] = [];
let tenantId: string;
let matterId: string;
let docId: string;
let playbookId: string;
beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Review contract tests", storageRegion: "legacy" })
    .returning();
  tenantId = tenant!.id;
  await db.insert(user).values({
    id: userId,
    name: "Reviewer",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
    tenantRole: "admin",
  });
  matterId = await ensureDefaultMatter(userId, "Reviewer", tenantId);
  const doc = await createDocument(userId, {
    title: "Synthetic NDA",
    markdown: "Keep information confidential. Return all information.",
    matterId,
  });
  docId = doc.id;
  playbookId = await createWorkflow(actor, {
    title: "Synthetic positions",
    type: "playbook",
    promptMd: "",
    status: "approved",
    rules: [
      {
        id: randomUUID(),
        clauseType: "Confidentiality",
        standardPosition: "Confidentiality required",
        severity: "yellow",
      },
    ],
  });
});
afterAll(async () => {
  for (const uploadedId of uploadedIds)
    for (const version of await listVersions(uploadedId))
      if (version.storagePath) await deleteObject(tenantId, version.storagePath);
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  for (const id of extraUserIds) await db.delete(user).where(eq(user.id, id));
  await sql.end();
});

test("snapshots, quoted findings and decisions remain attributable after source changes", async () => {
  const run = await runPlaybook(actor, { playbookId, documentIds: [docId], matterId });
  let detail = (await getReview(run.reviewId))!;
  expect(detail.review.inputSnapshot?.documents[0]?.text).toContain(
    "Keep information confidential."
  );
  await writeCell(actor, {
    reviewId: run.reviewId,
    documentId: docId,
    columnIndex: 0,
    summary: "Needs judgment",
    flag: "yellow",
    reasoning: "Synthetic assessment",
    citations: [{ quote: "Keep information confidential." }],
  });
  let completion = (await getReviewCompletion(actor, run.reviewId))!;
  expect(completion.cleanReady).toBe(false);
  const revisionId = completion.documents[0]!.findings[0]!.finding!.revisionId;
  await expect(
    setFindingDisposition({ type: "agent", userId, agentLabel: "test" }, run.reviewId, {
      documentId: docId,
      columnIndex: 0,
      revisionId,
      status: "left_unchanged",
      rationale: "Agreed",
    })
  ).rejects.toThrow("access_denied");
  await setFindingDisposition(actor, run.reviewId, {
    documentId: docId,
    columnIndex: 0,
    revisionId,
    status: "left_unchanged",
    rationale: "Client accepts this position",
  });
  const resolvedTextReview = (await getReviewCompletion(actor, run.reviewId))!;
  expect(resolvedTextReview.decisionsComplete).toBe(true);
  expect(resolvedTextReview.cleanReady).toBe(false); // text findings do not imply a clean DOCX
  await recordCommit({
    artifactType: "document",
    artifactId: docId,
    actor,
    op: "replace",
    message: "Change test source",
    apply: async ({ tx }) => {
      await tx
        .update(documents)
        .set({ markdown: "Different current text." })
        .where(eq(documents.id, docId));
      return {
        changes: [
          {
            path: "field/markdown",
            before: "Keep information confidential. Return all information.",
            after: "Different current text.",
          },
        ],
      };
    },
  });
  await writeCell(actor, {
    reviewId: run.reviewId,
    documentId: docId,
    columnIndex: 0,
    summary: "Original finding",
    flag: "green",
    reasoning: "Still grounded in snapshot",
    citations: [{ quote: "Keep information confidential." }],
  });
  detail = (await getReview(run.reviewId))!;
  expect(detail.cells[0]!.finding?.outcome).toBe("conforms");
  expect(detail.cells[0]!.disposition).toBeNull();
  expect((await getReviewCompletion(actor, run.reviewId))!.documents[0]!.sourceChanged).toBe(true);
  expect(detail.review.inputSnapshot?.documents[0]?.text).toContain(
    "Keep information confidential."
  );
  const history = await listCommits("tabular_review", run.reviewId);
  expect(await getCommitChanges(history[0]!.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({ path: `finding/${docId}/0/disposition`, after: null }),
    ])
  );
  await expect(
    setFindingDisposition(actor, run.reviewId, {
      documentId: docId,
      columnIndex: 0,
      revisionId,
      status: "left_unchanged",
      rationale: "Old decision",
    })
  ).rejects.toThrow("stale_proposal");
});

test("request replay returns one review and different input conflicts", async () => {
  const requestId = randomUUID();
  const input = { playbookId, documentIds: [docId], matterId, requestId };
  const first = await runPlaybook(actor, input);
  expect(await runPlaybook(actor, input)).toEqual(first);
  await expect(runPlaybook(actor, { ...input, documentIds: [] })).rejects.toThrow(
    "request_conflict"
  );
  const scoped = {
    type: "agent" as const,
    userId,
    agentLabel: "scoped",
    scope: { matterIds: [randomUUID()], maxRole: "owner" as const },
  };
  await expect(runPlaybook(scoped, { ...input, requestId: randomUUID() })).rejects.toThrow(
    "access_denied"
  );
});

test("fabricated and blank evidence cannot become verified or imply absence", () => {
  const content = { summary: "Claim", flag: "green" as const, reasoning: "Reason" };
  expect(validateFinding("Actual source", content, [{ quote: "Fabricated" }])).toMatchObject({
    outcome: "inconclusive",
    citationsValid: false,
    citations: [],
    content: { flag: "grey" },
  });
  expect(validateFinding("Actual source", content, [{ quote: " " }]).citationsValid).toBe(false);
  expect(
    validateFinding("Actual source\\.", content, [{ quote: "Actual source." }]).citationsValid
  ).toBe(true);
  expect(validateFinding("Actual source", content, []).outcome).toBe("inconclusive");
  expect(validateFinding("Actual source", { ...content, outcome: "not_found" }, []).outcome).toBe(
    "not_found"
  );
});

test("two non-overlapping finding proposals, explicit absence insertion and human resolution keep provenance", async () => {
  const uploaded = await uploadDocument(userId, {
    title: "Versioned NDA",
    fileType: "docx",
    bytes: readFileSync(new URL("./fixtures/nda/source.docx", import.meta.url)),
    matterId,
  });
  uploadedIds.push(uploaded.id);
  await processDocument(uploaded);
  const selectedRules = fixture.rules.slice(1);
  const clauseIds: string[] = [];
  for (const rule of selectedRules)
    clauseIds.push(
      await createClause(actor, {
        title: rule.clauseType,
        body: rule.standardPosition,
        category: rule.id,
        status: "approved",
      })
    );
  const playbook = await createWorkflow(actor, {
    title: "Linked NDA positions",
    type: "playbook",
    promptMd: "",
    status: "approved",
    rules: selectedRules.map((rule, index) => ({
      ...rule,
      standardClauseId: clauseIds[index],
      severity: "red" as const,
    })),
  });
  const run = await runPlaybook(actor, {
    playbookId: playbook,
    documentIds: [uploaded.id],
    matterId,
  });
  const changeIds: string[] = [];
  for (const [index, rule] of selectedRules.entries()) {
    const authored = fixture.findings.find((f) => f.ruleId === rule.id)!;
    if (authored.quote)
      expect(
        normalizeEvidenceText(
          (await getReviewCompletion(actor, run.reviewId))!.documents[0]!.reviewedText
        )
      ).toContain(authored.quote);
    await writeCell(actor, {
      reviewId: run.reviewId,
      documentId: uploaded.id,
      columnIndex: index,
      summary: authored.summary,
      flag: authored.flag,
      reasoning: authored.reasoning,
      outcome: authored.quote ? "deviates" : "not_found",
      citations: authored.quote ? [{ quote: authored.quote }] : [],
    });
    const completion = (await getReviewCompletion(actor, run.reviewId))!;
    const finding = completion.documents[0]!.findings[index]!;
    const saved = (await getReview(run.reviewId))!.cells.find((c) => c.columnIndex === index)!;
    expect(saved.finding?.outcome).toBe(authored.quote ? "deviates" : "not_found");
    expect(saved.citations).toEqual(authored.quote ? [{ quote: authored.quote }] : []);
    const input = {
      requestId: randomUUID(),
      documentId: uploaded.id,
      columnIndex: index,
      revisionId: finding.finding!.revisionId,
      expectedHeadCommitId: completion.documents[0]!.currentHeadCommitId,
      clauseId: clauseIds[index]!,
      find: authored.quote ?? "",
      ...(!authored.quote ? { contextBefore: fixture.paragraphs[0]! } : {}),
    };
    const proposed = await proposeFindingRedline(actor, run.reviewId, input);
    expect(await proposeFindingRedline(actor, run.reviewId, input)).toEqual(proposed);
    changeIds.push(...proposed.changeIds);
  }
  expect((await getReviewCompletion(actor, run.reviewId))!.documents[0]!.pendingEdits).toBe(3);
  await expect(
    resolveEdits(
      { type: "agent", userId, agentLabel: "cannot approve" },
      uploaded.id,
      changeIds,
      "accept"
    )
  ).rejects.toThrow();
  await resolveEdits(actor, uploaded.id, changeIds, "accept");
  expect((await getReviewCompletion(actor, run.reviewId))?.cleanReady).toBe(true);
  const current = (await getDocument(uploaded.id))!;
  expect(current.markdown).toContain("Confidentiality lasts three years");
  expect(current.markdown).toContain("Return or destroy confidential information");
}, 30000);

async function prepareSingleFinding() {
  const doc = await uploadDocument(userId, {
    title: "Decision ordering NDA",
    fileType: "docx",
    bytes: readFileSync(new URL("./fixtures/nda/source.docx", import.meta.url)),
    matterId,
  });
  uploadedIds.push(doc.id);
  await processDocument(doc);
  const clauseId = await createClause(actor, {
    title: "Decision ordering standard",
    body: fixture.rules[1]!.standardPosition,
    category: "decision-ordering",
    status: "approved",
  });
  const playbook = await createWorkflow(actor, {
    title: "Decision ordering playbook",
    type: "playbook",
    promptMd: "",
    status: "approved",
    rules: [{ ...fixture.rules[1]!, standardClauseId: clauseId, severity: "red" }],
  });
  const run = await runPlaybook(actor, { playbookId: playbook, documentIds: [doc.id], matterId });
  await writeCell(actor, {
    reviewId: run.reviewId,
    documentId: doc.id,
    columnIndex: 0,
    summary: "Synthetic finding",
    flag: "red",
    reasoning: "Synthetic term needs judgment",
    citations: [{ quote: fixture.findings[1]!.quote! }],
  });
  const completion = (await getReviewCompletion(actor, run.reviewId))!;
  return {
    documentId: doc.id,
    reviewId: run.reviewId,
    clauseId,
    revisionId: completion.documents[0]!.findings[0]!.finding!.revisionId,
  };
}

async function proposeSingleFinding(input: Awaited<ReturnType<typeof prepareSingleFinding>>) {
  const completion = (await getReviewCompletion(actor, input.reviewId))!;
  return proposeFindingRedline(actor, input.reviewId, {
    requestId: randomUUID(),
    documentId: input.documentId,
    columnIndex: 0,
    revisionId: input.revisionId,
    clauseId: input.clauseId,
    find: fixture.findings[1]!.quote!,
    expectedHeadCommitId: completion.documents[0]!.currentHeadCommitId,
  });
}

test("rejected proposal supersedes prior unchanged decision until a fresh human disposition", async () => {
  const finding = await prepareSingleFinding();
  const unchanged = {
    documentId: finding.documentId,
    columnIndex: 0,
    revisionId: finding.revisionId,
    status: "left_unchanged" as const,
    rationale: "Synthetic initial decision",
  };
  await setFindingDisposition(actor, finding.reviewId, unchanged);
  expect((await getReviewCompletion(actor, finding.reviewId))?.cleanReady).toBe(true);
  const proposal = await proposeSingleFinding(finding);
  const pending = (await getReviewCompletion(actor, finding.reviewId))!;
  expect(pending.documents[0]!.findings[0]!.disposition).toBe("redline_proposed");
  expect(pending.cleanReady).toBe(false);
  await resolveEdits(actor, finding.documentId, proposal.changeIds, "reject");
  const rejected = (await getReviewCompletion(actor, finding.reviewId))!;
  expect(rejected.documents[0]!.findings[0]!.disposition).toBe("needs_attention");
  expect(rejected.cleanReady).toBe(false);
  await setFindingDisposition(actor, finding.reviewId, {
    ...unchanged,
    rationale: "Synthetic follow-up after reviewing the rejection",
  });
  expect((await getReviewCompletion(actor, finding.reviewId))?.cleanReady).toBe(true);
}, 30000);

test("editor acceptance cannot clear an owner-gated escalation", async () => {
  const finding = await prepareSingleFinding();
  const editorId = `review-editor-${randomUUID()}`;
  extraUserIds.push(editorId);
  await db.insert(user).values({
    id: editorId,
    name: "Synthetic editor",
    email: `${editorId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  await db.insert(matterMembers).values({ matterId, userId: editorId, role: "editor" });
  const editor = { type: "user" as const, userId: editorId };
  const [matter] = await db.select().from(matters).where(eq(matters.id, matterId));
  await setApprovalPolicy(actor, matterId, {
    policy: { agentCells: "direct", escalationDecisions: "owner" },
    expectedRevision: matter!.approvalPolicyRevision,
    reason: "Require owner judgment in this synthetic test",
  });
  const policyRevision = (await getReviewCompletion(actor, finding.reviewId))!.policyRevision;
  const decision = {
    documentId: finding.documentId,
    columnIndex: 0,
    revisionId: finding.revisionId,
    policyRevision,
    rationale: "Synthetic owner judgment requested",
  };
  await setFindingDisposition(editor, finding.reviewId, { ...decision, status: "escalated" });
  const proposal = await proposeSingleFinding(finding);
  await resolveEdits(editor, finding.documentId, proposal.changeIds, "accept");
  const accepted = (await getReviewCompletion(actor, finding.reviewId))!;
  expect(accepted.documents[0]!.pendingEdits).toBe(0);
  expect(accepted.documents[0]!.findings[0]!.disposition).toBe("escalated");
  expect(accepted.cleanReady).toBe(false);
  await expect(
    setFindingDisposition(editor, finding.reviewId, { ...decision, status: "left_unchanged" })
  ).rejects.toThrow();
  await setFindingDisposition(actor, finding.reviewId, {
    ...decision,
    status: "left_unchanged",
    rationale: "Owner endorses accepted tracked language",
  });
  expect((await getReviewCompletion(actor, finding.reviewId))?.cleanReady).toBe(true);
}, 30000);
