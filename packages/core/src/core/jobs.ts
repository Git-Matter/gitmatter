import { canonicalFingerprint } from "./fingerprint.js";
import { and, eq, sql } from "drizzle-orm";
import { db, type DB, type Tx } from "@workspace/db/client";
import {
  documents,
  jobs,
  jobReceipts,
  jobUnits,
  jobSpendReservations,
  mcpAccessTokens,
  user,
  type DurableJob,
} from "@workspace/db/schema";
import type { JobErrorCode, JobSnapshot } from "@workspace/contracts";
import {
  canAccessArtifact,
  canReadDocument,
  getUserTenant,
  hasMatterAccessInTransaction,
  sameTenant,
} from "./access.js";
import { recordCommitInTransaction, type Actor } from "./commit.js";
import { getEnvNumber } from "./config.js";

export class JobError extends Error {
  constructor(readonly code: JobErrorCode | "request_conflict" | "lease_lost") {
    super(code);
    this.name = "JobError";
  }
}

/** Accept under the caller's artifact transaction. Duplicate request IDs never change inputs. */
export async function acceptExtractionJob(
  tx: Tx,
  input: {
    actor: Actor;
    tenantId: string;
    matterId: string | null;
    documentId: string;
    versionId: string;
    requestId?: string;
    credentialId?: string;
  }
) {
  if (input.actor.type === "agent" && !input.credentialId) throw new JobError("access_denied");
  const requestId = input.requestId ?? `extract:${input.documentId}:${input.versionId}`;
  const fingerprint = canonicalFingerprint({
    documentId: input.documentId,
    versionId: input.versionId,
    actor: input.actor,
    credentialId: input.credentialId ?? null,
  });
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`job-accept:${input.tenantId}:${input.actor.userId}`}))`
  );
  const [existing] = await tx
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.tenantId, input.tenantId),
        eq(jobs.userId, input.actor.userId),
        eq(jobs.kind, "document_extraction"),
        eq(jobs.requestId, requestId)
      )
    );
  if (existing) {
    if (existing.fingerprint !== fingerprint) throw new JobError("request_conflict");
    return existing;
  }
  // The existing extraction budget now rejects before accepted work. The lock
  // serializes reservations, so concurrent uploads cannot pass the same slot.
  const budget = getEnvNumber("EXTRACTION_QUEUE_BUDGET", 0);
  if (budget > 0) {
    const minutes = getEnvNumber("BUDGET_WINDOW_MINUTES", 60);
    const [used] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(
        and(
          eq(jobs.userId, input.actor.userId),
          eq(jobs.kind, "document_extraction"),
          sql`${jobs.createdAt} >= now() - (${minutes} * interval '1 minute')`
        )
      );
    if (Number(used?.count ?? 0) >= budget) throw new JobError("limit_reached");
  }
  const [accepted] = await tx
    .insert(jobs)
    .values({
      kind: "document_extraction",
      tenantId: input.tenantId,
      matterId: input.matterId,
      artifactId: input.documentId,
      userId: input.actor.userId,
      actor: input.actor,
      credentialId: input.credentialId,
      inputVersionId: input.versionId,
      requestId,
      fingerprint,
    })
    .returning();
  return accepted!;
}

/** Re-read user/token metadata, intersect accepted scope with current scope. */
export async function authorizeJob(job: DurableJob, reader: DB | Tx = db): Promise<Actor> {
  if (!(await sameTenant(job.userId, job.tenantId, reader))) throw new JobError("access_denied");
  let actor: Actor = job.actor;
  if (actor.type === "agent") {
    if (!job.credentialId) throw new JobError("access_denied");
    const [token] = await reader
      .select({
        userId: mcpAccessTokens.userId,
        revokedAt: mcpAccessTokens.revokedAt,
        matterIds: mcpAccessTokens.allowedMatterIds,
        maxRole: mcpAccessTokens.maxRole,
      })
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.id, job.credentialId));
    if (!token || token.revokedAt || token.userId !== actor.userId)
      throw new JobError("access_denied");
    const previous = actor.scope;
    const matterIds = previous?.matterIds
      ? previous.matterIds.filter((id) => !token.matterIds || token.matterIds.includes(id))
      : token.matterIds;
    const roles = ["viewer", "editor", "owner"] as const;
    const rank = Math.min(
      previous?.maxRole ? roles.indexOf(previous.maxRole) : 2,
      token.maxRole ? roles.indexOf(token.maxRole) : 2
    );
    actor = { ...actor, scope: { matterIds, maxRole: roles[rank]! } };
  }
  if (!(await canAccessArtifact(actor, job.artifactType, job.artifactId, "editor", reader)))
    throw new JobError("access_denied");
  if (job.sourceDocumentId && !(await canReadDocument(actor, job.sourceDocumentId, reader)))
    throw new JobError("access_denied");
  return actor;
}

/** Keep account, credential and membership stable through legal publication. */
export async function authorizeJobInTransaction(tx: Tx, job: DurableJob): Promise<Actor> {
  await tx.select({ id: user.id }).from(user).where(eq(user.id, job.userId)).for("share");
  if (job.credentialId)
    await tx
      .select({ id: mcpAccessTokens.id })
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.id, job.credentialId))
      .for("share");
  const actor = await authorizeJob(job, tx);
  if (job.matterId && !(await hasMatterAccessInTransaction(tx, actor, job.matterId, "editor")))
    throw new JobError("access_denied");
  return actor;
}

export async function claimJob(
  workerId: string,
  documentId?: string,
  kind: DurableJob["kind"] = "document_extraction"
): Promise<DurableJob | null> {
  return db.transaction(async (tx) => {
    // All instances reserve capacity under one short transaction lock. Never
    // hold this lock across extraction/storage/provider work.
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('durable-job-capacity'))`);
    const globalLimit = Math.max(1, getEnvNumber("JOB_GLOBAL_CONCURRENCY", 4));
    const tenantLimit = Math.max(1, getEnvNumber("JOB_TENANT_CONCURRENCY", 2));
    const userLimit = Math.max(1, getEnvNumber("JOB_USER_CONCURRENCY", 1));
    const leaseSeconds = Math.max(10, getEnvNumber("JOB_LEASE_SECONDS", 30));
    const [active] = await tx
      .select({ count: sql<number>`count(*)::int` })
      .from(jobs)
      .where(sql`${jobs.state} = 'running' and ${jobs.leaseExpiresAt} > now()`);
    if (Number(active?.count ?? 0) >= globalLimit) return null;
    const rows = await tx.execute(sql`
      select j.* from jobs j
      where j.kind = ${kind}
        and ((j.state = 'queued' and j.next_attempt_at <= now())
          or (j.state = 'running' and j.lease_expires_at <= now()))
        and ${documentId ? sql`j.artifact_id = ${documentId}` : sql`true`}
        and (select count(*) from jobs a where a.state = 'running'
          and a.lease_expires_at > now() and a.tenant_id = j.tenant_id) < ${tenantLimit}
        and (select count(*) from jobs a where a.state = 'running'
          and a.lease_expires_at > now() and a.user_id = j.user_id) < ${userLimit}
      order by (select max(a.updated_at) from jobs a where a.tenant_id = j.tenant_id and a.attempts > 0) nulls first, j.next_attempt_at, j.created_at
      for update of j skip locked limit 1
    `);
    const candidate = rows[0] as { id?: string } | undefined;
    if (!candidate?.id) return null;
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, candidate.id));
    if (!job) return null;
    if (job.cancellationRequestedAt) {
      await tx
        .update(jobs)
        .set({
          state: "cancelled",
          errorCode: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          revision: sql`${jobs.revision} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(jobs.id, job.id));
      return null;
    }
    const [claimed] = await tx
      .update(jobs)
      .set({
        state: "running",
        leaseOwner: workerId,
        leaseEpoch: sql`${jobs.leaseEpoch} + 1`,
        attempts: sql`${jobs.attempts} + 1`,
        revision: sql`${jobs.revision} + 1`,
        leaseExpiresAt: sql`now() + (${leaseSeconds} * interval '1 second')`,
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, job.id))
      .returning();
    return claimed!;
  });
}

export async function heartbeatJob(job: DurableJob): Promise<boolean> {
  const seconds = Math.max(10, getEnvNumber("JOB_LEASE_SECONDS", 30));
  const rows = await db
    .update(jobs)
    .set({ leaseExpiresAt: sql`now() + (${seconds} * interval '1 second')`, updatedAt: sql`now()` })
    .where(
      and(
        eq(jobs.id, job.id),
        eq(jobs.state, "running"),
        eq(jobs.leaseEpoch, job.leaseEpoch),
        eq(jobs.leaseOwner, job.leaseOwner!),
        sql`${jobs.leaseExpiresAt} > now()`,
        sql`${jobs.cancellationRequestedAt} is null`
      )
    )
    .returning({ id: jobs.id });
  return rows.length === 1;
}

export async function lockJobLease(tx: Tx, job: DurableJob, allowCancellation = false) {
  const [current] = await tx
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.id, job.id),
        eq(jobs.state, "running"),
        eq(jobs.leaseEpoch, job.leaseEpoch),
        eq(jobs.leaseOwner, job.leaseOwner!),
        sql`${jobs.leaseExpiresAt} > now()`
      )
    )
    .for("update");
  if (!current) throw new JobError("lease_lost");
  if (!allowCancellation && current.cancellationRequestedAt) throw new JobError("lease_lost");
  return current;
}

/** Legal apply, receipt, checkpoint and terminal state share one transaction. */
export async function completeJob(
  job: DurableJob,
  apply: (tx: Tx, actor: Actor) => Promise<string>
) {
  return db.transaction(async (tx) => {
    await tx.select({ id: jobs.id }).from(jobs).where(eq(jobs.id, job.id)).for("update");
    const [receipt] = await tx
      .select()
      .from(jobReceipts)
      .where(and(eq(jobReceipts.jobId, job.id), eq(jobReceipts.operationKey, job.kind)));
    if (receipt) {
      // Replays still require live authorization, even though there is no mutation.
      await authorizeJob(job, tx);
      return receipt.commitId;
    }
    const current = await lockJobLease(tx, job);
    const actor = await authorizeJobInTransaction(tx, current);
    const commitId = await apply(tx, actor);
    await tx.insert(jobReceipts).values({ jobId: job.id, operationKey: job.kind, commitId });
    await tx.insert(jobUnits).values({
      jobId: job.id,
      unitKey: `${job.inputVersionId}:${job.columnIndex ?? "source"}`,
      commitId,
    });
    await tx
      .update(jobs)
      .set({
        state: "succeeded",
        resultCommitId: commitId,
        errorCode: null,
        leaseOwner: null,
        leaseExpiresAt: null,
        revision: sql`${jobs.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, job.id));
    return commitId;
  });
}

export async function failJob(
  job: DurableJob,
  errorCode: JobErrorCode,
  retryable: boolean,
  onTerminal?: (tx: Tx, state: "failed" | "cancelled") => Promise<void>,
  retryAfterSeconds?: number
) {
  return db.transaction(async (tx) => {
    const current = await lockJobLease(tx, job, true);
    const cancelled = !!current.cancellationRequestedAt;
    const retry = !cancelled && retryable && current.attempts < current.maxAttempts;
    const state = cancelled ? "cancelled" : retry ? "queued" : "failed";
    if (!retry && onTerminal) await onTerminal(tx, state as "failed" | "cancelled");
    const delay = Math.min(
      60,
      retryAfterSeconds !== undefined && Number.isFinite(retryAfterSeconds)
        ? Math.max(0, retryAfterSeconds)
        : 2 ** current.attempts + Math.floor(Math.random() * 3)
    );
    await tx
      .update(jobs)
      .set({
        state,
        errorCode: cancelled ? null : errorCode,
        leaseOwner: null,
        leaseExpiresAt: null,
        revision: sql`${jobs.revision} + 1`,
        updatedAt: sql`now()`,
        nextAttemptAt: sql`now() + (${delay} * interval '1 second')`,
      })
      .where(eq(jobs.id, job.id));
  });
}

function snapshot(job: DurableJob): JobSnapshot {
  return {
    id: job.id,
    kind: job.kind,
    documentId: job.sourceDocumentId ?? job.artifactId,
    columnIndex: job.columnIndex,
    artifactId: job.artifactId,
    state: job.state,
    revision: job.revision,
    attempts: job.attempts,
    maxAttempts: job.maxAttempts,
    completed: job.resultCommitId ? 1 : 0,
    total: 1,
    errorCode: job.errorCode as JobErrorCode | null,
    nextAttemptAt: job.nextAttemptAt.toISOString(),
    cancellationRequestedAt: job.cancellationRequestedAt?.toISOString() ?? null,
    resultCommitId: job.resultCommitId,
    updatedAt: job.updatedAt.toISOString(),
  };
}

export async function getJob(actor: Actor, id: string): Promise<JobSnapshot | null> {
  const [job] = await db.select().from(jobs).where(eq(jobs.id, id));
  if (
    !job ||
    !(await sameTenant(actor.userId, job.tenantId)) ||
    !(await canAccessArtifact(actor, job.artifactType, job.artifactId))
  )
    return null;
  const spending = await db
    .select()
    .from(jobSpendReservations)
    .where(eq(jobSpendReservations.jobId, id));
  const known = spending.filter((r) => r.state === "settled");
  const held = spending.filter((r) => r.state === "reserved" || r.state === "unknown");
  return {
    ...snapshot(job),
    usage: {
      uncertainAttempts: held.length,
      knownTokens: known.reduce((n, r) => n + (r.actualTokens ?? 0), 0),
      heldTokenEstimate: held.reduce((n, r) => n + r.reservedTokens, 0),
      knownEstimatedUsd:
        known.length && known.every((r) => r.actualUsd !== null)
          ? known.reduce((n, r) => n + r.actualUsd!, 0)
          : null,
      heldEstimatedUsd:
        held.length && held.every((r) => r.reservedUsd !== null)
          ? held.reduce((n, r) => n + r.reservedUsd!, 0)
          : null,
    },
  };
}

export async function listDocumentJobs(actor: Actor, documentId: string): Promise<JobSnapshot[]> {
  if (!(await canAccessArtifact(actor, "document", documentId))) return [];
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.artifactId, documentId),
        eq(
          jobs.tenantId,
          (await getUserTenant(actor.userId)) ?? "00000000-0000-0000-0000-000000000000"
        )
      )
    )
    .orderBy(sql`${jobs.createdAt} desc`)
    .limit(20);
  return rows.map(snapshot);
}

export async function cancelJob(actor: Actor, id: string): Promise<JobSnapshot | null> {
  return db
    .transaction(async (tx) => {
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for("update");
      if (
        !job ||
        !(await sameTenant(actor.userId, job.tenantId, tx)) ||
        !(await canAccessArtifact(actor, job.artifactType, job.artifactId, "editor", tx))
      )
        return null;
      if (job.state === "queued" || job.state === "running") {
        if (job.state === "queued" && job.kind === "document_extraction")
          await recordCommitInTransaction(tx, {
            artifactType: "document",
            artifactId: job.artifactId,
            actor,
            op: "extraction_cancelled",
            message: "Cancelled queued source extraction",
            skipIfNoChanges: true,
            apply: async ({ tx: commitTx }) => {
              const [doc] = await commitTx
                .select()
                .from(documents)
                .where(eq(documents.id, job.artifactId));
              if (!doc || doc.deletedAt || doc.currentVersionId !== job.inputVersionId)
                return { changes: [] };
              await commitTx
                .update(documents)
                .set({ status: "failed", extractionError: "Extraction cancelled", claimedAt: null })
                .where(eq(documents.id, doc.id));
              return { changes: [{ path: "status", before: doc.status, after: "failed" }] };
            },
          });

        await tx
          .update(jobs)
          .set({
            cancellationRequestedAt: sql`now()`,
            state: job.state === "queued" ? "cancelled" : "running",
            revision: sql`${jobs.revision} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(jobs.id, id));
      }
      return snapshot(job);
    })
    .then(async (result) => (result ? getJob(actor, id) : null));
}

export async function retryJob(actor: Actor, id: string): Promise<JobSnapshot | null> {
  await db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for("update");
    if (
      !job ||
      !(await sameTenant(actor.userId, job.tenantId, tx)) ||
      !(await canAccessArtifact(actor, job.artifactType, job.artifactId, "editor", tx))
    )
      throw new JobError("access_denied");
    if (
      job.state !== "failed" ||
      ![
        "storage_unavailable",
        "extraction_failed",
        "attempts_exhausted",
        "provider_unavailable",
        "provider_outcome_unknown",
      ].includes(job.errorCode ?? "")
    )
      throw new JobError("input_not_ready");
    const [doc] = await tx
      .select({ versionId: documents.currentVersionId, headId: documents.headCommitId })
      .from(documents)
      .where(eq(documents.id, job.sourceDocumentId ?? job.artifactId));
    if (!doc || (doc.versionId ?? doc.headId ?? job.sourceDocumentId) !== job.inputVersionId)
      throw new JobError("stale_source");
    await authorizeJob(job, tx);
    // Manual retries are bounded over the life of this logical run; they never
    // erase attempts/receipts or silently start a new chargeable operation.
    if (job.attempts >= 6) throw new JobError("limit_reached");
    if (job.kind === "document_extraction")
      await recordCommitInTransaction(tx, {
        artifactType: "document",
        artifactId: job.artifactId,
        actor,
        op: "extraction_retried",
        message: "Retried source extraction",
        apply: async ({ tx: commitTx }) => {
          const [current] = await commitTx
            .select()
            .from(documents)
            .where(eq(documents.id, job.artifactId));
          if (!current || current.deletedAt || current.currentVersionId !== job.inputVersionId)
            throw new JobError("stale_source");
          await commitTx
            .update(documents)
            .set({ status: "pending", extractionError: null, claimedAt: null })
            .where(eq(documents.id, current.id));
          return { changes: [{ path: "status", before: current.status, after: "pending" }] };
        },
      });

    await tx
      .update(jobs)
      .set({
        state: "queued",
        maxAttempts: Math.min(6, job.attempts + 3),
        cancellationRequestedAt: null,
        nextAttemptAt: sql`now()`,
        errorCode: null,
        revision: sql`${jobs.revision} + 1`,
        updatedAt: sql`now()`,
      })
      .where(eq(jobs.id, id));
  });
  return getJob(actor, id);
}

/** Shared authorized read side for review job observers. */
export async function listReviewJobs(actor: Actor, reviewId: string): Promise<JobSnapshot[]> {
  if (!(await canAccessArtifact(actor, "tabular_review", reviewId))) return [];
  const rows = await db
    .select()
    .from(jobs)
    .where(
      and(
        eq(jobs.artifactId, reviewId),
        eq(jobs.kind, "review_cell"),
        eq(
          jobs.tenantId,
          (await getUserTenant(actor.userId)) ?? "00000000-0000-0000-0000-000000000000"
        )
      )
    )
    .orderBy(sql`${jobs.createdAt} desc`)
    .limit(1000);
  return rows.map(snapshot);
}
