import { randomUUID } from "node:crypto";
import { beforeAll, afterAll, describe, expect, test } from "vite-plus/test";
import { db } from "@workspace/db/client";
import { and, eq } from "drizzle-orm";
import {
  approvalProposals,
  jobSpendReservations,
  jobs,
  matterMembers,
  tabularCells,
  tenants,
  usageEvents,
  user,
} from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createDocument } from "../src/content/documents.js";
import { createReview } from "../src/ai/tabular/reviews.js";
import { commitCell, writeCell } from "../src/ai/tabular/runner.js";
import { queueReviewRun, classifyReviewFailure } from "../src/ai/tabular/jobs.js";
import { claimJob, completeJob } from "../src/core/jobs.js";
import { reserveJobSpend, settleJobSpend, estimateReviewRun } from "../src/core/job-spend.js";
import { setApprovalPolicy } from "../src/core/approval.js";
import { getReview } from "../src/ai/tabular/queries.js";
import { DEFAULT_MODEL } from "../src/ai/provider/catalog.js";
import { getReviewCompletion } from "../src/ai/tabular/contract-review.js";

// Other integration files use the same real capacity pool. Wait for a slot,
// but keep the artifact filter so this test never claims another fixture.
async function targetedClaim(...args: Parameters<typeof claimJob>) {
  for (let attempt = 0; attempt < 150; attempt++) {
    const job = await claimJob(...args);
    if (job) return job;
    await new Promise<void>((resolve) => setTimeout(resolve, 20));
  }
  throw new Error("Timed out waiting for a test worker slot");
}

const userId = `review-jobs-${randomUUID()}`;
const actor = { type: "user" as const, userId };
let tenantId: string;
let clientId: string;
async function fixture() {
  const matter = await createMatter(userId, { clientId, name: "Durable review" });
  const doc = await createDocument(userId, {
    title: "Source",
    markdown: "The term is two years.",
    matterId: matter.id,
  });
  const id = await createReview(actor, {
    title: "Review",
    matterId: matter.id,
    documentIds: [doc.id],
    columnsConfig: [{ index: 0, name: "Term", prompt: "Find the term" }],
  });
  return { matter, doc, id };
}
describe("durable review and spend boundaries", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Durable review tests", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db
      .insert(user)
      .values({ id: userId, name: "Reviewer", email: `${userId}@example.com`, tenantId });
    clientId = (await createClient(userId, tenantId, { name: "Synthetic" })).id;
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
  });
  test("bulk acceptance freezes ad-hoc sources and request replay returns same logical run", async () => {
    const f = await fixture();
    const first = await queueReviewRun(actor, { reviewId: f.id, requestId: "same-request" });
    const replay = await queueReviewRun(actor, { reviewId: f.id, requestId: "same-request" });
    expect(replay.runId).toBe(first.runId);
    expect(replay.jobIds).toEqual(first.jobIds);
    expect((await getReview(f.id))?.review.inputSnapshot?.documents[0]?.text).toBe(f.doc.markdown);
    await expect(
      queueReviewRun(actor, {
        reviewId: f.id,
        requestId: "same-request",
        model: "claude-haiku-4-5",
      })
    ).rejects.toThrow("request_conflict");
    await db.update(jobs).set({ state: "cancelled" }).where(eq(jobs.artifactId, f.id));
  });
  test("paid inference execution can succeed while exact proposal preserves accepted green content", async () => {
    const f = await fixture();
    await writeCell(actor, {
      reviewId: f.id,
      documentId: f.doc.id,
      columnIndex: 0,
      summary: "Accepted green",
      flag: "green",
      reasoning: "human",
      citations: [{ quote: "two years" }],
    });
    await setApprovalPolicy(actor, f.matter.id, {
      expectedRevision: 0,
      reason: "Require review",
      policy: { agentCells: "editor" },
    });
    await queueReviewRun(actor, { reviewId: f.id, requestId: "proposal-run" });
    const job = await targetedClaim("synthetic-review-worker", f.id, "review_cell");
    const review = (await getReview(f.id))!.review;
    const applied = await completeJob(job!, async (tx) => {
      const result = await commitCell(
        { type: "agent", userId, agentLabel: "review-worker" },
        {
          review,
          reviewId: f.id,
          documentId: f.doc.id,
          columnIndex: 0,
          columnName: "Term",
          docTitle: "Source",
          content: { summary: "Proposed red", flag: "red", reasoning: "Needs decision" },
          citations: [{ quote: "two years" }],
          expectedCellCommitId: job!.baseCellCommitId,
        },
        tx
      );
      return result.commit!.id;
    });
    expect(applied).toBeTruthy();
    const [cell] = await db.select().from(tabularCells).where(eq(tabularCells.reviewId, f.id));
    expect(cell!.content?.summary).toBe("Accepted green");
    const [proposal] = await db
      .select()
      .from(approvalProposals)
      .where(eq(approvalProposals.artifactId, f.id));
    expect(proposal!.status).toBe("pending");
    expect(proposal!.kind).toBe("cell");
    if (!("content" in proposal!.payload)) throw new Error("Expected cell proposal");
    expect(proposal!.payload.content.summary).toBe("Proposed red");
    const completion = await getReviewCompletion(actor, f.id);
    expect(completion!.documents[0]!.pendingApprovals).toBe(1);
    expect(completion!.cleanReady).toBe(false);
  });
  test("concurrent provider reservations cannot exceed a user token cap; known usage deduplicates", async () => {
    const oldBudget = process.env.USER_LLM_TOKEN_BUDGET;
    const oldConcurrency = process.env.JOB_USER_CONCURRENCY;
    const f = await fixture();
    const g = await fixture();
    try {
      process.env.USER_LLM_TOKEN_BUDGET = "20";
      process.env.JOB_USER_CONCURRENCY = "2";
      await queueReviewRun(actor, { reviewId: f.id });
      await queueReviewRun(actor, { reviewId: g.id });
      const first = await targetedClaim("budget-a", f.id, "review_cell");
      const second = await targetedClaim("budget-b", g.id, "review_cell");
      expect(first).not.toBeNull();
      expect(second).not.toBeNull();
      const results = await Promise.allSettled([
        reserveJobSpend(first!, 10, 5),
        reserveJobSpend(second!, 10, 5),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      const known = results[0]!.status === "fulfilled" ? first! : second!;
      const usage = { provider: "anthropic", model: known.model!, inputTokens: 8, outputTokens: 4 };
      await settleJobSpend(known, usage);
      await settleJobSpend(known, usage);
      expect(
        await db
          .select()
          .from(usageEvents)
          .where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, "llm")))
      ).toHaveLength(1);
      const [reservation] = await db
        .select()
        .from(jobSpendReservations)
        .where(eq(jobSpendReservations.jobId, known.id));
      expect(reservation!.state).toBe("settled");
      expect(reservation!.actualTokens).toBe(12);
    } finally {
      if (oldBudget === undefined) delete process.env.USER_LLM_TOKEN_BUDGET;
      else process.env.USER_LLM_TOKEN_BUDGET = oldBudget;
      if (oldConcurrency === undefined) delete process.env.JOB_USER_CONCURRENCY;
      else process.env.JOB_USER_CONCURRENCY = oldConcurrency;
      await db.update(jobs).set({ state: "cancelled" }).where(eq(jobs.userId, userId));
    }
  });
  test("unpriced estimates are explicit; ambiguous paid faults do not automatically spend again", () => {
    expect(
      estimateReviewRun("unpriced/model", [{ system: "source", user: "rule" }]).costUsd
    ).toBeNull();
    expect(
      estimateReviewRun(DEFAULT_MODEL, [{ system: "source", user: "rule" }]).costLimitScope
    ).toBe("application_llm");
    expect(
      classifyReviewFailure({ status: 429, headers: { get: () => "120" } }, true, false)
    ).toMatchObject({
      code: "provider_unavailable",
      retryable: true,
      noCharge: true,
      retryAfterSeconds: 60,
    });
    expect(classifyReviewFailure({ status: 504 }, true, false)).toMatchObject({
      code: "provider_outcome_unknown",
      retryable: false,
      noCharge: false,
    });
  });
  test("membership removal after claim stops legal publication even for the intrinsic review owner", async () => {
    const f = await fixture();
    await queueReviewRun(actor, { reviewId: f.id });
    const job = await targetedClaim("revoked-membership", f.id, "review_cell");
    await db
      .delete(matterMembers)
      .where(and(eq(matterMembers.matterId, f.matter.id), eq(matterMembers.userId, userId)));
    await expect(
      completeJob(job, async () => {
        throw new Error("Apply must not execute");
      })
    ).rejects.toThrow("access_denied");
    await db.update(jobs).set({ state: "cancelled" }).where(eq(jobs.id, job.id));
  });
});
