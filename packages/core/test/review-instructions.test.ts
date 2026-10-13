import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, test, vi } from "vite-plus/test";
import { db } from "@workspace/db/client";
import { eq } from "drizzle-orm";
import { jobs, tabularReviews, tenants, user } from "@workspace/db/schema";
import { reviewInstructionsSchema, type ReviewInstructions } from "@workspace/contracts";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createDocument } from "../src/content/documents.js";
import { createWorkflow } from "../src/platform/workflow.js";
import { runPlaybook } from "../src/ai/tabular/playbook.js";
import { getReview } from "../src/ai/tabular/queries.js";
import { getReviewCompletion } from "../src/ai/tabular/contract-review.js";
import { validateFinding } from "../src/ai/tabular/finding.js";
import { updateReviewColumn } from "../src/ai/tabular/reviews.js";
import { runCell, runDocument } from "../src/ai/tabular/runner.js";
import { queryCell, queryRow } from "../src/ai/tabular/extract.js";
import {
  buildCellPrompt,
  buildRowPrompt,
  capturedReviewInstructions,
} from "../src/ai/prompts/tabular.js";
import { queueReviewRun } from "../src/ai/tabular/jobs.js";
import { getCommitChanges, listCommits } from "../src/core/commit.js";
import { captureReviewReport, renderReviewReportMarkdown } from "../src/content/reviewReport.js";

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

const userId = `instructions-${randomUUID()}`;
const actor = { type: "user" as const, userId };
const instructions: ReviewInstructions = {
  representedParty: "Synthetic Recipient Ltd",
  disclosureRole: "receiving",
  ndaStructure: "mutual",
  businessPurpose: "Evaluate a potential distribution arrangement",
  governingLaw: null,
  additionalInstructions: "Flag restrictions on sharing with advisers.",
};
let tenantId: string, matterId: string, documentId: string, playbookId: string;
beforeAll(async () => {
  const [tenant] = await db.insert(tenants).values({ name: "Synthetic instructions" }).returning();
  tenantId = tenant!.id;
  await db.insert(user).values({
    id: userId,
    name: "Reviewer",
    email: `${userId}@example.com`,
    tenantId,
    tenantRole: "admin",
  });
  const client = await createClient(userId, tenantId, {
    name: "Synthetic client, not represented party",
  });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Synthetic matter" })).id;
  documentId = (
    await createDocument(userId, {
      title: "Synthetic NDA",
      matterId,
      markdown: "Each recipient must keep information confidential.",
    })
  ).id;
  playbookId = await createWorkflow(actor, {
    title: "Approved synthetic positions",
    type: "playbook",
    status: "approved",
    promptMd: "",
    rules: [
      {
        id: randomUUID(),
        clauseType: "Confidentiality",
        standardPosition: "Keep information confidential",
        severity: "yellow",
      },
    ],
  });
});
afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
});
const prepare = (reviewInstructions?: ReviewInstructions, requestId?: string) =>
  runPlaybook(actor, {
    matterId,
    documentIds: [documentId],
    playbookId,
    reviewInstructions,
    requestId,
  });

test("strict bounded instructions preserve explicit unknowns and reject blank or invented keys", () => {
  expect(
    reviewInstructionsSchema.parse({
      ...instructions,
      representedParty: "  Synthetic Recipient Ltd  ",
    })
  ).toEqual(instructions);
  expect(
    reviewInstructionsSchema.parse({
      ...instructions,
      representedParty: null,
      disclosureRole: "unknown",
      ndaStructure: "unknown",
      businessPurpose: null,
    })
  ).toMatchObject({ representedParty: null, governingLaw: null });
  for (const patch of [
    { representedParty: "   " },
    { governingLaw: "x".repeat(501) },
    { businessPurpose: "x".repeat(2001) },
    { additionalInstructions: "x".repeat(4001) },
    { approvalRole: "owner" },
    { disclosureRole: "seller" },
  ])
    expect(reviewInstructionsSchema.safeParse({ ...instructions, ...patch }).success).toBe(false);
  expect(
    validateFinding(
      "Source",
      {
        summary: "Needs context",
        reasoning: "Governing law is unknown",
        flag: "green",
        outcome: "inconclusive",
      },
      [{ quote: "Source" }]
    )
  ).toMatchObject({ outcome: "inconclusive", content: { flag: "grey" } });
});

test("instructions become an audited immutable snapshot and exact request context", async () => {
  const requestId = randomUUID();
  const first = await prepare(instructions, requestId);
  expect(
    await prepare({ ...instructions, representedParty: "  Synthetic Recipient Ltd  " }, requestId)
  ).toEqual(first);
  await expect(
    prepare({ ...instructions, disclosureRole: "disclosing" }, requestId)
  ).rejects.toThrow("request_conflict");
  const detail = (await getReview(first.reviewId))!;
  expect(detail.review.inputSnapshot).toMatchObject({
    revision: 2,
    reviewInstructions: instructions,
  });
  const history = await listCommits("tabular_review", first.reviewId);
  expect(await getCommitChanges(history[0]!.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: "review/input_snapshot",
        after: expect.objectContaining({ revision: 2, reviewInstructions: instructions }),
      }),
    ])
  );
  await expect(
    updateReviewColumn(actor, {
      reviewId: first.reviewId,
      columnIndex: 0,
      patch: { prompt: "Change review context" },
    })
  ).rejects.toThrow("immutable");
  const next = await prepare({ ...instructions, disclosureRole: "disclosing" });
  expect(next.reviewId).not.toBe(first.reviewId);
  expect((await getReviewCompletion(actor, first.reviewId))!.reviewInstructions).toEqual(
    instructions
  );
  expect(
    (await getReviewCompletion(actor, next.reviewId))!.reviewInstructions?.disclosureRole
  ).toBe("disclosing");
  const report = await captureReviewReport(actor, first.reviewId);
  expect(report.manifest.reviewInstructions).toEqual(instructions);
  expect(renderReviewReportMarkdown(report)).toContain("Governing law: Unknown");
  expect(renderReviewReportMarkdown(report)).toContain(instructions.representedParty!);
});

test("legacy review context remains unknown rather than deriving a client or governing law", async () => {
  const legacy = await prepare();
  const review = (await getReview(legacy.reviewId))!.review;
  expect(review.inputSnapshot?.revision).toBe(1);
  expect((await getReviewCompletion(actor, legacy.reviewId))!.reviewInstructions).toBeNull();
  const prompt = buildCellPrompt({
    filename: "NDA",
    documentText: "Source",
    columnPrompt: "Review confidentiality",
    reviewInstructions: capturedReviewInstructions(review.inputSnapshot),
  });
  expect(prompt.system).toContain("All review context is unknown");
  expect(prompt.system).not.toContain("Synthetic client");
  expect(renderReviewReportMarkdown(await captureReviewReport(actor, legacy.reviewId))).toContain(
    "No review instructions were captured"
  );
});

test("cell and row provider paths receive exactly captured instructions and explicit unknown law", async () => {
  const prepared = await prepare(instructions);
  const output = {
    content: { summary: "Conforms", flag: "green" as const, reasoning: "Synthetic" },
    citations: [{ quote: "keep information confidential" }],
  };
  vi.mocked(queryCell).mockResolvedValueOnce(output);
  await runCell(actor, { reviewId: prepared.reviewId, documentId, columnIndex: 0 });
  expect(vi.mocked(queryCell).mock.calls.at(-1)![0].reviewInstructions).toEqual(instructions);
  vi.mocked(queryRow).mockResolvedValueOnce(new Map([[0, output]]));
  await runDocument(actor, { reviewId: prepared.reviewId, documentId });
  expect(vi.mocked(queryRow).mock.calls.at(-1)![0].reviewInstructions).toEqual(instructions);
  for (const prompt of [
    buildCellPrompt({
      filename: "NDA",
      documentText: "Source",
      columnPrompt: "Rule",
      reviewInstructions: instructions,
    }),
    buildRowPrompt({
      filename: "NDA",
      documentText: "Source",
      columns: [{ index: 0, name: "Rule", prompt: "Rule" }],
      reviewInstructions: instructions,
    }),
  ]) {
    expect(prompt.system).toContain(JSON.stringify(instructions));
    expect(prompt.system).toContain("not approval or authority");
    expect(prompt.system).toContain("return inconclusive rather than guess");
  }
});

test("durable request units bind captured instructions and reject changed context", async () => {
  const prepared = await prepare(instructions);
  const first = await queueReviewRun(actor, {
    reviewId: prepared.reviewId,
    requestId: "synthetic-context-request",
  });
  const queued = await listCommits("tabular_review", prepared.reviewId);
  expect(await getCommitChanges(queued[0]!.id)).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        path: `execution/${first.runId}`,
        after: expect.objectContaining({
          snapshot: expect.objectContaining({ revision: 2, reviewInstructions: instructions }),
        }),
      }),
    ])
  );
  const review = (await getReview(prepared.reviewId))!.review;
  if (review.inputSnapshot?.revision !== 2) throw new Error("Missing V2 snapshot");
  // Simulate unexpected storage drift to prove idempotency and execution fencing, not a supported edit path.
  await db
    .update(tabularReviews)
    .set({
      inputSnapshot: {
        ...review.inputSnapshot,
        reviewInstructions: { ...instructions, disclosureRole: "disclosing" },
      },
    })
    .where(eq(tabularReviews.id, prepared.reviewId));
  await expect(
    queueReviewRun(actor, { reviewId: prepared.reviewId, requestId: "synthetic-context-request" })
  ).rejects.toThrow("request_conflict");
  await db.update(jobs).set({ state: "cancelled" }).where(eq(jobs.artifactId, prepared.reviewId));
});
