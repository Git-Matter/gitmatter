import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { db } from "@workspace/db/client";
import { documents, jobs, jobReceipts, jobUnits, tenants, user } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import {
  acceptExtractionJob,
  cancelJob,
  claimJob,
  completeJob,
  getJob,
  heartbeatJob,
  retryJob,
} from "../src/core/jobs.js";
import { recordCommitInTransaction, listCommits } from "../src/core/commit.js";

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

const userId = `jobs-test-${randomUUID()}`;
let tenantId: string;
const actor = { type: "user" as const, userId };
async function accepted() {
  const [doc] = await db
    .insert(documents)
    .values({ tenantId, userId, title: "Durability fixture", fileType: "docx", status: "pending" })
    .returning();
  const versionId = randomUUID();
  const job = await db.transaction((tx) =>
    acceptExtractionJob(tx, { actor, tenantId, matterId: null, documentId: doc!.id, versionId })
  );
  return { doc: doc!, job, versionId };
}
const apply =
  (documentId: string) => async (tx: Parameters<typeof recordCommitInTransaction>[0]) => {
    const result = await recordCommitInTransaction(tx, {
      actor,
      artifactType: "document",
      artifactId: documentId,
      op: "extract",
      message: "Synthetic durable apply",
      apply: async ({ tx: commitTx }) => {
        await commitTx
          .update(documents)
          .set({ markdown: "Committed result", status: "ready" })
          .where(eq(documents.id, documentId));
        return { changes: [{ path: "markdown", before: null, after: "Committed result" }] };
      },
    });
    return result.commit!.id;
  };

describe("durable work boundaries (real Postgres)", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Jobs integration", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db
      .insert(user)
      .values({ id: userId, email: `${userId}@example.com`, name: "Job fixture", tenantId });
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
  });
  test("accepted input survives independent claim; request conflict cannot switch source", async () => {
    const { doc, job, versionId } = await accepted();
    const duplicate = await db.transaction((tx) =>
      acceptExtractionJob(tx, { actor, tenantId, matterId: null, documentId: doc.id, versionId })
    );
    expect(duplicate.id).toBe(job.id);
    await expect(
      db.transaction((tx) =>
        acceptExtractionJob(tx, {
          actor,
          tenantId,
          matterId: null,
          documentId: doc.id,
          versionId: randomUUID(),
          requestId: job.requestId,
        })
      )
    ).rejects.toThrow("request_conflict");
    const worker = await targetedClaim("worker-independent", doc.id);
    expect(worker?.id).toBe(job.id);
    expect(worker?.leaseEpoch).toBe(1);
    await completeJob(worker!, apply(doc.id));
  });
  test("expired worker is fenced and completion replay creates one commit/checkpoint", async () => {
    const { doc, job } = await accepted();
    const first = await targetedClaim("worker-old", doc.id);
    await db
      .update(jobs)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(jobs.id, job.id));
    const second = await targetedClaim("worker-new", doc.id);
    expect(second!.leaseEpoch).toBe(first!.leaseEpoch + 1);
    expect(await heartbeatJob(first!)).toBe(false);
    await expect(completeJob(first!, apply(doc.id))).rejects.toThrow("lease_lost");
    const commitId = await completeJob(second!, apply(doc.id));
    expect(await completeJob(second!, apply(doc.id))).toBe(commitId);
    expect((await listCommits("document", doc.id)).filter((c) => c.op === "extract")).toHaveLength(
      1
    );
    expect(await db.select().from(jobReceipts).where(eq(jobReceipts.jobId, job.id))).toHaveLength(
      1
    );
    expect(await db.select().from(jobUnits).where(eq(jobUnits.jobId, job.id))).toHaveLength(1);
    expect((await getJob(actor, job.id))?.state).toBe("succeeded");
  });
  test("failed publication rolls back artifact and receipt together", async () => {
    const { doc, job } = await accepted();
    const worker = await targetedClaim("rollback-worker", doc.id);
    await expect(
      completeJob(worker!, async (tx) => {
        await apply(doc.id)(tx);
        throw new Error("Injected failure after legal write");
      })
    ).rejects.toThrow("Injected failure");
    expect(await listCommits("document", doc.id)).toHaveLength(0);
    expect(await db.select().from(jobReceipts).where(eq(jobReceipts.jobId, job.id))).toHaveLength(
      0
    );
    const [current] = await db.select().from(documents).where(eq(documents.id, doc.id));
    expect(current!.markdown).toBeNull();
    await completeJob(worker!, apply(doc.id));
  });
  test("running cancellation prevents apply; queued cancellation prevents claim", async () => {
    const { doc, job } = await accepted();
    const worker = await targetedClaim("cancel-worker", doc.id);
    expect((await cancelJob(actor, job.id))?.cancellationRequestedAt).not.toBeNull();
    await expect(completeJob(worker!, apply(doc.id))).rejects.toThrow("lease_lost");
    await db
      .update(jobs)
      .set({ state: "cancelled", leaseExpiresAt: null })
      .where(eq(jobs.id, job.id));
    const next = await accepted();
    expect((await cancelJob(actor, next.job.id))?.state).toBe("cancelled");
    expect(await claimJob("unused", next.doc.id)).toBeNull();
  });
  test("scoped agents cannot read unfiled jobs or schedule without revocation reference", async () => {
    const { doc, job } = await accepted();
    const scoped = {
      type: "agent" as const,
      userId,
      agentLabel: "scoped",
      scope: { matterIds: [], maxRole: "editor" as const },
    };
    expect(await getJob(scoped, job.id)).toBeNull();
    await expect(
      db.transaction((tx) =>
        acceptExtractionJob(tx, {
          actor: scoped,
          tenantId,
          matterId: null,
          documentId: doc.id,
          versionId: randomUUID(),
        })
      )
    ).rejects.toThrow("access_denied");
    await cancelJob(actor, job.id);
  });
  test("hard extraction reservation cannot overshoot concurrently and duplicate is free", async () => {
    const previous = process.env.EXTRACTION_QUEUE_BUDGET;
    const uniqueUser = `budget-${randomUUID()}`;
    await db
      .insert(user)
      .values({ id: uniqueUser, email: `${uniqueUser}@example.com`, name: "Budget", tenantId });
    const budgetActor = { type: "user" as const, userId: uniqueUser };
    try {
      process.env.EXTRACTION_QUEUE_BUDGET = "1";
      const input = {
        actor: budgetActor,
        tenantId,
        matterId: null,
        documentId: randomUUID(),
        versionId: randomUUID(),
      };
      const results = await Promise.allSettled([
        db.transaction((tx) => acceptExtractionJob(tx, input)),
        db.transaction((tx) =>
          acceptExtractionJob(tx, { ...input, documentId: randomUUID(), versionId: randomUUID() })
        ),
      ]);
      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
      const winner = results.find((r) => r.status === "fulfilled");
      if (winner?.status === "fulfilled") {
        const duplicate = await db.transaction((tx) =>
          acceptExtractionJob(tx, {
            ...input,
            documentId: winner.value.artifactId,
            versionId: winner.value.inputVersionId,
            requestId: winner.value.requestId,
          })
        );
        expect(duplicate.id).toBe(winner.value.id);
      }
    } finally {
      if (previous === undefined) delete process.env.EXTRACTION_QUEUE_BUDGET;
      else process.env.EXTRACTION_QUEUE_BUDGET = previous;
      await db.delete(jobs).where(eq(jobs.userId, uniqueUser));
      await db.delete(user).where(eq(user.id, uniqueUser));
    }
  });
  test("retry never resets lifetime attempt limit", async () => {
    const { doc, job, versionId } = await accepted();
    await db.update(documents).set({ currentVersionId: versionId }).where(eq(documents.id, doc.id));
    await db
      .update(jobs)
      .set({ state: "failed", errorCode: "attempts_exhausted", attempts: 6 })
      .where(eq(jobs.id, job.id));
    await expect(retryJob(actor, job.id)).rejects.toThrow("limit_reached");
  });
});
