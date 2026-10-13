import { randomUUID } from "node:crypto";
import { db } from "@workspace/db/client";
import { jobSpendReservations, type DurableJob } from "@workspace/db/schema";
import { eq, sql } from "drizzle-orm";
import { getUserTenant } from "../../core/access.js";
import {
  dispatchProviderSpend,
  reserveProviderSpend,
  reserveJobSpend,
  settleProviderSpend,
  type ProviderSpendContext,
} from "../../core/job-spend.js";
import { JobError } from "../../core/jobs.js";
import { providerForModel } from "./catalog.js";
import { THINKING_BUDGET } from "./shared.js";
import type { CompleteRequest, CompleteResult } from "./types.js";

export type ProviderCallContext = ProviderSpendContext & { durableJob?: DurableJob };

/** Admission is server-authoritative and shared by buffered and streaming application calls. */
export async function withProviderSpend(
  context: ProviderCallContext | undefined,
  req: CompleteRequest,
  execute: (protectedRequest: CompleteRequest) => Promise<CompleteResult>
): Promise<CompleteResult> {
  if (!context) throw new JobError("access_denied");
  const tenantId = await getUserTenant(context.actor.userId);
  if (!tenantId) throw new JobError("access_denied");
  const maxTokens = req.maxTokens ?? 2048;
  if (!Number.isSafeInteger(maxTokens) || maxTokens <= 0 || maxTokens > 65_536)
    throw new JobError("limit_reached");
  const outputTokens = maxTokens + (req.reasoning ? THINKING_BUDGET[req.reasoning] : 0);
  const inputTokens =
    Buffer.byteLength(
      JSON.stringify({
        system: req.system,
        messages: req.messages,
        tools: req.tools,
        jsonSchema: req.jsonSchema,
      }),
      "utf8"
    ) + 4096;
  if (
    context.durableJob &&
    (context.durableJob.userId !== context.actor.userId ||
      context.durableJob.model !== req.model ||
      context.durableJob.tenantId !== tenantId)
  )
    throw new JobError("access_denied");
  const reservation = context.durableJob
    ? await reserveJobSpend(context.durableJob, inputTokens, outputTokens)
    : await reserveProviderSpend(
        {
          userId: context.actor.userId,
          actor: context.actor,
          tenantId,
          matterId: context.matterId ?? null,
          credentialId: context.credentialId ?? null,
          runId: context.runId ?? randomUUID(),
          model: req.model,
          sourceKind: context.sourceKind,
        },
        inputTokens,
        outputTokens
      );
  const reservationId = reservation.id;
  let reserved: typeof reservation;
  try {
    reserved = await dispatchProviderSpend(reservationId, context.actor, req.model);
  } catch (error) {
    await settleProviderSpend(reservationId, undefined, true);
    throw error;
  }
  if (reserved.reservedTokens < inputTokens + outputTokens) {
    await settleProviderSpend(reservationId, undefined, true);
    throw new JobError("limit_reached");
  }
  // Heartbeats govern concurrency only. A crash/unknown provider result retains spend forever.
  const heartbeat = setInterval(() => {
    void db
      .update(jobSpendReservations)
      .set({ leaseExpiresAt: sql`now() + interval '10 minutes'` })
      .where(eq(jobSpendReservations.id, reservationId!))
      .catch(() => {});
  }, 60_000);
  heartbeat.unref();
  try {
    const result = await execute({ ...req, maxTokens, maxRetries: 0 });
    await settleProviderSpend(
      reservationId,
      result.usage
        ? { ...result.usage, model: req.model, provider: providerForModel(req.model) }
        : undefined
    );
    return result;
  } catch (error) {
    const metadata =
      error && typeof error === "object" ? (error as { status?: unknown; code?: unknown }) : {};
    const noInference =
      metadata.status === 429 || metadata.code === "ECONNREFUSED" || metadata.code === "ENOTFOUND";
    await settleProviderSpend(reservationId, undefined, noInference);
    throw error;
  } finally {
    clearInterval(heartbeat);
  }
}
