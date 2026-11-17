import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vite-plus/test";
import { db } from "@workspace/db/client";
import { eq } from "drizzle-orm";
import {
  approvalProposals,
  jobs,
  jobReceipts,
  jobUnits,
  jobSpendReservations,
  tabularCells,
  tenants,
  user,
} from "@workspace/db/schema";
import { quoteOnlyCitations } from "../src/content/citations.js";
import { coerceCitations, queryCell, queryRow } from "../src/ai/tabular/extract.js";
import { buildCellPrompt, buildRowPrompt } from "../src/ai/prompts/tabular.js";
import { validateFinding } from "../src/ai/tabular/finding.js";
import { runPlaybook } from "../src/ai/tabular/playbook.js";
import {
  commitCell,
  runCell,
  runDocument,
  runReviewStreaming,
  type StreamedCell,
} from "../src/ai/tabular/runner.js";
import { queueReviewRun } from "../src/ai/tabular/jobs.js";
import { claimJob, completeJob } from "../src/core/jobs.js";
import { startExtractionWorker } from "../src/content/extractionQueue.js";
import { getReview } from "../src/ai/tabular/queries.js";
import {
  recordCommit,
  recordCommitInTransaction,
  getCommitChanges,
  listCommits,
} from "../src/core/commit.js";
import { captureReviewReport, renderReviewReportMarkdown } from "../src/content/reviewReport.js";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createWorkflow } from "../src/platform/workflow.js";
import { createDocument } from "../src/content/documents.js";
import {
  approvalHash,
  decideProposal,
  getApprovalPolicy,
  getProposal,
  setApprovalPolicy,
  stageCellProposal,
} from "../src/core/approval.js";

vi.mock("../src/ai/provider/index.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  resolveRunModel: async () => ({ model: "claude-sonnet-5", key: "synthetic-no-network" }),
  resolveLlmKey: async () => ({ key: "synthetic-no-network" }),
}));
vi.mock("../src/ai/tabular/extract.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  queryCell: vi.fn(),
  queryRow: vi.fn(),
}));
vi.mock("../src/content/extractionQueue.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  startExtractionWorker: vi.fn(() => ({ wake: vi.fn(), stop: vi.fn() })),
}));

const text = "Keep information confidential.";
const content = { summary: "Conforms", flag: "green" as const, reasoning: "Synthetic fixture" };
const userId = `citation-provenance-${randomUUID()}`;
const actor = { type: "user" as const, userId };
let tenantId: string, matterId: string, documentId: string, playbookId: string;

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Synthetic citation provenance" })
    .returning();
  tenantId = tenant!.id;
  await db.insert(user).values({
    id: userId,
    name: "Synthetic reviewer",
    email: `${userId}@example.com`,
    tenantId,
    tenantRole: "admin",
  });
  const client = await createClient(userId, tenantId, { name: "Synthetic client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Citation fixture" })).id;
  documentId = (
    await createDocument(userId, {
      title: "Unpaginated text",
      matterId,
      markdown: `[Page 1]\n\n${text}`,
    })
  ).id;
  playbookId = await createWorkflow(actor, {
    title: "Synthetic positions",
    type: "playbook",
    status: "approved",
    promptMd: "",
    rules: [
      {
        id: "citation-rule",
        clauseType: "Confidentiality",
        standardPosition: text,
        severity: "red",
      },
    ],
  });
});
afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
});
const prepare = () =>
  runPlaybook(actor, {
    matterId,
    documentIds: [documentId],
    playbookId,
    reviewInstructions: {
      representedParty: null,
      disclosureRole: "unknown",
      ndaStructure: "unknown",
      businessPurpose: null,
      governingLaw: null,
    },
  });

test("untrusted numeric pages never become a verified citation, including plausible PDF markers", () => {
  for (const page of [1, 2, 999, -1, 0, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(coerceCitations([{ page, quote: text }])).toEqual([{ quote: text }]);
    expect(validateFinding(`[Page 1]\n\n${text}`, content, [{ page, quote: text }])).toMatchObject({
      citationsValid: true,
      citations: [{ quote: text }],
    });
  }
  expect(validateFinding(text, content, [{ page: 1, quote: "Invented words" }])).toMatchObject({
    citationsValid: false,
    citations: [],
  });
  const legacy = Object.freeze([Object.freeze({ page: 1, quote: text })]);
  expect(quoteOnlyCitations(legacy)).toEqual([{ quote: text }]);
  expect(legacy).toEqual([{ page: 1, quote: text }]);
});

test("cell and row prompts explicitly request quotations without unsupported page claims", () => {
  for (const prompt of [
    buildCellPrompt({
      filename: "Synthetic.pdf",
      documentText: `[Page 1]\n\n${text}`,
      columnPrompt: "Check confidentiality",
    }),
    buildRowPrompt({
      filename: "Synthetic.docx",
      documentText: text,
      columns: [{ index: 0, name: "Confidentiality", prompt: "Check confidentiality" }],
    }),
  ]) {
    expect(prompt.system).toContain("No trusted page map was provided");
    expect(prompt.system).toContain("omit page numbers");
    expect(prompt.system).not.toContain('"page": number');
  }
});

test("synchronous cell, row and shared durable publication remove upstream page claims", async () => {
  const prepared = await prepare();
  const output = { content, citations: [{ page: 1, quote: text }] };
  vi.mocked(queryCell).mockResolvedValueOnce(output);
  await runCell(actor, { reviewId: prepared.reviewId, documentId, columnIndex: 0 });
  expect(
    (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, prepared.reviewId)))[0]!
      .citations
  ).toEqual([{ quote: text }]);
  vi.mocked(queryRow).mockResolvedValueOnce(new Map([[0, output]]));
  await runDocument(actor, { reviewId: prepared.reviewId, documentId });
  expect(
    (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, prepared.reviewId)))[0]!
      .citations
  ).toEqual([{ quote: text }]);
  const review = (await getReview(prepared.reviewId))!.review;
  // The durable worker publishes through this same boundary. No queue or real
  // provider is used: a running local worker cannot pick up paid test jobs.
  await commitCell(
    { type: "agent", userId, agentLabel: "synthetic-durable-publication" },
    {
      review,
      reviewId: review.id,
      documentId,
      columnIndex: 0,
      columnName: "Confidentiality",
      docTitle: "Unpaginated text",
      ...output,
    }
  );
  expect(
    (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, prepared.reviewId)))[0]!
      .citations
  ).toEqual([{ quote: text }]);
});

test("legacy page claims are suppressed in reads/reports without rewriting audited cells or commits", async () => {
  const prepared = await prepare();
  const legacyCitations = [{ page: 1, quote: text }];
  const receipt = await recordCommit({
    actor,
    artifactType: "tabular_review",
    artifactId: prepared.reviewId,
    op: "legacy_fixture",
    message: "Synthetic pre-correction citation fixture",
    apply: async ({ tx, commitId }) => {
      await tx
        .update(tabularCells)
        .set({
          content,
          citations: legacyCitations,
          status: "done",
          lastCommitId: commitId,
          finding: {
            revisionId: commitId,
            ruleId: "citation-rule",
            sourceVersionId: null,
            sourceHeadCommitId: null,
            outcome: "conforms",
            citationsValid: true,
          },
        })
        .where(eq(tabularCells.reviewId, prepared.reviewId));
      return {
        changes: [{ path: `cell/${documentId}/0/citations`, before: null, after: legacyCitations }],
      };
    },
  });
  const before = await listCommits("tabular_review", prepared.reviewId);
  expect((await getReview(prepared.reviewId))!.cells[0]!.citations).toEqual([{ quote: text }]);
  const report = await captureReviewReport(actor, prepared.reviewId);
  expect(report.documents[0]!.findings[0]!.citations).toEqual([{ quote: text }]);
  expect(report.manifest.paginationVerified).toBe(false);
  expect(report.manifest.citationLocator).toBe("source_quotation");
  expect(renderReviewReportMarkdown(report)).not.toContain("Recorded source page");
  expect(
    (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, prepared.reviewId)))[0]!
      .citations
  ).toEqual(legacyCitations);
  expect(await getCommitChanges(receipt.commit!.id)).toEqual(
    expect.arrayContaining([expect.objectContaining({ after: legacyCitations })])
  );
  expect(
    (await listCommits("tabular_review", prepared.reviewId)).map((commit) => commit.id)
  ).toEqual(before.map((commit) => commit.id));
});

test("legacy pending approval stays bound to raw payload hash, policy and original receipt", async () => {
  await setApprovalPolicy(actor, matterId, {
    policy: { agentCells: "owner" },
    expectedRevision: (await getApprovalPolicy(actor, matterId)).revision,
    reason: "Synthetic owner-gated legacy citation fixture",
  });
  const prepared = await prepare();
  const legacyCitations = [{ page: 1, quote: text }];
  const agent = { type: "agent" as const, userId, agentLabel: "synthetic-legacy-proposer" };
  const receipt = await recordCommit({
    actor: agent,
    artifactType: "tabular_review",
    artifactId: prepared.reviewId,
    op: "legacy_fixture",
    message: "Synthetic pre-correction pending citation fixture",
    apply: async ({ tx, commitId }) => {
      const result = await stageCellProposal(tx, {
        actor: agent,
        commitId,
        reviewId: prepared.reviewId,
        documentId,
        columnIndex: 0,
        content,
        citations: legacyCitations,
        requireCurrentSource: true,
        sourceVersionId: null,
      });
      if (!result) throw new Error("Expected governed legacy fixture proposal");
      return result;
    },
  });
  const summary = receipt.commit!.summary as { proposalId: string };
  const pending = await getProposal(actor, summary.proposalId);
  if (pending.kind !== "cell") throw new Error("Expected cell proposal");
  const original = (
    await db.select().from(approvalProposals).where(eq(approvalProposals.id, pending.id))
  )[0]!;
  expect(pending.payload.citations).toEqual(legacyCitations);
  expect(pending.contentHash).toBe(approvalHash(pending.payload));
  const displayHash = approvalHash({
    ...pending.payload,
    citations: quoteOnlyCitations(pending.payload.citations),
  });
  expect(displayHash).not.toBe(pending.contentHash);
  await getReview(prepared.reviewId);
  await captureReviewReport(actor, prepared.reviewId);
  const reread = await getProposal(actor, pending.id);
  expect(reread.contentHash).toBe(original.contentHash);
  expect(reread.policyRevision).toBe(original.policyRevision);
  expect(reread.proposalCommitId).toBe(original.proposalCommitId);
  expect(reread.payload).toEqual(original.payload);
  const decision = {
    requestId: randomUUID(),
    proposalId: pending.id,
    revision: pending.revision,
    contentHash: pending.contentHash,
    policyRevision: pending.policyRevision,
    decision: "approve" as const,
  };
  await expect(
    decideProposal(actor, { ...decision, contentHash: displayHash })
  ).rejects.toMatchObject({ code: "stale_proposal" });
  await decideProposal(actor, decision);
  expect(
    (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, prepared.reviewId)))[0]!
      .citations
  ).toEqual([{ quote: text }]);
  const decided = (
    await db.select().from(approvalProposals).where(eq(approvalProposals.id, pending.id))
  )[0]!;
  expect(decided.payload).toEqual(original.payload);
  expect(decided.contentHash).toBe(original.contentHash);
  expect(decided.policyRevision).toBe(original.policyRevision);
  expect(decided.proposalCommitId).toBe(original.proposalCommitId);
});

test("successful legacy streaming receipt replay projects citations without inference or history writes", async () => {
  for (const legacyCitations of [[{ page: 1, quote: text }], null]) {
    const prepared = await prepare();
    const requestId = randomUUID();
    const queued = await queueReviewRun(actor, { reviewId: prepared.reviewId, requestId });
    const claimed = await claimJob(randomUUID(), prepared.reviewId, "review_cell");
    if (!claimed) throw new Error("Expected the isolated synthetic job claim");
    expect(claimed.id).toBe(queued.jobIds[0]);
    const resultCommitId = await completeJob(claimed, async (tx) => {
      const recorded = await recordCommitInTransaction(tx, {
        actor: { type: "agent", userId, agentLabel: "synthetic-legacy-provider" },
        artifactType: "tabular_review",
        artifactId: prepared.reviewId,
        op: "legacy_fixture",
        message: "Synthetic successful pre-correction streaming receipt",
        apply: async ({ tx, commitId }) => {
          await tx
            .update(tabularCells)
            .set({
              content,
              citations: legacyCitations,
              status: "done",
              lastCommitId: commitId,
              finding: {
                revisionId: commitId,
                ruleId: "citation-rule",
                sourceVersionId: null,
                sourceHeadCommitId: null,
                outcome: legacyCitations ? "conforms" : "inconclusive",
                citationsValid: legacyCitations !== null,
              },
            })
            .where(eq(tabularCells.reviewId, prepared.reviewId));
          return {
            changes: [
              { path: `cell/${documentId}/0/citations`, before: null, after: legacyCitations },
            ],
          };
        },
      });
      return recorded.commit!.id;
    });
    const storedBefore = await db
      .select()
      .from(tabularCells)
      .where(eq(tabularCells.reviewId, prepared.reviewId));
    const jobsBefore = await db.select().from(jobs).where(eq(jobs.id, claimed.id));
    const receiptsBefore = await db
      .select()
      .from(jobReceipts)
      .where(eq(jobReceipts.jobId, claimed.id));
    const unitsBefore = await db.select().from(jobUnits).where(eq(jobUnits.jobId, claimed.id));
    const historyBefore = await listCommits("tabular_review", prepared.reviewId);
    const changesBefore = await getCommitChanges(resultCommitId);
    const cellCallsBefore = vi.mocked(queryCell).mock.calls.length;
    const rowCallsBefore = vi.mocked(queryRow).mock.calls.length;
    const emitted: StreamedCell[] = [];
    const onStart = vi.fn(),
      onError = vi.fn();
    const replayed = await runReviewStreaming(
      actor,
      { reviewId: prepared.reviewId, requestId },
      {
        onCellStart: onStart,
        onError,
        onCell: (_documentId, _columnIndex, cell) => emitted.push(cell),
      }
    );
    expect(replayed?.jobIds).toEqual(queued.jobIds);
    expect(emitted).toHaveLength(1);
    expect(emitted[0]!.citations).toEqual(legacyCitations === null ? null : [{ quote: text }]);
    expect(onStart).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
    expect(vi.mocked(startExtractionWorker)).toHaveBeenCalled();
    expect(vi.mocked(queryCell).mock.calls).toHaveLength(cellCallsBefore);
    expect(vi.mocked(queryRow).mock.calls).toHaveLength(rowCallsBefore);
    expect(
      await db.select().from(tabularCells).where(eq(tabularCells.reviewId, prepared.reviewId))
    ).toEqual(storedBefore);
    expect(await db.select().from(jobs).where(eq(jobs.id, claimed.id))).toEqual(jobsBefore);
    expect(await db.select().from(jobReceipts).where(eq(jobReceipts.jobId, claimed.id))).toEqual(
      receiptsBefore
    );
    expect(await db.select().from(jobUnits).where(eq(jobUnits.jobId, claimed.id))).toEqual(
      unitsBefore
    );
    expect(await listCommits("tabular_review", prepared.reviewId)).toEqual(historyBefore);
    expect(await getCommitChanges(resultCommitId)).toEqual(changesBefore);
    expect(
      await db.select().from(jobSpendReservations).where(eq(jobSpendReservations.jobId, claimed.id))
    ).toEqual([]);
  }
});
