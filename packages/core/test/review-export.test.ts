import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { db, sql } from "@workspace/db/client";
import {
  documents,
  documentVersions,
  tabularCells,
  tabularReviews,
  tenants,
  user,
  approvalProposals,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createWorkflow, getWorkflow } from "../src/platform/workflow.js";
import { prepareReviewExport, requestCleanReviewExport } from "../src/content/reviewExport.js";
import {
  setApprovalPolicy,
  getApprovalPolicy,
  getProposal,
  decideProposal,
} from "../src/core/approval.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import { getReviewCompletion, setFindingDisposition } from "../src/ai/tabular/contract-review.js";
import { generateDocx } from "../src/content/docx/generate.js";
import { inspectDocx } from "../src/content/docx/inspection.js";
import { applyTrackedEdits, extractDocxBodyText } from "../src/content/docx/trackedChanges.js";
import * as storage from "../src/core/storage.js";

const userId = `export-review-${randomUUID()}`;
const human = { type: "user" as const, userId };
let tenantId: string, matterId: string, documentId: string, reviewId: string;
const versionId = randomUUID();
const fixtureObjects = new Map<string, Buffer>();
let sourceBytes: Buffer;

beforeAll(async () => {
  const [tenant] = await db.insert(tenants).values({ name: "Synthetic clean export" }).returning();
  tenantId = tenant!.id;
  sourceBytes = Buffer.from(await generateDocx({ title: "Synthetic source", blocks: [] }));
  expect(await extractDocxBodyText(sourceBytes)).toBe("Synthetic source");
  fixtureObjects.set("synthetic-immutable-reference.docx", sourceBytes);
  // Exercise real DOCX inspection while keeping storage I/O isolated. All other
  // storage exports retain their production implementation.
  vi.spyOn(storage, "getObject").mockImplementation(async (requestedTenant, path) => {
    const bytes = fixtureObjects.get(path);
    if (requestedTenant !== tenantId || !bytes) throw new Error("Unexpected fixture storage read");
    return Buffer.from(bytes);
  });
  await db.insert(user).values({
    id: userId,
    name: "Synthetic reviewer",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const client = await createClient(userId, tenantId, { name: "Synthetic client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Synthetic matter" })).id;
  const [doc] = await db
    .insert(documents)
    .values({
      userId,
      tenantId,
      matterId,
      title: "Synthetic export source",
      fileType: "docx",
      status: "ready",
      markdown: "Synthetic source",
      currentVersionId: versionId,
      approvedVersionId: versionId,
      approvedMarkdown: "Synthetic source",
    })
    .returning();
  documentId = doc!.id;
  await db.insert(documentVersions).values({
    id: versionId,
    documentId,
    versionNumber: 1,
    fileType: "docx",
    storagePath: "synthetic-immutable-reference.docx",
    source: "upload",
    wordInspection: await inspectDocx(sourceBytes),
    sizeBytes: sourceBytes.length,
  });
  const playbookId = await createWorkflow(human, {
    matterId,
    title: "Synthetic export playbook",
    type: "playbook",
    promptMd: "",
    status: "approved",
    rules: [
      {
        id: "synthetic-rule",
        clauseType: "Synthetic rule",
        standardPosition: "Synthetic source",
        severity: "red",
      },
    ],
  });
  const playbookRevision = (await getWorkflow(playbookId))!.workflow.headCommitId!;
  const [review] = await db
    .insert(tabularReviews)
    .values({
      userId,
      tenantId,
      matterId,
      createdBy: userId,
      title: "Synthetic review",
      columnsConfig: [{ index: 0, name: "Synthetic rule", prompt: "Synthetic prompt" }],
      documentIds: [documentId],
      inputSnapshot: {
        revision: 1,
        createdAt: new Date().toISOString(),
        playbookId,
        playbookRevision,
        documents: [
          {
            id: documentId,
            title: doc!.title,
            versionId,
            headCommitId: null,
            text: "Synthetic source",
          },
        ],
        rules: [
          {
            id: "synthetic-rule",
            columnIndex: 0,
            name: "Synthetic rule",
            severity: "red",
            standardPosition: "Synthetic source",
            clauses: [],
          },
        ],
      },
    })
    .returning();
  reviewId = review!.id;
});

afterAll(async () => {
  vi.restoreAllMocks();
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("clean export snapshot", () => {
  test("unfinished finding cannot authorize clean output", async () => {
    await expect(prepareReviewExport(human, reviewId, documentId)).rejects.toThrow(
      "input_not_ready"
    );
  });
  test("pins the accepted immutable version without generating or resolving content", async () => {
    await writeCell(human, {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "Conforms",
      flag: "green",
      reasoning: "Synthetic fixture",
      citations: [{ quote: "Synthetic source" }],
    });
    const snapshot = await prepareReviewExport(human, reviewId, documentId);
    expect(snapshot.versionId).toBe(versionId);
    expect(snapshot.storagePath).toBe("synthetic-immutable-reference.docx");
    expect(snapshot.doc.currentVersionId).toBe(versionId);
  });
  test("an out-of-scope agent cannot obtain the export snapshot", async () => {
    await expect(
      prepareReviewExport(
        {
          type: "agent",
          userId,
          agentLabel: "mcp:outside",
          scope: { matterIds: [randomUUID()], maxRole: "owner" },
        },
        reviewId,
        documentId
      )
    ).rejects.toThrow("access_denied");
  });

  test("exact clean export authorization is human-only, request-idempotent and bound to current policy/heads", async () => {
    await setApprovalPolicy(human, matterId, {
      policy: {
        agentCells: "direct",
        cleanExports: {
          approvalAboveDocuments: 0,
          approvalAboveProviderCostMicros: 0,
          requiredRole: "owner",
        },
      },
      expectedRevision: (await getApprovalPolicy(human, matterId)).revision,
      reason: "Synthetic exact output gate",
    });
    await expect(prepareReviewExport(human, reviewId, documentId)).rejects.toMatchObject({
      code: "approval_required",
    });
    const input = { requestId: randomUUID(), reviewId, documentId };
    const requested = await requestCleanReviewExport(human, input);
    expect(requested.approvalRequired).toBe(true);
    const proposal = requested.proposal!;
    expect(proposal.kind).toBe("export");
    expect((await requestCleanReviewExport(human, input)).replayed).toBe(true);
    await expect(
      prepareReviewExport(human, reviewId, documentId, { proposalId: proposal.id })
    ).rejects.toMatchObject({ code: "stale_proposal" });
    const decision = {
      requestId: randomUUID(),
      proposalId: proposal.id,
      revision: proposal.revision,
      contentHash: proposal.contentHash,
      policyRevision: proposal.policyRevision,
      decision: "approve" as const,
    };
    await expect(
      decideProposal({ type: "agent", userId, agentLabel: "Synthetic approval bypass" }, decision)
    ).rejects.toMatchObject({ code: "access_denied" });
    await decideProposal(human, decision);
    const exported = await prepareReviewExport(human, reviewId, documentId, {
      proposalId: proposal.id,
    });
    expect(exported.versionId).toBe(versionId);
    expect(
      (await prepareReviewExport(human, reviewId, documentId, { proposalId: proposal.id }))
        .storagePath
    ).toBe(exported.storagePath);
    await expect(
      requestCleanReviewExport(human, { ...input, documentId: randomUUID() })
    ).rejects.toMatchObject({ code: "request_conflict" });
    await setApprovalPolicy(human, matterId, {
      policy: {
        agentCells: "direct",
        cleanExports: {
          approvalAboveDocuments: 1,
          approvalAboveProviderCostMicros: 0,
          requiredRole: "owner",
        },
      },
      expectedRevision: (await getApprovalPolicy(human, matterId)).revision,
      reason: "Synthetic policy drift",
    });
    await expect(
      prepareReviewExport(human, reviewId, documentId, { proposalId: proposal.id })
    ).rejects.toMatchObject({ code: "stale_proposal" });
    expect((await getProposal(human, proposal.id)).policyChanged).toBe(true);
  });
  test("authorized source/review changes invalidate an applied output manifest", async () => {
    await setApprovalPolicy(human, matterId, {
      policy: {
        agentCells: "direct",
        cleanExports: {
          approvalAboveDocuments: 0,
          approvalAboveProviderCostMicros: 0,
          requiredRole: "owner",
        },
      },
      expectedRevision: (await getApprovalPolicy(human, matterId)).revision,
      reason: "Synthetic review cutoff",
    });
    const { proposal } = await requestCleanReviewExport(human, {
      requestId: randomUUID(),
      reviewId,
      documentId,
    });
    await decideProposal(human, {
      requestId: randomUUID(),
      proposalId: proposal!.id,
      revision: proposal!.revision,
      contentHash: proposal!.contentHash,
      policyRevision: proposal!.policyRevision,
      decision: "approve",
    });
    await writeCell(human, {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "Still conforms but changed review",
      flag: "green",
      reasoning: "Synthetic changed review",
      citations: [{ quote: "Synthetic source" }],
    });
    await expect(
      prepareReviewExport(human, reviewId, documentId, { proposalId: proposal!.id })
    ).rejects.toMatchObject({ code: "stale_proposal" });
    expect((await getProposal(human, proposal!.id)).stale).toBe(true);
    await setApprovalPolicy(human, matterId, {
      policy: {
        agentCells: "direct",
        cleanExports: {
          approvalAboveDocuments: 1,
          approvalAboveProviderCostMicros: 0,
          requiredRole: "owner",
        },
      },
      expectedRevision: (await getApprovalPolicy(human, matterId)).revision,
      reason: "Restore direct one-document output",
    });
  });
  test("pending governed content blocks export even when the old accepted finding conforms", async () => {
    await setApprovalPolicy(human, matterId, {
      policy: { agentCells: "owner" },
      expectedRevision: (await getApprovalPolicy(human, matterId)).revision,
      reason: "Synthetic owner gate",
    });
    const proposed = await writeCell(
      { type: "agent", userId, agentLabel: "mcp:synthetic" },
      {
        reviewId,
        documentId,
        columnIndex: 0,
        summary: "New proposed finding",
        flag: "red",
        reasoning: "Synthetic fixture",
        citations: [{ quote: "Synthetic source" }],
      }
    );
    expect(proposed.commit?.summary).toMatchObject({ outcome: "proposed" });
    const [cell] = await db.select().from(tabularCells).where(eq(tabularCells.reviewId, reviewId));
    expect(cell!.content!.flag).toBe("green");
    await expect(prepareReviewExport(human, reviewId, documentId)).rejects.toThrow(
      "input_not_ready"
    );
  });
  test("incoming Word revisions remain unsafe after human findings decisions and cannot create export approval", async () => {
    const edited = await applyTrackedEdits(sourceBytes, [
      {
        find: "Synthetic source",
        replace: "Synthetic revised source",
        context_before: "",
        context_after: "",
      },
    ]);
    const capturedText = await extractDocxBodyText(edited.bytes);
    expect(capturedText).toBe("Synthetic revised source");
    const unsafeVersionId = randomUUID();
    const storagePath = `synthetic-incoming-${unsafeVersionId}.docx`;
    fixtureObjects.set(storagePath, Buffer.from(edited.bytes));
    const [doc] = await db
      .insert(documents)
      .values({
        userId,
        tenantId,
        matterId,
        title: "Incoming counterparty draft",
        fileType: "docx",
        status: "ready",
        markdown: capturedText,
        currentVersionId: unsafeVersionId,
        approvedVersionId: unsafeVersionId,
        approvedMarkdown: capturedText,
      })
      .returning();
    await db.insert(documentVersions).values({
      id: unsafeVersionId,
      documentId: doc!.id,
      versionNumber: 1,
      fileType: "docx",
      storagePath,
      source: "upload",
      wordInspection: await inspectDocx(edited.bytes),
      sizeBytes: edited.bytes.length,
    });
    const [original] = await db
      .select()
      .from(tabularReviews)
      .where(eq(tabularReviews.id, reviewId));
    if (!original?.inputSnapshot) throw new Error("Missing captured fixture inputs");
    const [review] = await db
      .insert(tabularReviews)
      .values({
        userId,
        tenantId,
        matterId,
        createdBy: userId,
        title: "Review with unresolved incoming Word changes",
        columnsConfig: original.columnsConfig,
        documentIds: [doc!.id],
        inputSnapshot: {
          ...original.inputSnapshot,
          documents: [
            {
              id: doc!.id,
              title: doc!.title,
              versionId: unsafeVersionId,
              headCommitId: null,
              text: capturedText,
            },
          ],
        },
      })
      .returning();
    await writeCell(human, {
      reviewId: review!.id,
      documentId: doc!.id,
      columnIndex: 0,
      summary: "Needs human judgment",
      flag: "red",
      reasoning: "Synthetic counterparty source",
      citations: [{ quote: capturedText }],
    });
    const before = (await getReviewCompletion(human, review!.id))!;
    await setFindingDisposition(human, review!.id, {
      documentId: doc!.id,
      columnIndex: 0,
      revisionId: before.documents[0]!.findings[0]!.finding!.revisionId,
      status: "left_unchanged",
      rationale:
        "Synthetic human accepts the legal wording; Word revision markers remain unresolved.",
    });
    const after = (await getReviewCompletion(human, review!.id))!;
    expect(after.decisionsComplete).toBe(true);
    expect(after.cleanReady).toBe(false);
    expect(after.documents[0]).toMatchObject({
      canPropose: false,
      wordInspection: { incomingRevisions: 1, safeClean: false },
    });
    const requestId = randomUUID();
    await expect(
      requestCleanReviewExport(human, { requestId, reviewId: review!.id, documentId: doc!.id })
    ).rejects.toThrow("input_not_ready");
    expect(
      await db.select().from(approvalProposals).where(eq(approvalProposals.id, requestId))
    ).toEqual([]);
    await expect(prepareReviewExport(human, review!.id, doc!.id)).rejects.toThrow(
      "input_not_ready"
    );
    expect(fixtureObjects.get(storagePath)?.equals(edited.bytes)).toBe(true);
  });
});
