import { type Job, Queue, Worker } from "bullmq";
import IORedis, { type Redis } from "ioredis";
import { getEnv } from "../core/config.js";
import { logEvent } from "../core/log.js";

// Background job queue (BullMQ over Redis). Today it carries one job type:
// embedding a document's chunks off the request path so the retrieval index
// stays warm. Optional infrastructure — when REDIS_URL is unset every entry
// point below is a no-op and embedding falls back to the lazy query-time path
// (see ensureEmbeddings). Job payloads carry IDs only, never document text or
// keys, so nothing sensitive is written to Redis.

const EMBEDDING_QUEUE = "embedding";

type EmbeddingJob = { documentId: string };

let connection: Redis | null | undefined;
let embeddingQueue: Queue<EmbeddingJob> | null | undefined;

// A single shared ioredis connection for the producer side. `maxRetriesPerRequest:
// null` is required by BullMQ. Returns null (and stays null) when REDIS_URL is
// unset so callers degrade to the lazy fallback instead of throwing.
function getConnection(): Redis | null {
  if (connection !== undefined) return connection;
  const url = getEnv("REDIS_URL")?.trim();
  if (!url) {
    connection = null;
    return null;
  }
  const client = new IORedis(url, { maxRetriesPerRequest: null });
  client.on("error", (err) => {
    logEvent("warn", "queue.redis_error", { error: err.message });
  });
  connection = client;
  return client;
}

function getEmbeddingQueue(): Queue<EmbeddingJob> | null {
  if (embeddingQueue !== undefined) return embeddingQueue;
  const redisConnection = getConnection();
  const queue = redisConnection
    ? new Queue<EmbeddingJob>(EMBEDDING_QUEUE, { connection: redisConnection })
    : null;
  embeddingQueue = queue;
  return queue;
}

// Producer. Enqueue a document for background embedding. The jobId is derived from
// the document id so re-enqueuing a document already waiting collapses into one
// job (dedup) — extraction and each edit both fire this, and only the latest
// state needs embedding. Never throws: a Redis outage logs and returns, leaving
// the lazy query-time path to fill the gap.
export async function enqueueEmbedding(documentId: string): Promise<void> {
  const queue = getEmbeddingQueue();
  if (!queue) return;
  try {
    await queue.add(
      "embed",
      { documentId },
      {
        jobId: `embed-${documentId}`,
        removeOnComplete: true,
        removeOnFail: { count: 100 },
        attempts: 3,
        backoff: { type: "exponential", delay: 2_000 },
      }
    );
  } catch (err) {
    logEvent("warn", "queue.enqueue_failed", {
      documentId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

let worker: Worker<EmbeddingJob> | null | undefined;

// Consumer. Start the embedding worker once per process. Safe to call when
// REDIS_URL is unset (no-op) and idempotent across dev HMR reloads. The handler
// dynamic-imports the embed function to avoid a static platform -> content ->
// platform module cycle.
export function startEmbeddingWorker(): void {
  if (worker !== undefined) return;
  const redisConnection = getConnection();
  if (!redisConnection) {
    worker = null;
    return;
  }
  worker = new Worker<EmbeddingJob>(
    EMBEDDING_QUEUE,
    async (job: Job<EmbeddingJob>) => {
      const { embedDocumentChunks } = await import("../content/chunks.js");
      await embedDocumentChunks(job.data.documentId);
    },
    { connection: redisConnection, concurrency: 4 }
  );
  worker.on("failed", (job, err) => {
    logEvent("warn", "queue.embed_failed", {
      documentId: job?.data.documentId,
      attempts: job?.attemptsMade,
      error: err.message,
    });
  });
  logEvent("info", "queue.embed_worker_started", {});
}
