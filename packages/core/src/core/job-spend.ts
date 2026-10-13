import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  jobSpendReservations,
  usageEvents,
  user,
  mcpAccessTokens,
  type DurableJob,
} from "@workspace/db/schema";
import { estimateCostUsd } from "@workspace/registry";
import { getEnvNumber } from "./config.js";
import { JobError, lockJobLease, authorizeJobInTransaction, refreshProviderActor } from "./jobs.js";
import { effectiveJobControls } from "./job-controls.js";
import type { Actor } from "./commit.js";
import {
  sameTenant,
  hasMatterAccess,
  hasMatterAccessInTransaction,
  scopeAllowsMatter,
} from "./access.js";
import { providerForModel } from "../ai/provider/catalog.js";

export type ProviderSpendContext = {
  actor: Actor;
  matterId?: string | null;
  runId?: string;
  credentialId?: string;
  sourceKind: "sync_review" | "chat" | "generation";
};
type SpendPrincipal = {
  id?: string;
  leaseEpoch?: number;
  userId: string;
  tenantId: string;
  matterId: string | null;
  credentialId: string | null;
  runId: string | null;
  model: string | null;
  actor: Actor;
  sourceKind: "durable_review" | "sync_review" | "chat" | "generation";
};

export type RunEstimate = {
  model: string;
  cells: number;
  inputTokenUpperEstimate: number;
  outputTokenLimit: number;
  costUsd: number | null;
  budgetWindowMinutes: number;
  tokenLimits: { tenant: number; user: number; matter: number; token: number; run: number };
  tenantCostLimitUsd: number;
  costLimitScope: "application_llm";
};
export function estimateReviewRun(
  model: string,
  prompts: Array<{ system: string; user: string }>
): RunEstimate {
  // UTF-8 bytes conservatively cover text tokenization; provider framing/schema
  // adds an explicit allowance. This is an estimate, not provider tokenizer proof.
  const input = prompts.reduce(
    (n, p) => n + Buffer.byteLength(p.system + p.user, "utf8") + 4096,
    0
  );
  const output = prompts.length * 2048;
  return {
    model,
    cells: prompts.length,
    inputTokenUpperEstimate: input,
    outputTokenLimit: output,
    costUsd: estimateCostUsd(model, input, output),
    budgetWindowMinutes: getEnvNumber("BUDGET_WINDOW_MINUTES", 60),
    tokenLimits: {
      tenant: getEnvNumber("TENANT_LLM_TOKEN_BUDGET", 0),
      user: getEnvNumber("USER_LLM_TOKEN_BUDGET", 0),
      matter: getEnvNumber("MATTER_LLM_TOKEN_BUDGET", 0),
      token: getEnvNumber("MCP_LLM_TOKEN_BUDGET", 0),
      run: getEnvNumber("RUN_LLM_TOKEN_BUDGET", 0),
    },
    costLimitScope: "application_llm",
    tenantCostLimitUsd: getEnvNumber("TENANT_LLM_COST_BUDGET_USD", 0),
  };
}

export async function applyTenantRunLimits(
  tenantId: string,
  estimate: RunEstimate
): Promise<RunEstimate> {
  const { effective: p } = await effectiveJobControls(tenantId);
  return {
    ...estimate,
    budgetWindowMinutes: p.budgetWindowMinutes,
    tokenLimits: {
      tenant: p.tenantTokenLimit,
      user: p.userTokenLimit,
      matter: p.matterTokenLimit,
      token: p.tokenTokenLimit,
      run: p.runTokenLimit,
    },
    tenantCostLimitUsd: p.tenantCostLimitUsd,
  };
}

/** Hard dispatch limits for durable provider work; reservations serialize globally. */
export async function reserveJobSpend(job: DurableJob, inputTokens: number, outputTokens: number) {
  return reserveProviderSpend(
    { ...job, sourceKind: "durable_review" },
    inputTokens,
    outputTokens,
    job
  );
}

/** All provider paths share the same serialized token/cost ledger. */
export async function reserveProviderSpend(
  job: SpendPrincipal,
  inputTokens: number,
  outputTokens: number,
  durableJob?: DurableJob
) {
  if (
    !job.model ||
    ![inputTokens, outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    inputTokens + outputTokens > 2_147_483_647
  )
    throw new JobError("input_not_ready");
  const model = job.model!;
  const tokens = inputTokens + outputTokens;
  const cost = estimateCostUsd(model, inputTokens, outputTokens);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('durable-job-capacity'))`);
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('job-spend-capacity'))`);
    if (durableJob) {
      await lockJobLease(tx, durableJob);
      await authorizeJobInTransaction(tx, durableJob);
    }
    const liveActor = await refreshProviderActor(job.actor, job.credentialId, tx);
    if (
      !scopeAllowsMatter(
        liveActor.type === "agent" ? (liveActor.scope ?? null) : null,
        job.matterId
      ) ||
      !(await sameTenant(job.userId, job.tenantId, tx)) ||
      (job.matterId && !(await hasMatterAccess(liveActor, job.matterId, "viewer", tx)))
    )
      throw new JobError("access_denied");
    const provider = providerForModel(model);
    const { effective: p } = await effectiveJobControls(job.tenantId, tx);
    const estimate = {
      ...estimateReviewRun(model, []),
      budgetWindowMinutes: p.budgetWindowMinutes,
      tokenLimits: {
        tenant: p.tenantTokenLimit,
        user: p.userTokenLimit,
        matter: p.matterTokenLimit,
        token: p.tokenTokenLimit,
        run: p.runTokenLimit,
      },
      tenantCostLimitUsd: p.tenantCostLimitUsd,
    };
    const [existing] = job.id
      ? await tx
          .select()
          .from(jobSpendReservations)
          .where(
            and(
              eq(jobSpendReservations.jobId, job.id),
              eq(jobSpendReservations.leaseEpoch, job.leaseEpoch ?? 0)
            )
          )
      : [];
    if (existing) throw new JobError("limit_reached"); // never dispatch an attempt twice
    if (!durableJob) {
      const [active] = await tx.execute(sql`select
        (select count(*) from jobs j where j.state = 'running' and j.lease_expires_at > now()) + count(*) as global_count,
        (select count(*) from jobs j where j.state = 'running' and j.lease_expires_at > now() and j.tenant_id = ${job.tenantId}) + count(*) filter (where tenant_id = ${job.tenantId}) as tenant_count,
        (select count(*) from jobs j where j.state = 'running' and j.lease_expires_at > now() and j.user_id = ${job.userId}) + count(*) filter (where user_id = ${job.userId}) as user_count,
        (select count(*) from jobs j where j.state = 'running' and j.lease_expires_at > now() and j.tenant_id = ${job.tenantId} and j.provider = ${provider}) + count(*) filter (where tenant_id = ${job.tenantId} and provider = ${provider}) as provider_count
        from job_spend_reservations where job_id is null and state = 'reserved' and lease_expires_at > now()`);
      const counts = active as Record<string, string | number>;
      if (
        Number(counts.global_count) >= Math.max(1, getEnvNumber("JOB_GLOBAL_CONCURRENCY", 4)) ||
        Number(counts.tenant_count) >= p.tenantConcurrency ||
        Number(counts.user_count) >= p.userConcurrency ||
        Number(counts.provider_count) >= p.providerConcurrency[provider]
      )
        throw new JobError("limit_reached");
    }
    const scopes: Array<{ limit: number; usage: SQL; reservations: SQL }> = [
      {
        limit: estimate.tokenLimits.tenant,
        usage: eq(usageEvents.tenantId, job.tenantId),
        reservations: eq(jobSpendReservations.tenantId, job.tenantId),
      },
      {
        limit: estimate.tokenLimits.user,
        usage: eq(usageEvents.userId, job.userId),
        reservations: eq(jobSpendReservations.userId, job.userId),
      },
      ...(job.matterId
        ? [
            {
              limit: estimate.tokenLimits.matter,
              usage: eq(usageEvents.matterId, job.matterId),
              reservations: eq(jobSpendReservations.matterId, job.matterId),
            },
          ]
        : []),
      ...(job.credentialId
        ? [
            {
              limit: estimate.tokenLimits.token,
              usage: eq(usageEvents.tokenId, job.credentialId),
              reservations: eq(jobSpendReservations.tokenId, job.credentialId),
            },
          ]
        : []),
    ];
    for (const scope of scopes) {
      if (scope.limit <= 0) continue;
      const [used] = await tx
        .select({
          tokens: sql<number>`coalesce(sum(coalesce(${usageEvents.inputTokens},0) + coalesce(${usageEvents.outputTokens},0)),0)`,
        })
        .from(usageEvents)
        .where(
          and(
            eq(usageEvents.kind, "llm"),
            scope.usage,
            sql`${usageEvents.createdAt} >= now() - (${estimate.budgetWindowMinutes} * interval '1 minute')`
          )
        );
      const [held] = await tx
        .select({ tokens: sql<number>`coalesce(sum(${jobSpendReservations.reservedTokens}),0)` })
        .from(jobSpendReservations)
        .where(
          and(scope.reservations, sql`${jobSpendReservations.state} in ('reserved','unknown')`)
        );
      if (Number(used?.tokens ?? 0) + Number(held?.tokens ?? 0) + tokens > scope.limit)
        throw new JobError("limit_reached");
    }
    if (estimate.tokenLimits.run > 0 && job.runId) {
      const [run] = await tx
        .select({
          tokens: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} = 'settled' then ${jobSpendReservations.actualTokens} else ${jobSpendReservations.reservedTokens} end),0)`,
        })
        .from(jobSpendReservations)
        .where(
          and(
            eq(jobSpendReservations.runId, job.runId),
            sql`${jobSpendReservations.state} <> 'released'`
          )
        );
      if (Number(run?.tokens ?? 0) + tokens > estimate.tokenLimits.run)
        throw new JobError("limit_reached");
    }
    if (estimate.tenantCostLimitUsd > 0) {
      if (cost === null) throw new JobError("limit_reached");
      const [spent] = await tx
        .select({
          cost: sql<number>`coalesce(sum(case when ${jobSpendReservations.state} = 'settled' then ${jobSpendReservations.actualUsd} else ${jobSpendReservations.reservedUsd} end),0)`,
          unpriced: sql<number>`count(*) filter (where (${jobSpendReservations.state} = 'settled' and ${jobSpendReservations.actualUsd} is null) or (${jobSpendReservations.state} in ('reserved','unknown') and ${jobSpendReservations.reservedUsd} is null))::int`,
        })
        .from(jobSpendReservations)
        .where(
          and(
            eq(jobSpendReservations.tenantId, job.tenantId),
            sql`${jobSpendReservations.state} <> 'released'`,
            sql`(${jobSpendReservations.state} in ('reserved','unknown') or ${jobSpendReservations.createdAt} >= now() - (${estimate.budgetWindowMinutes} * interval '1 minute'))`
          )
        );
      if (
        Number(spent?.unpriced ?? 0) > 0 ||
        Number(spent?.cost ?? 0) + cost > estimate.tenantCostLimitUsd
      )
        throw new JobError("limit_reached");
    }
    const [reservation] = await tx
      .insert(jobSpendReservations)
      .values({
        jobId: job.id,
        leaseEpoch: job.leaseEpoch ?? 0,
        sourceKind: job.sourceKind,
        actor: job.actor,
        provider,
        leaseExpiresAt: sql`now() + interval '10 minutes'`,
        tenantId: job.tenantId,
        userId: job.userId,
        matterId: job.matterId,
        tokenId: job.credentialId,
        runId: job.runId,
        model,
        reservedTokens: tokens,
        reservedUsd: cost,
      })
      .returning();
    return reservation!;
  });
}

/** Dispatch is a one-time transition; possession of an ID never exempts a caller from admission. */
export async function dispatchProviderSpend(reservationId: string, actor: Actor, model: string) {
  return db.transaction(async (tx) => {
    await tx.select({ id: user.id }).from(user).where(eq(user.id, actor.userId)).for("share");
    const [reservation] = await tx
      .select()
      .from(jobSpendReservations)
      .where(
        and(
          eq(jobSpendReservations.id, reservationId),
          sql`${jobSpendReservations.leaseExpiresAt} > now()`
        )
      )
      .for("update");
    if (
      !reservation ||
      reservation.userId !== actor.userId ||
      reservation.model !== model ||
      reservation.state !== "reserved" ||
      reservation.dispatchedAt ||
      !(await sameTenant(actor.userId, reservation.tenantId, tx)) ||
      (reservation.matterId && !(await hasMatterAccess(actor, reservation.matterId, "viewer", tx)))
    )
      throw new JobError("access_denied");
    if (reservation.tokenId)
      await tx
        .select({ id: mcpAccessTokens.id })
        .from(mcpAccessTokens)
        .where(eq(mcpAccessTokens.id, reservation.tokenId))
        .for("share");
    const acceptedActor = await refreshProviderActor(
      reservation.actor ?? actor,
      reservation.tokenId,
      tx
    );
    if (
      !scopeAllowsMatter(
        acceptedActor.type === "agent" ? (acceptedActor.scope ?? null) : null,
        reservation.matterId
      ) ||
      (reservation.matterId &&
        !(await hasMatterAccessInTransaction(tx, acceptedActor, reservation.matterId, "viewer")))
    )
      throw new JobError("access_denied");
    if (reservation.jobId) {
      const { jobs } = await import("@workspace/db/schema");
      const [job] = await tx.select().from(jobs).where(eq(jobs.id, reservation.jobId));
      if (!job || job.userId !== actor.userId || job.leaseEpoch !== reservation.leaseEpoch)
        throw new JobError("access_denied");
      await lockJobLease(tx, job);
      await authorizeJobInTransaction(tx, job);
    }
    await tx
      .update(jobSpendReservations)
      .set({ dispatchedAt: sql`now()` })
      .where(eq(jobSpendReservations.id, reservation.id));
    return reservation;
  });
}

export async function settleProviderSpend(
  reservationId: string,
  usage?: { provider: string; model: string; inputTokens: number; outputTokens: number },
  release = false
) {
  await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(jobSpendReservations)
      .where(eq(jobSpendReservations.id, reservationId))
      .for("update");
    if (!reservation || reservation.state === "settled" || reservation.state === "released") return;
    if (release || !usage) {
      await tx
        .update(jobSpendReservations)
        .set({ state: release ? "released" : "unknown" })
        .where(eq(jobSpendReservations.id, reservationId));
      return;
    }
    if (![usage.inputTokens, usage.outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw new JobError("limit_reached");
    await tx.insert(usageEvents).values({
      kind: "llm",
      userId: reservation.userId,
      tenantId: reservation.tenantId,
      matterId: reservation.matterId,
      tokenId: reservation.tokenId,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    await tx
      .update(jobSpendReservations)
      .set({
        state: "settled",
        actualTokens: usage.inputTokens + usage.outputTokens,
        actualUsd: estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens),
      })
      .where(eq(jobSpendReservations.id, reservationId));
  });
}

/** Record a known paid attempt even when its legal result is cancelled or stale. */
export async function settleJobSpend(
  job: DurableJob,
  usage?: { provider: string; model: string; inputTokens: number; outputTokens: number }
) {
  await db.transaction(async (tx) => {
    const [reservation] = await tx
      .select()
      .from(jobSpendReservations)
      .where(
        and(
          eq(jobSpendReservations.jobId, job.id),
          eq(jobSpendReservations.leaseEpoch, job.leaseEpoch)
        )
      )
      .for("update");
    if (!reservation || reservation.state === "settled" || reservation.state === "released") return;
    if (!usage) {
      await tx
        .update(jobSpendReservations)
        .set({ state: "unknown" })
        .where(eq(jobSpendReservations.id, reservation.id));
      return;
    }
    if (![usage.inputTokens, usage.outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0))
      throw new JobError("limit_reached");
    await tx.insert(usageEvents).values({
      kind: "llm",
      userId: job.userId,
      tenantId: job.tenantId,
      matterId: job.matterId,
      tokenId: job.credentialId,
      provider: usage.provider,
      model: usage.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
    });
    await tx
      .update(jobSpendReservations)
      .set({
        state: "settled",
        actualTokens: usage.inputTokens + usage.outputTokens,
        actualUsd: estimateCostUsd(usage.model, usage.inputTokens, usage.outputTokens),
      })
      .where(eq(jobSpendReservations.id, reservation.id));
  });
}

/** Release only when dispatch is known not to have reached inference. */
export async function releaseJobSpend(job: DurableJob) {
  await db
    .update(jobSpendReservations)
    .set({ state: "released" })
    .where(
      and(
        eq(jobSpendReservations.jobId, job.id),
        eq(jobSpendReservations.leaseEpoch, job.leaseEpoch),
        eq(jobSpendReservations.state, "reserved")
      )
    );
}
