import { canonicalFingerprint } from "./fingerprint.js";
import { and, eq, sql, asc, desc, type SQL, inArray } from "drizzle-orm";
import { db, type DB, type Tx } from "@workspace/db/client";
import {
  documents,
  jobs,
  jobReceipts,
  jobUnits,
  jobSpendReservations,
  jobNotifications,
  jobNotificationReads,
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
import { defaultJobControls, jobUsageSummary } from "./job-controls.js";
import type { MatterJobsSummary, JobNotificationPage } from "@workspace/contracts";
import { hasMatterAccess } from "./access.js";

export class JobError extends Error {
  constructor(readonly code: JobErrorCode | "request_conflict" | "lease_lost") {
    super(code);
    this.name = "JobError";
  }
}

/** Permission filter shared by counts and durable event pagination, before LIMIT. */
function visibleJobSql(actor: Actor): SQL {
  const scope = actor.type === "agent" ? actor.scope?.matterIds : null;
  const artifact = (alias: "d" | "r", kind: "document" | "tabular_review") => {
    const matter = sql.raw(`${alias}.matter_id`);
    const scoped = scope
      ? scope.length
        ? sql`${matter} in (${sql.join(
            scope.map((id) => sql`${id}::uuid`),
            sql`,`
          )})`
        : sql`false`
      : sql`true`;
    return sql`${sql.raw(`${alias}.tenant_id`)} = ${jobs.tenantId} and ${scoped} and (${sql.raw(`${alias}.user_id`)} = ${actor.userId} or exists(select 1 from matter_members mm join matters m on m.id = mm.matter_id where mm.user_id = ${actor.userId} and mm.matter_id = ${matter} and m.tenant_id = ${jobs.tenantId}) or exists(select 1 from artifact_shares s where s.artifact_type = ${kind} and s.artifact_id = ${sql.raw(`${alias}.id`)} and s.user_id = ${actor.userId}))`;
  };
  return sql`((${jobs.artifactType} = 'document' and exists(select 1 from documents d where d.id = ${jobs.artifactId} and ${artifact("d", "document")})) or (${jobs.artifactType} = 'tabular_review' and exists(select 1 from tabular_reviews r where r.id = ${jobs.artifactId} and ${artifact("r", "tabular_review")})))`;
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
export async function refreshProviderActor(
  accepted: Actor,
  credentialId?: string | null,
  reader: DB | Tx = db
): Promise<Actor> {
  let actor: Actor = accepted;
  if (actor.type === "agent") {
    if (!credentialId) return actor;
    const [token] = await reader
      .select({
        userId: mcpAccessTokens.userId,
        revokedAt: mcpAccessTokens.revokedAt,
        matterIds: mcpAccessTokens.allowedMatterIds,
        maxRole: mcpAccessTokens.maxRole,
      })
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.id, credentialId));
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
  return actor;
}

export async function authorizeJob(job: DurableJob, reader: DB | Tx = db): Promise<Actor> {
  if (!(await sameTenant(job.userId, job.tenantId, reader))) throw new JobError("access_denied");
  if (job.actor.type === "agent" && !job.credentialId) throw new JobError("access_denied");
  const actor = await refreshProviderActor(job.actor, job.credentialId, reader);
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
    const defaults = defaultJobControls();
    const leaseSeconds = Math.max(10, getEnvNumber("JOB_LEASE_SECONDS", 30));
    const [active] = await tx
      .select({
        count: sql<number>`count(*)::int + (select count(*)::int from job_spend_reservations s where s.job_id is null and s.state = 'reserved' and s.lease_expires_at > now())`,
      })
      .from(jobs)
      .where(sql`${jobs.state} = 'running' and ${jobs.leaseExpiresAt} > now()`);
    if (Number(active?.count ?? 0) >= globalLimit) return null;
    const rows = await tx.execute(sql`
      select j.* from jobs j
      left join job_control_policies p on p.tenant_id = j.tenant_id
      where j.kind = ${kind}
        and ((j.state = 'queued' and j.next_attempt_at <= now())
          or (j.state = 'running' and j.lease_expires_at <= now()))
        and ${documentId ? sql`j.artifact_id = ${documentId}` : sql`true`}
        and ((select count(*) from jobs a where a.state = 'running'
          and a.lease_expires_at > now() and a.tenant_id = j.tenant_id) + (select count(*) from job_spend_reservations s where s.job_id is null and s.state = 'reserved' and s.lease_expires_at > now() and s.tenant_id = j.tenant_id)) < coalesce((p.policy->>'tenantConcurrency')::int, ${defaults.tenantConcurrency})
        and ((select count(*) from jobs a where a.state = 'running'
          and a.lease_expires_at > now() and a.user_id = j.user_id) + (select count(*) from job_spend_reservations s where s.job_id is null and s.state = 'reserved' and s.lease_expires_at > now() and s.user_id = j.user_id)) < coalesce((p.policy->>'userConcurrency')::int, ${defaults.userConcurrency})
        and (j.provider is null or (select count(*) from jobs a where a.state = 'running'
          and a.lease_expires_at > now() and a.tenant_id = j.tenant_id and a.provider = j.provider) + (select count(*) from job_spend_reservations s where s.job_id is null and s.state = 'reserved' and s.lease_expires_at > now() and s.tenant_id = j.tenant_id and s.provider = j.provider)
          < coalesce((p.policy->'providerConcurrency'->>j.provider)::int,
            case j.provider when 'anthropic' then ${defaults.providerConcurrency.anthropic}
              when 'gemini' then ${defaults.providerConcurrency.gemini}
              when 'openrouter' then ${defaults.providerConcurrency.openrouter}
              else ${defaults.providerConcurrency.openai} end::int))
      order by (select max(a.updated_at) from jobs a where a.tenant_id = j.tenant_id and a.attempts > 0) nulls first, j.next_attempt_at, j.created_at
      for update of j skip locked limit 1
    `);
    const candidate = rows[0] as { id?: string } | undefined;
    if (!candidate?.id) return null;
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, candidate.id));
    if (!job) return null;
    if (job.kind === "review_cell" && job.state === "running") {
      const [receipt] = await tx
        .select()
        .from(jobReceipts)
        .where(and(eq(jobReceipts.jobId, job.id), eq(jobReceipts.operationKey, job.kind)));
      const [unit] = await tx.select().from(jobUnits).where(eq(jobUnits.jobId, job.id));
      const committed = receipt?.commitId ?? unit?.commitId;
      if (committed) {
        const [restored] = await tx
          .update(jobs)
          .set({
            state: "succeeded",
            resultCommitId: committed,
            errorCode: null,
            leaseOwner: null,
            leaseExpiresAt: null,
            revision: sql`${jobs.revision} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(jobs.id, job.id))
          .returning();
        if (restored) await publishJobNotification(tx, restored);
        return null;
      }
      const spending = await tx
        .select()
        .from(jobSpendReservations)
        .where(
          and(
            eq(jobSpendReservations.jobId, job.id),
            eq(jobSpendReservations.leaseEpoch, job.leaseEpoch)
          )
        )
        .for("update");
      const paidOrUncertain = spending.some(
        (r) =>
          r.state === "settled" ||
          r.state === "unknown" ||
          (r.state === "reserved" && (r.dispatchedAt !== null || job.schemaVersion < 2))
      );
      if (paidOrUncertain) {
        await tx
          .update(jobSpendReservations)
          .set({ state: "unknown" })
          .where(
            and(
              eq(jobSpendReservations.jobId, job.id),
              eq(jobSpendReservations.leaseEpoch, job.leaseEpoch),
              eq(jobSpendReservations.state, "reserved")
            )
          );
        await recordCommitInTransaction(tx, {
          actor: job.actor,
          artifactType: "tabular_review",
          artifactId: job.artifactId,
          op: "run_outcome_unknown",
          message: "Review worker expired after provider dispatch",
          apply: async () => ({
            changes: [{ path: `execution/${job.id}/state`, before: "running", after: "failed" }],
            summary: {
              jobId: job.id,
              leaseEpoch: job.leaseEpoch,
              reason: "provider_outcome_unknown",
              initiatingActor: job.actor,
            },
          }),
        });
        const [failed] = await tx
          .update(jobs)
          .set({
            state: "failed",
            errorCode: "provider_outcome_unknown",
            leaseOwner: null,
            leaseExpiresAt: null,
            revision: sql`${jobs.revision} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(jobs.id, job.id))
          .returning();
        if (failed) await publishJobNotification(tx, failed);
        return null;
      }
      // Only the persisted pre-dispatch state proves that another attempt is free.
      await tx
        .update(jobSpendReservations)
        .set({ state: "released" })
        .where(
          and(
            eq(jobSpendReservations.jobId, job.id),
            eq(jobSpendReservations.leaseEpoch, job.leaseEpoch),
            eq(jobSpendReservations.state, "reserved"),
            sql`${jobSpendReservations.dispatchedAt} is null`
          )
        );
    }
    if (job.cancellationRequestedAt) {
      const [cancelled] = await tx
        .update(jobs)
        .set({
          state: "cancelled",
          errorCode: null,
          leaseOwner: null,
          leaseExpiresAt: null,
          revision: sql`${jobs.revision} + 1`,
          updatedAt: sql`now()`,
        })
        .where(eq(jobs.id, job.id))
        .returning();
      if (cancelled) await publishJobNotification(tx, cancelled);
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
    const [completed] = await tx
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
      .where(eq(jobs.id, job.id))
      .returning();
    if (completed) await publishJobNotification(tx, completed);
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
    const [updated] = await tx
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
      .where(eq(jobs.id, job.id))
      .returning();
    if (updated && (state === "failed" || state === "cancelled"))
      await publishJobNotification(tx, updated);
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

async function publishJobNotification(tx: Tx, job: DurableJob) {
  await tx
    .insert(jobNotifications)
    .values({
      jobId: job.id,
      tenantId: job.tenantId,
      matterId: job.matterId,
      revision: job.revision,
      payload: snapshot(job),
    })
    .onConflictDoNothing({ target: [jobNotifications.jobId, jobNotifications.revision] });
}

function withUsage(
  job: DurableJob,
  spending: Array<typeof jobSpendReservations.$inferSelect>
): JobSnapshot {
  const known = spending.filter((r) => r.state === "settled");
  const held = spending.filter((r) => r.state === "reserved" || r.state === "unknown");
  return {
    ...snapshot(job),
    usage: {
      uncertainAttempts: held.length,
      knownTokens: known.reduce((n, r) => n + (r.actualTokens ?? 0), 0),
      heldTokenEstimate: held.reduce((n, r) => n + r.reservedTokens, 0),
      knownEstimatedUsd: known.every((r) => r.actualUsd !== null)
        ? known.reduce((n, r) => n + r.actualUsd!, 0)
        : null,
      heldEstimatedUsd: held.every((r) => r.reservedUsd !== null)
        ? held.reduce((n, r) => n + r.reservedUsd!, 0)
        : null,
    },
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
  return withUsage(job, spending);
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

        const [cancelled] = await tx
          .update(jobs)
          .set({
            cancellationRequestedAt: sql`now()`,
            state: job.state === "queued" ? "cancelled" : "running",
            revision: sql`${jobs.revision} + 1`,
            updatedAt: sql`now()`,
          })
          .where(eq(jobs.id, id))
          .returning();
        if (cancelled?.state === "cancelled") await publishJobNotification(tx, cancelled);
        if (job.kind === "review_cell")
          await recordCommitInTransaction(tx, {
            artifactType: "tabular_review",
            artifactId: job.artifactId,
            actor,
            op: "run_cancel_requested",
            message: "Cancelled review rule execution",
            apply: async () => ({
              changes: [
                {
                  path: `execution/${job.id}/state`,
                  before: job.state,
                  after: job.state === "queued" ? "cancelled" : "cancellation_requested",
                },
              ],
              summary: { jobId: job.id, initiatingActor: job.actor },
            }),
          });
      }
      return snapshot(job);
    })
    .then(async (result) => (result ? getJob(actor, id) : null));
}

export async function retryJobInTransaction(
  tx: Tx,
  actor: Actor,
  id: string,
  options: { acknowledgeUnknown?: boolean; requestId?: string } = {}
) {
  const [job] = await tx.select().from(jobs).where(eq(jobs.id, id)).for("update");
  if (
    !job ||
    !(await sameTenant(actor.userId, job.tenantId, tx)) ||
    !(await canAccessArtifact(actor, job.artifactType, job.artifactId, "editor", tx))
  )
    throw new JobError("access_denied");
  const retryFingerprint = canonicalFingerprint({
    actor,
    jobId: id,
    acknowledgeUnknown: options.acknowledgeUnknown ?? false,
  });
  if (options.requestId && job.lastRetryRequestId === options.requestId) {
    if (job.lastRetryFingerprint !== retryFingerprint) throw new JobError("request_conflict");
    return job;
  }
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
  if (job.errorCode === "provider_outcome_unknown" && !options.acknowledgeUnknown)
    throw new JobError("provider_outcome_unknown");
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

  if (job.kind === "review_cell")
    await recordCommitInTransaction(tx, {
      artifactType: "tabular_review",
      artifactId: job.artifactId,
      actor,
      op: "run_retried",
      message: "Retried failed review rule",
      apply: async () => ({
        changes: [{ path: `execution/${job.id}/state`, before: "failed", after: "queued" }],
        summary: {
          jobId: job.id,
          attempts: job.attempts,
          acknowledgedUnknownPaidOutcome: options.acknowledgeUnknown ?? false,
          initiatingActor: job.actor,
        },
      }),
    });

  await tx
    .update(jobs)
    .set({
      state: "queued",
      maxAttempts: Math.min(6, job.attempts + 3),
      cancellationRequestedAt: null,
      nextAttemptAt: sql`now()`,
      errorCode: null,
      lastRetryRequestId: options.requestId ?? null,
      lastRetryFingerprint: options.requestId ? retryFingerprint : null,
      revision: sql`${jobs.revision} + 1`,
      updatedAt: sql`now()`,
    })
    .where(eq(jobs.id, id));
  return job;
}

export async function retryJob(
  actor: Actor,
  id: string,
  options: { acknowledgeUnknown?: boolean; requestId?: string } = {}
): Promise<JobSnapshot | null> {
  await db.transaction((tx) => retryJobInTransaction(tx, actor, id, options));
  return getJob(actor, id);
}

/** Counts and spend are matter-scoped only after current authorization. */
export async function listMatterJobs(
  actor: Actor,
  matterId: string
): Promise<MatterJobsSummary | null> {
  if (!(await hasMatterAccess(actor, matterId))) return null;
  const tenantId = await getUserTenant(actor.userId);
  if (!tenantId) return null;
  const rows = await db
    .select()
    .from(jobs)
    .where(and(eq(jobs.tenantId, tenantId), eq(jobs.matterId, matterId), visibleJobSql(actor)))
    .orderBy(sql`${jobs.createdAt} desc`)
    .limit(1001);
  const allowed = rows.slice(0, 1000);
  const counts = { queued: 0, running: 0, succeeded: 0, failed: 0, cancelled: 0 };
  for (const row of allowed) counts[row.state]++;
  const spending = allowed.length
    ? await db
        .select()
        .from(jobSpendReservations)
        .where(
          inArray(
            jobSpendReservations.jobId,
            allowed.map((j) => j.id)
          )
        )
    : [];
  return {
    jobs: allowed.map((job) =>
      withUsage(
        job,
        spending.filter((r) => r.jobId === job.id)
      )
    ),
    counts,
    spend: await jobUsageSummary(tenantId, matterId),
    truncated: rows.length > 1000,
  };
}

/** Replayable durable inbox. Cursor IDs are resolved only inside this authorized matter. */
export async function listJobNotifications(
  actor: Actor,
  matterId: string,
  cursor?: string
): Promise<JobNotificationPage | null> {
  if (!(await hasMatterAccess(actor, matterId))) return null;
  const tenantId = await getUserTenant(actor.userId);
  if (!tenantId) return null;
  const [afterRow] = cursor
    ? await db
        .select({ event: jobNotifications })
        .from(jobNotifications)
        .innerJoin(jobs, eq(jobs.id, jobNotifications.jobId))
        .where(
          and(
            eq(jobNotifications.id, cursor),
            eq(jobNotifications.tenantId, tenantId),
            eq(jobNotifications.matterId, matterId),
            visibleJobSql(actor)
          )
        )
    : [];
  const after = afterRow?.event;
  if (cursor && !after) throw new JobError("input_not_ready");
  const rows = await db
    .select({ event: jobNotifications, job: jobs, readId: jobNotificationReads.id })
    .from(jobNotifications)
    .innerJoin(jobs, eq(jobs.id, jobNotifications.jobId))
    .leftJoin(
      jobNotificationReads,
      and(
        eq(jobNotificationReads.notificationId, jobNotifications.id),
        eq(jobNotificationReads.userId, actor.userId)
      )
    )
    .where(
      and(
        eq(jobNotifications.tenantId, tenantId),
        eq(jobNotifications.matterId, matterId),
        visibleJobSql(actor),
        after
          ? sql`(${jobNotifications.createdAt},${jobNotifications.id}) > (select created_at,id from job_notifications where id = ${after.id})`
          : undefined
      )
    )
    .orderBy(
      cursor ? asc(jobNotifications.createdAt) : desc(jobNotifications.createdAt),
      cursor ? asc(jobNotifications.id) : desc(jobNotifications.id)
    )
    .limit(100);
  const events: JobNotificationPage["events"] = [];
  const access = new Map<string, boolean>();
  for (const row of cursor ? rows : rows.reverse()) {
    const key = `${row.job.artifactType}:${row.job.artifactId}`;
    if (!access.has(key))
      access.set(key, await canAccessArtifact(actor, row.job.artifactType, row.job.artifactId));
    if (access.get(key))
      events.push({
        id: row.event.id,
        job: row.event.payload,
        createdAt: row.event.createdAt.toISOString(),
        read: !!row.readId,
      });
  }
  return { events, nextCursor: events.at(-1)?.id ?? null };
}

/** Acknowledgement is per reader; it cannot erase another team member's notification. */
export async function markJobNotificationRead(actor: Actor, id: string): Promise<boolean> {
  return db.transaction(async (tx) => {
    const [event] = await tx
      .select()
      .from(jobNotifications)
      .innerJoin(jobs, eq(jobs.id, jobNotifications.jobId))
      .where(eq(jobNotifications.id, id));
    if (
      !event ||
      !(await sameTenant(actor.userId, event.job_notifications.tenantId, tx)) ||
      !(await canAccessArtifact(
        actor,
        event.jobs.artifactType,
        event.jobs.artifactId,
        "viewer",
        tx
      ))
    )
      return false;
    await tx
      .insert(jobNotificationReads)
      .values({ notificationId: id, userId: actor.userId })
      .onConflictDoNothing({
        target: [jobNotificationReads.notificationId, jobNotificationReads.userId],
      });
    return true;
  });
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
