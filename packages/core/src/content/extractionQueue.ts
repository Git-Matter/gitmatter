import { randomUUID } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  documents,
  documentVersions,
  usageEvents,
  type Document,
  type DurableJob,
} from "@workspace/db/schema";
import type { JobErrorCode } from "@workspace/contracts";
import {
  authorizeJob,
  authorizeJobInTransaction,
  claimJob,
  completeJob,
  failJob,
  heartbeatJob,
  JobError,
  lockJobLease,
} from "../core/jobs.js";
import { recordCommitInTransaction } from "../core/commit.js";
import { getObject } from "../core/storage.js";
import { getEnvNumber } from "../core/config.js";
import { reconcileStagedObjects } from "../core/staged-objects.js";
import { logEvent } from "../core/log.js";
import { recordFunnel } from "../core/funnel.js";
import { emitDocStatus } from "./extractionEvents.js";
import { assertFileTypeMatches, extractMarkdown, type SupportedFileType } from "./extract.js";
import { inspectVersionWordBytes } from "./docx/inspection.js";

const WORKER = Symbol.for("gitmatter.extractionWorker");
type WorkerControl = { stop: () => void; wake: () => void };
const runtime = globalThis as Record<symbol, WorkerControl | undefined>;

/** Upload/version commits already accepted the job. This only wakes durable polling. */
export function enqueueExtraction(_doc: Document): void {
  startExtractionWorker().wake();
}

/** Polling owns no correctness state; stopping/restarting retains accepted jobs. */
export function startExtractionWorker(): WorkerControl {
  if (runtime[WORKER]) return runtime[WORKER];
  let stopped = false;
  let running = false;
  let lastReconciliation = 0;
  const run = async () => {
    if (stopped || running) return;
    running = true;
    try {
      if (Date.now() - lastReconciliation > 60_000) {
        lastReconciliation = Date.now();
        await reconcileStagedObjects();
      }
      for (let n = 0; n < 8 && !stopped; n++) {
        if (!(await runExtractionOnce())) {
          const { runReviewJobOnce } = await import("../ai/tabular/jobs.js");
          if (!(await runReviewJobOnce())) break;
        }
      }
    } catch {
      logEvent("warn", "jobs.poll_failed", {});
    } finally {
      running = false;
    }
  };
  const timer = setInterval(
    () => {
      void run();
    },
    Math.max(250, getEnvNumber("JOB_POLL_MS", 1000))
  );
  timer.unref();
  const control: WorkerControl = {
    stop: () => {
      stopped = true;
      clearInterval(timer);
      delete runtime[WORKER];
    },
    wake: () => {
      void run();
    },
  };
  runtime[WORKER] = control;
  control.wake();
  return control;
}

async function markRunning(job: DurableJob) {
  await db.transaction(async (tx) => {
    await lockJobLease(tx, job);
    const actor = await authorizeJobInTransaction(tx, job);
    await recordCommitInTransaction(tx, {
      artifactType: "document",
      artifactId: job.artifactId,
      actor,
      op: "extraction_started",
      message: "Started source extraction",
      apply: async ({ tx: commitTx }) => {
        const [doc] = await commitTx
          .select()
          .from(documents)
          .where(eq(documents.id, job.artifactId));
        if (!doc || doc.deletedAt || doc.currentVersionId !== job.inputVersionId)
          throw new JobError("stale_source");
        await commitTx
          .update(documents)
          .set({
            status: "processing",
            claimedAt: sql`now()`,
            attempts: job.attempts,
            extractionError: null,
          })
          .where(eq(documents.id, doc.id));
        return {
          changes: [{ path: "status", before: doc.status, after: "processing" }],
          summary: { jobId: job.id, attempt: job.attempts },
        };
      },
    });
  });
  emitDocStatus({
    userId: job.userId,
    id: job.artifactId,
    status: "processing",
    extractionError: null,
  });
}

export async function runExtractionOnce(documentId?: string): Promise<boolean> {
  const job = await claimJob(randomUUID(), documentId);
  if (!job) return false;
  const started = performance.now();
  let leaseAlive = true;
  let phase: "access" | "storage" | "extract" | "apply" = "access";
  const heartbeat = setInterval(
    () => {
      void heartbeatJob(job)
        .then((alive) => {
          if (!alive) leaseAlive = false;
        })
        .catch(() => {
          leaseAlive = false;
        });
    },
    Math.max(1000, Math.min(10_000, (getEnvNumber("JOB_LEASE_SECONDS", 30) * 1000) / 3))
  );
  heartbeat.unref();
  try {
    if (job.attempts > job.maxAttempts) throw new JobError("attempts_exhausted");
    await markRunning(job);
    const [version] = await db
      .select()
      .from(documentVersions)
      .where(
        and(
          eq(documentVersions.id, job.inputVersionId),
          eq(documentVersions.documentId, job.artifactId)
        )
      );
    if (!version?.storagePath || version.deletedAt) throw new JobError("input_not_ready");
    phase = "storage";
    const bytes = Buffer.from(await getObject(job.tenantId, version.storagePath));
    if (!leaseAlive) throw new JobError("lease_lost");
    phase = "extract";
    if (!assertFileTypeMatches(`source.${version.fileType}`, bytes).ok)
      throw new JobError("unsupported_format");
    if (version.fileType === "docx") await inspectVersionWordBytes(bytes, version.wordInspection);
    const { markdown, pageCount } = await extractMarkdown(
      bytes,
      version.fileType as SupportedFileType
    );
    const ocrSuggested =
      version.fileType === "pdf" && markdown.trim().length / Math.max(1, pageCount ?? 1) < 40;
    if (!leaseAlive) throw new JobError("lease_lost");
    phase = "apply";
    await completeJob(job, async (tx, actor) => {
      const recorded = await recordCommitInTransaction(tx, {
        artifactType: "document",
        artifactId: job.artifactId,
        actor: {
          type: "agent",
          userId: actor.userId,
          agentLabel: "extractor",
          ...(actor.type === "agent" ? { scope: actor.scope } : {}),
        },
        op: "extract",
        message: `Extracted markdown (${version.fileType})`,
        apply: async ({ tx: commitTx }) => {
          const [current] = await commitTx
            .select()
            .from(documents)
            .where(eq(documents.id, job.artifactId));
          if (!current || current.deletedAt || current.currentVersionId !== job.inputVersionId)
            throw new JobError("stale_source");
          await commitTx
            .update(documents)
            .set({
              markdown,
              ...(current.approvedVersionId === job.inputVersionId
                ? { approvedMarkdown: markdown }
                : {}),
              pageCount,
              status: "ready",
              extractionError: null,
              claimedAt: null,
              ocrSuggested,
            })
            .where(eq(documents.id, job.artifactId));
          return {
            changes: [
              { path: "markdown", before: current.markdown, after: markdown },
              { path: "status", before: current.status, after: "ready" },
              ...(current.approvedVersionId === job.inputVersionId &&
              current.approvedMarkdown !== markdown
                ? [
                    {
                      path: "approvedBaseline",
                      before: {
                        versionId: current.approvedVersionId,
                        markdown: current.approvedMarkdown,
                      },
                      after: { versionId: current.approvedVersionId, markdown },
                    },
                  ]
                : []),
            ],
            summary: { jobId: job.id, sourceVersionId: job.inputVersionId, initiatingActor: actor },
          };
        },
      });
      await tx.insert(usageEvents).values({
        kind: "extraction",
        userId: job.userId,
        tenantId: job.tenantId,
        matterId: job.matterId,
      });
      return recorded.commit!.id;
    });
    recordFunnel("extraction_ready", {
      actorType: "agent",
      documentId: job.artifactId,
      matterId: job.matterId ?? undefined,
      durationMs: performance.now() - started,
      pageCount: pageCount ?? undefined,
      characterCount: markdown.length,
      outcome: "succeeded",
    });
    emitDocStatus({
      userId: job.userId,
      id: job.artifactId,
      status: "ready",
      extractionError: null,
      ocrSuggested,
    });
  } catch (error) {
    const code: JobErrorCode =
      error instanceof JobError && error.code !== "lease_lost" && error.code !== "request_conflict"
        ? error.code
        : phase === "storage"
          ? "storage_unavailable"
          : "extraction_failed";
    try {
      await failJob(job, code, phase === "storage", async (tx, state) => {
        try {
          await authorizeJob(job, tx);
        } catch {
          return;
        }
        await recordCommitInTransaction(tx, {
          artifactType: "document",
          artifactId: job.artifactId,
          actor: job.actor,
          op: "extraction_failed",
          message:
            state === "cancelled" ? "Cancelled source extraction" : "Source extraction failed",
          skipIfNoChanges: true,
          apply: async ({ tx: commitTx }) => {
            const [doc] = await commitTx
              .select()
              .from(documents)
              .where(eq(documents.id, job.artifactId));
            if (!doc || doc.deletedAt || doc.currentVersionId !== job.inputVersionId)
              return { changes: [] };
            const safeError = state === "cancelled" ? "Extraction cancelled" : code;
            await commitTx
              .update(documents)
              .set({ status: "failed", extractionError: safeError, claimedAt: null })
              .where(eq(documents.id, doc.id));
            return {
              changes: [{ path: "status", before: doc.status, after: "failed" }],
              summary: { jobId: job.id, errorCode: code },
            };
          },
        });
      });
      recordFunnel("extraction_failed", {
        actorType: "agent",
        documentId: job.artifactId,
        outcome: "failed",
        failureCategory: "extraction",
      });
    } catch (failure) {
      if (!(failure instanceof JobError && failure.code === "lease_lost"))
        logEvent("warn", "jobs.failure_record_failed", { jobId: job.id });
    }
    logEvent("warn", "jobs.extraction_failed", { jobId: job.id, errorCode: code });
  } finally {
    clearInterval(heartbeat);
  }
  return true;
}
