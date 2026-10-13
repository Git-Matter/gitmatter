import { and, eq, sql } from "drizzle-orm";
import { db, type DB, type Tx } from "@workspace/db/client";
import {
  auditEvents,
  jobControlPolicies,
  jobSpendReservations,
  jobs,
  user,
} from "@workspace/db/schema";
import {
  jobControlPolicySchema,
  type JobControlPolicy,
  type JobControlsSnapshot,
  type JobUsageSummary,
} from "@workspace/contracts";
import type { Actor } from "./commit.js";
import { getEnvNumber } from "./config.js";
import { JobError } from "./jobs.js";
import { hasMatterAccess } from "./access.js";
import type { JobUsageAttribution } from "@workspace/contracts";

export function defaultJobControls(): JobControlPolicy {
  return {
    budgetWindowMinutes: Math.max(1, getEnvNumber("BUDGET_WINDOW_MINUTES", 60)),
    tenantTokenLimit: Math.max(0, getEnvNumber("TENANT_LLM_TOKEN_BUDGET", 0)),
    userTokenLimit: Math.max(0, getEnvNumber("USER_LLM_TOKEN_BUDGET", 0)),
    matterTokenLimit: Math.max(0, getEnvNumber("MATTER_LLM_TOKEN_BUDGET", 0)),
    tokenTokenLimit: Math.max(0, getEnvNumber("MCP_LLM_TOKEN_BUDGET", 0)),
    runTokenLimit: Math.max(0, getEnvNumber("RUN_LLM_TOKEN_BUDGET", 0)),
    tenantCostLimitUsd: Math.max(0, getEnvNumber("TENANT_LLM_COST_BUDGET_USD", 0)),
    tenantConcurrency: Math.max(1, getEnvNumber("JOB_TENANT_CONCURRENCY", 2)),
    userConcurrency: Math.max(1, getEnvNumber("JOB_USER_CONCURRENCY", 1)),
    providerConcurrency: {
      anthropic: Math.max(1, getEnvNumber("JOB_ANTHROPIC_CONCURRENCY", 2)),
      gemini: Math.max(1, getEnvNumber("JOB_GEMINI_CONCURRENCY", 2)),
      openai: Math.max(1, getEnvNumber("JOB_OPENAI_CONCURRENCY", 2)),
      openrouter: Math.max(1, getEnvNumber("JOB_OPENROUTER_CONCURRENCY", 2)),
    },
  };
}

export async function effectiveJobControls(tenantId: string, reader: DB | Tx = db) {
  const [row] = await reader
    .select()
    .from(jobControlPolicies)
    .where(eq(jobControlPolicies.tenantId, tenantId));
  return {
    revision: row?.revision ?? 0,
    configured: row?.policy ?? null,
    effective: row?.policy ?? defaultJobControls(),
  };
}

export async function jobUsageSummary(
  tenantId: string,
  matterId?: string,
  reader: DB | Tx = db
): Promise<JobUsageSummary> {
  const controls = await effectiveJobControls(tenantId, reader);
  const [row] = await reader
    .select({
      knownTokens: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} = 'settled' then ${jobSpendReservations.actualTokens} else 0 end),0)`,
      heldTokens: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} in ('reserved','unknown') then ${jobSpendReservations.reservedTokens} else 0 end),0)`,
      knownEstimatedUsd: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} = 'settled' then ${jobSpendReservations.actualUsd} else 0 end),0)`,
      heldEstimatedUsd: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} in ('reserved','unknown') then ${jobSpendReservations.reservedUsd} else 0 end),0)`,
      unpricedAttempts: sql<number>`count(*) filter (where (${jobSpendReservations.state} = 'settled' and ${jobSpendReservations.actualUsd} is null) or (${jobSpendReservations.state} in ('reserved','unknown') and ${jobSpendReservations.reservedUsd} is null))::int`,
    })
    .from(jobSpendReservations)
    .where(
      and(
        eq(jobSpendReservations.tenantId, tenantId),
        matterId ? eq(jobSpendReservations.matterId, matterId) : undefined,
        sql`${jobSpendReservations.state} <> 'released'`,
        sql`(${jobSpendReservations.state} in ('reserved','unknown') or ${jobSpendReservations.createdAt} >= now() - (${controls.effective.budgetWindowMinutes} * interval '1 minute'))`
      )
    );
  return {
    knownTokens: Number(row?.knownTokens ?? 0),
    heldTokens: Number(row?.heldTokens ?? 0),
    knownEstimatedUsd: Number(row?.knownEstimatedUsd ?? 0),
    heldEstimatedUsd: Number(row?.heldEstimatedUsd ?? 0),
    unpricedAttempts: Number(row?.unpricedAttempts ?? 0),
  };
}

async function requireAdmin(actor: Actor, reader: DB | Tx = db) {
  if (actor.type !== "user") throw new JobError("access_denied");
  const [account] = await reader
    .select({ tenantId: user.tenantId, role: user.tenantRole })
    .from(user)
    .where(eq(user.id, actor.userId));
  if (!account?.tenantId || account.role !== "admin") throw new JobError("access_denied");
  return account.tenantId;
}

export async function getJobControls(actor: Actor): Promise<JobControlsSnapshot> {
  const tenantId = await requireAdmin(actor);
  const controls = await effectiveJobControls(tenantId);
  const [counts] = await db
    .select({
      queued: sql<number>`count(*) filter (where ${jobs.state} = 'queued')::int`,
      running: sql<number>`count(*) filter (where ${jobs.state} = 'running')::int`,
      failed: sql<number>`count(*) filter (where ${jobs.state} = 'failed')::int`,
    })
    .from(jobs)
    .where(eq(jobs.tenantId, tenantId));
  return {
    ...controls,
    scope: "application_llm",
    usage: await jobUsageSummary(tenantId),
    capacity: {
      queued: Number(counts?.queued ?? 0),
      running: Number(counts?.running ?? 0),
      failed: Number(counts?.failed ?? 0),
    },
  };
}

/** Attributed operational spend; hidden matter IDs never cross the current access boundary. */
export async function listJobUsageAttribution(actor: Actor): Promise<JobUsageAttribution[]> {
  const tenantId = await requireAdmin(actor);
  const { effective } = await effectiveJobControls(tenantId);
  const rows = await db
    .select({
      matterId: jobSpendReservations.matterId,
      actorId: jobSpendReservations.userId,
      actorType: sql<
        "user" | "agent"
      >`coalesce(${jobSpendReservations.actor}->>'type', ${jobs.actor}->>'type', 'user')`,
      agentLabel: sql<
        string | null
      >`coalesce(${jobSpendReservations.actor}->>'agentLabel', ${jobs.actor}->>'agentLabel')`,
      provider: jobSpendReservations.provider,
      model: jobSpendReservations.model,
      day: sql<string>`to_char(${jobSpendReservations.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`,
      attempts: sql<number>`count(*)::int`,
      knownTokens: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} = 'settled' then ${jobSpendReservations.actualTokens} else 0 end),0)`,
      heldTokens: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} in ('reserved','unknown') then ${jobSpendReservations.reservedTokens} else 0 end),0)`,
      knownEstimatedUsd: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} = 'settled' then ${jobSpendReservations.actualUsd} else 0 end),0)`,
      heldEstimatedUsd: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} in ('reserved','unknown') then ${jobSpendReservations.reservedUsd} else 0 end),0)`,
      unpricedAttempts: sql<number>`count(*) filter (where (${jobSpendReservations.state} = 'settled' and ${jobSpendReservations.actualUsd} is null) or (${jobSpendReservations.state} in ('reserved','unknown') and ${jobSpendReservations.reservedUsd} is null))::int`,
    })
    .from(jobSpendReservations)
    .leftJoin(jobs, eq(jobs.id, jobSpendReservations.jobId))
    .where(
      and(
        eq(jobSpendReservations.tenantId, tenantId),
        sql`${jobSpendReservations.state} <> 'released'`,
        sql`(${jobSpendReservations.state} in ('reserved','unknown') or ${jobSpendReservations.createdAt} >= now() - (${effective.budgetWindowMinutes} * interval '1 minute'))`
      )
    )
    .groupBy(
      jobSpendReservations.matterId,
      jobSpendReservations.userId,
      jobSpendReservations.provider,
      jobSpendReservations.model,
      sql`coalesce(${jobSpendReservations.actor}->>'type', ${jobs.actor}->>'type', 'user')`,
      sql`coalesce(${jobSpendReservations.actor}->>'agentLabel', ${jobs.actor}->>'agentLabel')`,
      sql`to_char(${jobSpendReservations.createdAt} at time zone 'UTC', 'YYYY-MM-DD')`
    )
    .orderBy(sql`to_char(${jobSpendReservations.createdAt} at time zone 'UTC', 'YYYY-MM-DD') desc`)
    .limit(5000);
  const access = new Map<string, boolean>();
  const result = new Map<string, JobUsageAttribution>();
  for (const row of rows) {
    if (row.matterId && !access.has(row.matterId))
      access.set(row.matterId, await hasMatterAccess(actor, row.matterId));
    // Admin operational totals remain visible; confidential matter identity does not.
    const matterId = row.matterId && access.get(row.matterId) ? row.matterId : null;
    const key = `${matterId}:${row.actorId}:${row.actorType}:${row.agentLabel}:${row.provider}:${row.model}:${row.day}`;
    const previous = result.get(key);
    const values = {
      knownTokens: Number(row.knownTokens),
      heldTokens: Number(row.heldTokens),
      knownEstimatedUsd: Number(row.knownEstimatedUsd),
      heldEstimatedUsd: Number(row.heldEstimatedUsd),
      unpricedAttempts: Number(row.unpricedAttempts),
      attempts: Number(row.attempts),
    };
    if (previous) {
      for (const field of Object.keys(values) as Array<keyof typeof values>)
        previous[field] += values[field];
    } else result.set(key, { ...row, ...values, matterId });
  }
  return [...result.values()];
}

/** Operational settings use the security audit ledger atomically, not a legal artifact commit. */
export async function setJobControls(
  actor: Actor,
  input: { expectedRevision: number; reason: string; policy: JobControlPolicy }
) {
  const policy = jobControlPolicySchema.parse(input.policy);
  if (
    !Number.isSafeInteger(input.expectedRevision) ||
    input.expectedRevision < 0 ||
    !input.reason.trim() ||
    input.reason.length > 1000
  )
    throw new JobError("input_not_ready");
  await db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, actor.userId)).for("share");
    const tenantId = await requireAdmin(actor, tx);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`job-controls:${tenantId}`}))`);
    const previous = await effectiveJobControls(tenantId, tx);
    if (previous.revision !== input.expectedRevision) throw new JobError("stale_source");
    await tx
      .insert(jobControlPolicies)
      .values({ tenantId, policy, revision: previous.revision + 1, updatedBy: actor.userId })
      .onConflictDoUpdate({
        target: jobControlPolicies.tenantId,
        set: {
          policy,
          revision: previous.revision + 1,
          updatedBy: actor.userId,
          updatedAt: sql`now()`,
        },
      });
    await tx.insert(auditEvents).values({
      tenantId,
      actorId: actor.userId,
      eventType: "job.controls_updated",
      target: tenantId,
      metadata: {
        revision: previous.revision + 1,
        reason: input.reason.trim(),
        before: previous.effective,
        after: policy,
      },
    });
  });
  return getJobControls(actor);
}
