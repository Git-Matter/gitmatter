import { and, eq, sql, type SQL } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { jobSpendReservations, usageEvents, type DurableJob } from "@workspace/db/schema";
import { estimateCostUsd } from "@workspace/registry";
import { getEnvNumber } from "./config.js";
import { JobError, lockJobLease } from "./jobs.js";

export type RunEstimate = {
  model: string;
  cells: number;
  inputTokenUpperEstimate: number;
  outputTokenLimit: number;
  costUsd: number | null;
  budgetWindowMinutes: number;
  tokenLimits: { tenant: number; user: number; matter: number; token: number; run: number };
  tenantCostLimitUsd: number;
  costLimitScope: "durable_review";
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
    costLimitScope: "durable_review",
    tenantCostLimitUsd: getEnvNumber("TENANT_LLM_COST_BUDGET_USD", 0),
  };
}

/** Hard dispatch limits for durable provider work; reservations serialize globally. */
export async function reserveJobSpend(job: DurableJob, inputTokens: number, outputTokens: number) {
  if (
    !job.model ||
    ![inputTokens, outputTokens].every((n) => Number.isSafeInteger(n) && n >= 0) ||
    inputTokens + outputTokens > 2_147_483_647
  )
    throw new JobError("input_not_ready");
  const model = job.model!;
  const estimate = estimateReviewRun(model, []);
  const tokens = inputTokens + outputTokens;
  const cost = estimateCostUsd(model, inputTokens, outputTokens);
  return db.transaction(async (tx) => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext('job-spend-capacity'))`);
    await lockJobLease(tx, job);
    const [existing] = await tx
      .select()
      .from(jobSpendReservations)
      .where(
        and(
          eq(jobSpendReservations.jobId, job.id),
          eq(jobSpendReservations.leaseEpoch, job.leaseEpoch)
        )
      );
    if (existing) throw new JobError("limit_reached"); // never dispatch an attempt twice
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
        })
        .from(jobSpendReservations)
        .where(
          and(
            eq(jobSpendReservations.tenantId, job.tenantId),
            sql`${jobSpendReservations.state} <> 'released'`,
            sql`(${jobSpendReservations.state} in ('reserved','unknown') or ${jobSpendReservations.createdAt} >= now() - (${estimate.budgetWindowMinutes} * interval '1 minute'))`
          )
        );
      if (Number(spent?.cost ?? 0) + cost > estimate.tenantCostLimitUsd)
        throw new JobError("limit_reached");
    }
    const [reservation] = await tx
      .insert(jobSpendReservations)
      .values({
        jobId: job.id,
        leaseEpoch: job.leaseEpoch,
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
