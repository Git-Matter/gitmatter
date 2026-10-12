import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db, type DB, type Tx } from "@workspace/db/client";
import {
  documents,
  jobs,
  tabularCells,
  tabularReviews,
  type DurableJob,
  type TabularReview,
} from "@workspace/db/schema";
import type { ContractReviewSnapshot } from "@workspace/contracts";
import { type Actor, recordCommitInTransaction } from "../../core/commit.js";
import { canAccessArtifact, canReadDocument } from "../../core/access.js";
import {
  authorizeJob,
  claimJob,
  completeJob,
  failJob,
  heartbeatJob,
  JobError,
} from "../../core/jobs.js";
import {
  estimateReviewRun,
  reserveJobSpend,
  settleJobSpend,
  releaseJobSpend,
} from "../../core/job-spend.js";
import { DEFAULT_MODEL, LLM_MODELS, resolveRunModel } from "../provider/index.js";
import { buildCellPrompt } from "../prompts/tabular.js";
import { commitCell } from "./runner.js";
import { queryCell } from "./extract.js";

import { canonicalFingerprint as hash } from "../../core/fingerprint.js";

function cellInput(review: TabularReview, documentId: string, columnIndex: number) {
  const source = review.inputSnapshot?.documents.find((d) => d.id === documentId);
  const column = review.columnsConfig.find((c) => c.index === columnIndex);
  if (!source || !column) throw new JobError("input_not_ready");
  return { source, column, fingerprint: hash({ source, column }) };
}

export async function estimateDurableReview(actor: Actor, reviewId: string, model = DEFAULT_MODEL) {
  if (!(await canAccessArtifact(actor, "tabular_review", reviewId, "editor")))
    throw new JobError("access_denied");
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
  if (!review) throw new JobError("input_not_ready");
  if (!LLM_MODELS.some((m) => m.id === model) && !model.includes("/"))
    throw new JobError("input_not_ready");
  const prompts: Array<{ system: string; user: string }> = [];
  for (const documentId of review.documentIds) {
    if (!(await canReadDocument(actor, documentId))) throw new JobError("access_denied");
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc || doc.status !== "ready" || doc.deletedAt) throw new JobError("input_not_ready");
    const source = review.inputSnapshot?.documents.find((d) => d.id === documentId);
    for (const column of review.columnsConfig)
      prompts.push(
        buildCellPrompt({
          filename: source?.title ?? doc.title,
          documentText: source?.text ?? doc.markdown ?? "",
          columnPrompt: column.prompt,
          format: column.format,
          tags: column.tags,
        })
      );
  }
  return estimateReviewRun(model, prompts);
}

/** Accept all required cell units together. Closing a stream never owns work. */
export async function queueReviewRun(
  actor: Actor,
  params: { reviewId: string; model?: string; requestId?: string; credentialId?: string }
) {
  if (actor.type === "agent" && !params.credentialId) throw new JobError("access_denied");
  if (!(await canAccessArtifact(actor, "tabular_review", params.reviewId, "editor")))
    throw new JobError("access_denied");
  const model = params.model ?? DEFAULT_MODEL;
  const estimate = await estimateDurableReview(actor, params.reviewId, model);
  const total = estimate.inputTokenUpperEstimate + estimate.outputTokenLimit;
  if (estimate.tokenLimits.run > 0 && total > estimate.tokenLimits.run)
    throw new JobError("limit_reached");
  if (
    estimate.tenantCostLimitUsd > 0 &&
    (estimate.costUsd === null || estimate.costUsd > estimate.tenantCostLimitUsd)
  )
    throw new JobError("limit_reached");
  const requestId = params.requestId ?? randomUUID();
  const runId = randomUUID();
  return db.transaction(async (tx) => {
    let acceptedIds: string[] = [];
    const result = await recordCommitInTransaction(tx, {
      actor,
      artifactType: "tabular_review",
      artifactId: params.reviewId,
      op: "run_queued",
      message: "Queued durable review",
      skipIfNoChanges: true,
      apply: async ({ tx: commitTx }) => {
        const [review] = await commitTx
          .select()
          .from(tabularReviews)
          .where(eq(tabularReviews.id, params.reviewId));
        if (!review?.tenantId || !review.documentIds.length || !review.columnsConfig.length)
          throw new JobError("input_not_ready");
        if (!review.inputSnapshot) {
          const sources: ContractReviewSnapshot["documents"] = [];
          for (const id of review.documentIds) {
            if (!(await canReadDocument(actor, id, commitTx))) throw new JobError("access_denied");
            const [doc] = await commitTx
              .select()
              .from(documents)
              .where(eq(documents.id, id))
              .for("share");
            if (!doc || doc.status !== "ready" || doc.deletedAt)
              throw new JobError("input_not_ready");
            sources.push({
              id,
              title: doc.title,
              versionId: doc.currentVersionId,
              headCommitId: doc.headCommitId,
              text: doc.markdown ?? "",
            });
          }
          review.inputSnapshot = {
            revision: 1,
            createdAt: new Date().toISOString(),
            playbookId: "ad-hoc",
            playbookRevision: hash(review.columnsConfig),
            rules: [],
            documents: sources,
          };
          await commitTx
            .update(tabularReviews)
            .set({ inputSnapshot: review.inputSnapshot })
            .where(eq(tabularReviews.id, review.id));
        }
        const createdIds: string[] = [];
        for (const documentId of review.documentIds) {
          if (!(await canReadDocument(actor, documentId, commitTx)))
            throw new JobError("access_denied");
          for (const column of review.columnsConfig) {
            const input = cellInput(review, documentId, column.index);
            const fingerprint = hash({
              reviewId: review.id,
              input: input.fingerprint,
              actor,
              model,
              credentialId: params.credentialId ?? null,
            });
            const unitRequest = `${requestId}:${documentId}:${column.index}`;
            const [existing] = await commitTx
              .select()
              .from(jobs)
              .where(
                and(
                  eq(jobs.tenantId, review.tenantId),
                  eq(jobs.userId, actor.userId),
                  eq(jobs.kind, "review_cell"),
                  eq(jobs.requestId, unitRequest)
                )
              );
            if (existing) {
              if (existing.fingerprint !== fingerprint) throw new JobError("request_conflict");
              acceptedIds.push(existing.id);
              continue;
            }
            const [cell] = await commitTx
              .select()
              .from(tabularCells)
              .where(
                and(
                  eq(tabularCells.reviewId, review.id),
                  eq(tabularCells.documentId, documentId),
                  eq(tabularCells.columnIndex, column.index)
                )
              );
            const [job] = await commitTx
              .insert(jobs)
              .values({
                kind: "review_cell",
                artifactType: "tabular_review",
                artifactId: review.id,
                sourceDocumentId: documentId,
                columnIndex: column.index,
                model,
                snapshotFingerprint: input.fingerprint,
                baseCellCommitId: cell?.lastCommitId,
                runId,
                userId: actor.userId,
                actor,
                credentialId: params.credentialId,
                tenantId: review.tenantId,
                matterId: review.matterId,
                inputVersionId: input.source.versionId ?? input.source.headCommitId ?? documentId,
                requestId: unitRequest,
                fingerprint,
              })
              .returning();
            acceptedIds.push(job!.id);
            createdIds.push(job!.id);
          }
        }
        return {
          changes: createdIds.length
            ? [
                {
                  path: `execution/${runId}`,
                  before: null,
                  after: {
                    model,
                    jobIds: createdIds,
                    state: "queued",
                    snapshot: review.inputSnapshot,
                  },
                },
              ]
            : [],
          summary: { runId, model, jobIds: createdIds },
        };
      },
    });
    const [firstJob] = acceptedIds.length
      ? await tx.select({ runId: jobs.runId }).from(jobs).where(eq(jobs.id, acceptedIds[0]!))
      : [];
    return {
      outcome: "queued" as const,
      runId: firstJob?.runId ?? runId,
      jobIds: acceptedIds,
      commitId: result.commit?.id ?? null,
      estimate,
    };
  });
}

async function sourceStillCurrent(job: DurableJob, review: TabularReview, reader: DB | Tx = db) {
  const input = cellInput(review, job.sourceDocumentId!, job.columnIndex!);
  if (input.fingerprint !== job.snapshotFingerprint) throw new JobError("stale_source");
  const [doc] = await reader
    .select()
    .from(documents)
    .where(eq(documents.id, job.sourceDocumentId!));
  if (
    !doc ||
    doc.deletedAt ||
    doc.status !== "ready" ||
    doc.currentVersionId !== input.source.versionId ||
    (doc.markdown ?? "") !== input.source.text
  )
    throw new JobError("stale_source");
  return input;
}

/** Pure provider execution outside locks, then one fenced legal/checkpoint transaction. */
export async function runReviewJobOnce(): Promise<boolean> {
  const job = await claimJob(randomUUID(), undefined, "review_cell");
  if (!job) return false;
  let leaseAlive = true;
  let dispatched = false;
  let settled = false;
  const heartbeat = setInterval(() => {
    void heartbeatJob(job)
      .then((alive) => {
        if (!alive) leaseAlive = false;
      })
      .catch(() => {
        leaseAlive = false;
      });
  }, 5000);
  heartbeat.unref();
  let usage:
    | { provider: string; model: string; inputTokens: number; outputTokens: number }
    | undefined;
  try {
    if (job.attempts > job.maxAttempts) throw new JobError("attempts_exhausted");
    const authorized = await authorizeJob(job);
    const [review] = await db
      .select()
      .from(tabularReviews)
      .where(eq(tabularReviews.id, job.artifactId));
    if (!review) throw new JobError("input_not_ready");
    const { source, column } = await sourceStillCurrent(job, review);
    const { model, key } = await resolveRunModel(job.userId, job.model!);
    if (model !== job.model) throw new JobError("stale_source");
    const prompt = buildCellPrompt({
      filename: source.title,
      documentText: source.text,
      columnPrompt: column.prompt,
      format: column.format,
      tags: column.tags,
    });
    await reserveJobSpend(job, Buffer.byteLength(prompt.system + prompt.user, "utf8") + 4096, 2048);
    await authorizeJob(job);
    if (!leaseAlive) throw new JobError("lease_lost");
    dispatched = true;
    const result = await queryCell({
      maxRetries: 0,
      model,
      filename: source.title,
      documentText: source.text,
      columnPrompt: column.prompt,
      format: column.format,
      tags: column.tags,
      apiKey: key,
      cache: true,
      cacheKey: `review:${job.artifactId}:${source.id}`.slice(0, 64),
      onUsage: (value) => {
        usage = value;
      },
    });
    await settleJobSpend(job, usage);
    settled = true;
    if (!leaseAlive) throw new JobError("lease_lost");
    await completeJob(job, async (tx, refreshedActor) => {
      await tx.execute(
        sql`select pg_advisory_xact_lock(hashtext(${`tabular_review:${review.id}`}))`
      );
      await tx
        .select({ id: documents.id })
        .from(documents)
        .where(eq(documents.id, source.id))
        .for("share");
      const [currentReview] = await tx
        .select()
        .from(tabularReviews)
        .where(eq(tabularReviews.id, review.id));
      if (!currentReview) throw new JobError("stale_source");
      await sourceStillCurrent(job, currentReview, tx);
      // Provider output is agent-authored even when a person clicked Run.
      const author: Actor = {
        type: "agent",
        userId: refreshedActor.userId,
        agentLabel: authorized.type === "agent" ? authorized.agentLabel : "review-worker",
        ...(refreshedActor.type === "agent" ? { scope: refreshedActor.scope } : {}),
      };
      const recorded = await commitCell(
        author,
        {
          review: currentReview,
          reviewId: review.id,
          documentId: source.id,
          columnIndex: column.index,
          columnName: column.name,
          docTitle: source.title,
          model,
          ...result,
          expectedCellCommitId: job.baseCellCommitId,
          initiatingActor: job.actor,
          jobId: job.id,
        },
        tx
      );
      return recorded.commit!.id;
    });
  } catch (error) {
    const classified = classifyReviewFailure(error, dispatched, !!usage);
    if (classified.noCharge) await releaseJobSpend(job).catch(() => {});
    else if (dispatched && !settled) await settleJobSpend(job, usage).catch(() => {});
    await failJob(
      job,
      classified.code,
      classified.retryable,
      undefined,
      classified.retryAfterSeconds
    ).catch(() => {});
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}

/** Safe retry categories; no provider text or response body is retained. */
export function classifyReviewFailure(error: unknown, dispatched: boolean, usageKnown: boolean) {
  if (error instanceof JobError)
    return {
      code:
        error.code === "lease_lost" || error.code === "request_conflict"
          ? ("provider_unavailable" as const)
          : error.code,
      retryable: false,
      noCharge: !dispatched,
      retryAfterSeconds: undefined,
    };
  if (error instanceof Error && error.message === "stale_source")
    return {
      code: "stale_source" as const,
      retryable: false,
      noCharge: !dispatched,
      retryAfterSeconds: undefined,
    };
  const metadata =
    error && typeof error === "object"
      ? (error as {
          status?: unknown;
          code?: unknown;
          headers?: { get?: (name: string) => string | null };
        })
      : {};
  // 429 and failed connection establishment are confirmed pre-inference faults.
  // Timeouts/5xx after dispatch can hide a paid completion, so hold their estimate.
  const noCharge =
    !dispatched ||
    (!usageKnown &&
      (metadata.status === 429 ||
        metadata.code === "ECONNREFUSED" ||
        metadata.code === "ENOTFOUND"));
  let retryAfter: string | null | undefined;
  try {
    if (typeof metadata.headers?.get === "function")
      retryAfter = metadata.headers.get("retry-after");
  } catch {
    /* malformed provider metadata does not change retry eligibility */
  }
  const seconds = retryAfter ? Number(retryAfter) : undefined;
  return {
    code: noCharge ? ("provider_unavailable" as const) : ("provider_outcome_unknown" as const),
    retryable: dispatched && noCharge,
    noCharge,
    retryAfterSeconds:
      seconds !== undefined && Number.isFinite(seconds)
        ? Math.min(60, Math.max(0, seconds))
        : undefined,
  };
}
