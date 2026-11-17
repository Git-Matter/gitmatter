import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  auditEvents,
  jobs,
  jobSpendReservations,
  jobNotifications,
  jobNotificationReads,
  tenants,
  user,
} from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createDocument } from "../src/content/documents.js";
import { createReview } from "../src/ai/tabular/reviews.js";
import { queueReviewRun } from "../src/ai/tabular/jobs.js";
import {
  cancelJob,
  claimJob,
  listMatterJobs,
  retryJob,
  getJob,
  listJobNotifications,
  markJobNotificationRead,
} from "../src/core/jobs.js";
import {
  defaultJobControls,
  getJobControls,
  listJobUsageAttribution,
  setJobControls,
} from "../src/core/job-controls.js";
import { listCommits } from "../src/core/commit.js";
import { reserveJobSpend, dispatchProviderSpend, settleJobSpend } from "../src/core/job-spend.js";
import { failJob } from "../src/core/jobs.js";

const userId = `job-controls-${randomUUID()}`;
const memberId = `job-member-${randomUUID()}`;
const actor = { type: "user" as const, userId };
let tenantId: string;
let clientId: string;
async function fixture(columns = 1) {
  const matter = await createMatter(userId, { clientId, name: "Controls fixture" });
  const doc = await createDocument(userId, {
    title: "NDA",
    markdown: "The term is two years.",
    matterId: matter.id,
  });
  const id = await createReview(actor, {
    title: "Review",
    matterId: matter.id,
    documentIds: [doc.id],
    columnsConfig: Array.from({ length: columns }, (_, index) => ({
      index,
      name: `Rule ${index}`,
      prompt: "Find the term",
    })),
  });
  return { matter, doc, id };
}

describe("durable review operator controls (real Postgres)", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Controls tests", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values([
      { id: userId, name: "Admin", email: `${userId}@example.com`, tenantId, tenantRole: "admin" },
      { id: memberId, name: "Member", email: `${memberId}@example.com`, tenantId },
    ]);
    clientId = (await createClient(userId, tenantId, { name: "Synthetic" })).id;
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(user).where(eq(user.id, memberId));
  });

  test("settings are human-admin-only, revision-fenced and atomically audited", async () => {
    await expect(getJobControls({ type: "user", userId: memberId })).rejects.toThrow(
      "access_denied"
    );
    await expect(
      getJobControls({ type: "agent", userId, agentLabel: "admin-agent" })
    ).rejects.toThrow("access_denied");
    const policy = {
      ...defaultJobControls(),
      tenantConcurrency: 3,
      userConcurrency: 3,
      providerConcurrency: { anthropic: 1, gemini: 1, openai: 1, openrouter: 1 },
    };
    const updated = await setJobControls(actor, {
      expectedRevision: 0,
      reason: "Limit paid provider dispatch",
      policy,
    });
    expect(updated.revision).toBe(1);
    expect(updated.effective.providerConcurrency.anthropic).toBe(1);
    await expect(
      setJobControls(actor, { expectedRevision: 0, reason: "Stale editor", policy })
    ).rejects.toThrow("stale_source");
    const events = await db
      .select()
      .from(auditEvents)
      .where(
        and(eq(auditEvents.tenantId, tenantId), eq(auditEvents.eventType, "job.controls_updated"))
      );
    expect(events).toHaveLength(1);
    expect(events[0]!.actorId).toBe(userId);
  });

  test("provider capacity serializes claims independently of user capacity", async () => {
    const f = await fixture(2);
    const accepted = await queueReviewRun(actor, { reviewId: f.id });
    const first = await claimJob("capacity-a", f.id, "review_cell");
    expect(first).not.toBeNull();
    expect(await claimJob("capacity-b", f.id, "review_cell")).toBeNull();
    await db
      .update(jobs)
      .set({ state: "failed", errorCode: "provider_unavailable", leaseExpiresAt: null })
      .where(eq(jobs.id, first!.id));
    expect(await claimJob("capacity-c", f.id, "review_cell")).not.toBeNull();
    await db
      .update(jobs)
      .set({ state: "cancelled", leaseExpiresAt: null })
      .where(eq(jobs.artifactId, f.id));
    expect(accepted.jobIds).toHaveLength(2);
  });

  test("failed-rule retry retains job identity and successes, exact replay and unknown paid acknowledgement", async () => {
    const f = await fixture(2);
    const accepted = await queueReviewRun(actor, { reviewId: f.id, requestId: "original" });
    await db
      .update(jobs)
      .set({ state: "succeeded", resultCommitId: randomUUID() })
      .where(eq(jobs.id, accepted.jobIds[0]!));
    await db
      .update(jobs)
      .set({ state: "failed", attempts: 3, errorCode: "provider_outcome_unknown" })
      .where(eq(jobs.id, accepted.jobIds[1]!));
    await expect(
      queueReviewRun(actor, { reviewId: f.id, mode: "failed", requestId: "retry" })
    ).rejects.toThrow("provider_outcome_unknown");
    const retried = await queueReviewRun(actor, {
      reviewId: f.id,
      mode: "failed",
      requestId: "retry",
      acknowledgeUnknown: true,
    });
    expect(retried.jobIds).toEqual([accepted.jobIds[1]]);
    expect(
      (
        await queueReviewRun(actor, {
          reviewId: f.id,
          mode: "failed",
          requestId: "retry",
          acknowledgeUnknown: true,
        })
      ).jobIds
    ).toEqual(retried.jobIds);
    const [job] = await db.select().from(jobs).where(eq(jobs.id, accepted.jobIds[1]!));
    expect(job!.attempts).toBe(3);
    expect(job!.maxAttempts).toBe(6);
    expect(
      (await listCommits("tabular_review", f.id)).filter((c) => c.op === "run_retried")
    ).toHaveLength(1);
    await cancelJob(actor, job!.id);
    expect(
      (await listCommits("tabular_review", f.id)).some((c) => c.op === "run_cancel_requested")
    ).toBe(true);
    await db
      .update(jobs)
      .set({ state: "failed", attempts: 6, errorCode: "provider_unavailable" })
      .where(eq(jobs.id, job!.id));
    await expect(retryJob(actor, job!.id, { requestId: "lifetime-limit" })).rejects.toThrow(
      "limit_reached"
    );
  });

  test("expired dispatched worker never automatically buys a second inference; pre-dispatch recovery is free", async () => {
    const f = await fixture();
    const run = await queueReviewRun(actor, { reviewId: f.id });
    const first = (await claimJob("paid-crash", f.id, "review_cell"))!;
    const held = await reserveJobSpend(first, 10, 10);
    await dispatchProviderSpend(held.id, actor, first.model!);
    await db
      .update(jobs)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(jobs.id, first.id));
    expect(await claimJob("automatic-recovery", f.id, "review_cell")).toBeNull();
    const blocked = (await getJob(actor, first.id))!;
    expect(blocked.state).toBe("failed");
    expect(blocked.errorCode).toBe("provider_outcome_unknown");
    expect(blocked.attempts).toBe(1);
    expect(
      (await db.select().from(jobSpendReservations).where(eq(jobSpendReservations.id, held.id)))[0]!
        .state
    ).toBe("unknown");
    await expect(retryJob(actor, first.id)).rejects.toThrow("provider_outcome_unknown");
    await retryJob(actor, first.id, {
      acknowledgeUnknown: true,
      requestId: "manual-paid-recovery",
    });
    const manual = (await claimJob("acknowledged-recovery", f.id, "review_cell"))!;
    expect(manual.leaseEpoch).toBe(first.leaseEpoch + 1);
    await failJob(manual, "provider_unavailable", false);
    const g = await fixture();
    await queueReviewRun(actor, { reviewId: g.id });
    const neverDispatched = (await claimJob("before-dispatch", g.id, "review_cell"))!;
    const unused = await reserveJobSpend(neverDispatched, 10, 10);
    await db
      .update(jobs)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(jobs.id, neverDispatched.id));
    const resumed = (await claimJob("safe-free-recovery", g.id, "review_cell"))!;
    expect(resumed.leaseEpoch).toBe(neverDispatched.leaseEpoch + 1);
    expect(
      (
        await db.select().from(jobSpendReservations).where(eq(jobSpendReservations.id, unused.id))
      )[0]!.state
    ).toBe("released");
    await failJob(resumed, "provider_unavailable", false);
    expect(
      (await listCommits("tabular_review", f.id)).some((c) => c.op === "run_outcome_unknown")
    ).toBe(true);
    expect(run.jobIds).toContain(first.id);
  });

  test("paid usage without a persisted legal result also blocks automatic regeneration", async () => {
    const f = await fixture();
    await queueReviewRun(actor, { reviewId: f.id });
    const first = (await claimJob("settled-no-result", f.id, "review_cell"))!;
    const spend = await reserveJobSpend(first, 10, 10);
    await dispatchProviderSpend(spend.id, actor, first.model!);
    await settleJobSpend(first, {
      provider: "anthropic",
      model: first.model!,
      inputTokens: 8,
      outputTokens: 3,
    });
    await db
      .update(jobs)
      .set({ leaseExpiresAt: sql`now() - interval '1 second'` })
      .where(eq(jobs.id, first.id));
    expect(await claimJob("paid-output-lost", f.id, "review_cell")).toBeNull();
    expect((await getJob(actor, first.id))!.errorCode).toBe("provider_outcome_unknown");
    expect(
      (
        await db.select().from(jobSpendReservations).where(eq(jobSpendReservations.id, spend.id))
      )[0]!.state
    ).toBe("settled");
  });

  test("outbox replay survives reconnect and hidden events cannot starve pagination", async () => {
    const f = await fixture();
    const run = await queueReviewRun(actor, { reviewId: f.id });
    await cancelJob(actor, run.jobIds[0]!);
    await cancelJob(actor, run.jobIds[0]!);
    const visible = (await listJobNotifications(actor, f.matter.id))!;
    expect(visible.events).toHaveLength(1);
    const visibleId = visible.events[0]!.id;
    expect(await markJobNotificationRead(actor, visibleId)).toBe(true);
    expect(await markJobNotificationRead(actor, visibleId)).toBe(true);
    expect(
      await db
        .select()
        .from(jobNotificationReads)
        .where(eq(jobNotificationReads.notificationId, visibleId))
    ).toHaveLength(1);
    expect((await listJobNotifications(actor, f.matter.id))!.events[0]!.read).toBe(true);
    const [hiddenJob] = await db
      .insert(jobs)
      .values({
        kind: "review_cell",
        artifactType: "tabular_review",
        artifactId: randomUUID(),
        tenantId,
        userId,
        actor,
        matterId: f.matter.id,
        inputVersionId: randomUUID(),
        requestId: randomUUID(),
        fingerprint: "synthetic-hidden",
        state: "failed",
      })
      .returning();
    const payload = (await getJob(actor, run.jobIds[0]!))!;
    const hiddenEvents = await db
      .insert(jobNotifications)
      .values(
        Array.from({ length: 150 }, (_, revision) => ({
          jobId: hiddenJob!.id,
          tenantId,
          matterId: f.matter.id,
          revision,
          payload: { ...payload, id: hiddenJob!.id, artifactId: hiddenJob!.artifactId },
        }))
      )
      .returning({ id: jobNotifications.id });
    expect(
      (await listJobNotifications(actor, f.matter.id))!.events.map((event) => event.id)
    ).toEqual([visibleId]);
    await expect(listJobNotifications(actor, f.matter.id, hiddenEvents[0]!.id)).rejects.toThrow(
      "input_not_ready"
    );
    expect(await listJobNotifications({ type: "user", userId: memberId }, f.matter.id)).toBeNull();
    expect(await markJobNotificationRead({ type: "user", userId: memberId }, visibleId)).toBe(
      false
    );
  });

  test("matter jobs and admin attribution keep hidden matter IDs private and held uncertainty visible", async () => {
    const f = await fixture();
    const run = await queueReviewRun(actor, { reviewId: f.id });
    await db.insert(jobSpendReservations).values({
      jobId: run.jobIds[0]!,
      leaseEpoch: 1,
      tenantId,
      userId,
      matterId: f.matter.id,
      model: "unpriced/model",
      reservedTokens: 100,
      state: "unknown",
    });
    expect(await listMatterJobs({ type: "user", userId: memberId }, f.matter.id)).toBeNull();
    const summary = await listMatterJobs(actor, f.matter.id);
    expect(summary!.spend).toMatchObject({ heldTokens: 100, unpricedAttempts: 1 });
    await db.update(user).set({ tenantRole: "admin" }).where(eq(user.id, memberId));
    const hidden = await listJobUsageAttribution({ type: "user", userId: memberId });
    expect(hidden.find((r) => r.model === "unpriced/model")?.matterId).toBeNull();
    expect(hidden.find((r) => r.model === "unpriced/model")?.heldTokens).toBe(100);
    await db
      .update(jobs)
      .set({ state: "cancelled", leaseExpiresAt: null })
      .where(eq(jobs.artifactId, f.id));
  });
});
