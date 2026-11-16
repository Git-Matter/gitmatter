import { type Job, Queue, type RedisOptions, Worker } from "bullmq";
import { getEnv } from "../core/config.js";
import { logEvent } from "../core/log.js";

// Background job queue (BullMQ over Redis). Today it carries one job type:
// embedding a document's chunks off the request path so the retrieval index
// stays warm. Without REDIS_URL these entry points are no-ops; explicit generation
// can still fill missing vectors lazily. Job payloads carry IDs only, never
// document text or keys.

const EMBEDDING_QUEUE = "embedding";

type EmbeddingJob = { documentId: string };

let connection: RedisOptions | null | undefined;
let embeddingQueue: Queue<EmbeddingJob> | null | undefined;

// Let BullMQ construct its compatible Redis client. Producers fail promptly on
// an outage; the worker overrides the retry limit to keep its blocking connection.
function getConnection(): RedisOptions | null {
  if (connection !== undefined) return connection;
  const url = getEnv("REDIS_URL")?.trim();
  if (!url) {
    connection = null;
    return null;
  }
  connection = { url, maxRetriesPerRequest: 1 };
  return connection;
}

function getEmbeddingQueue(): Queue<EmbeddingJob> | null {
  if (embeddingQueue !== undefined) return embeddingQueue;
  const redisConnection = getConnection();
  const queue = redisConnection
    ? new Queue<EmbeddingJob>(EMBEDDING_QUEUE, { connection: redisConnection })
    : null;
  queue?.on("error", () => logEvent("warn", "queue.redis_error", {}));
  embeddingQueue = queue;
  return queue;
}

// Producer. Enqueue a document for background embedding. The jobId is derived from
// the document id so re-enqueuing a document already waiting collapses into one
// job (dedup). Extraction enqueues after its source transaction commits; edits
// rebuild chunks and leave missing vectors to explicit generation-time lookup.
// Redis failures log and return, leaving that lazy path to fill the gap.
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

// Start one worker per loaded module, or skip it when REDIS_URL is unset.
// The handler imports the embed function lazily to avoid a runtime module cycle.
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
    { connection: { ...redisConnection, maxRetriesPerRequest: null }, concurrency: 4 }
  );
  worker.on("error", () => logEvent("warn", "queue.redis_error", {}));
  worker.on("failed", (job, err) => {
    logEvent("warn", "queue.embed_failed", {
      documentId: job?.data.documentId,
      attempts: job?.attemptsMade,
      error: err.message,
    });
  });
  logEvent("info", "queue.embed_worker_started", {});
}
