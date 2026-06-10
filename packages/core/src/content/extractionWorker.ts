import { claimNextDocument, processDocument } from "./documents.js";

// Background extraction worker. Polls Postgres for documents needing markdown
// extraction and processes them one at a time. State lives entirely in the DB
// (status + attempts + claimed_at), so the worker is durable across restarts and
// safe to run in multiple processes — `claimNextDocument` uses FOR UPDATE SKIP
// LOCKED so each row is handled once. Notification is poll-based: the frontend
// watches each document's `status`.

const IDLE_INTERVAL_MS = 3000;

let running = false;

export function startExtractionWorker(): void {
  if (running) return;
  running = true;

  const tick = async (): Promise<void> => {
    let processedAny = false;
    try {
      const doc = await claimNextDocument();
      if (doc) {
        processedAny = true;
        await processDocument(doc);
      }
    } catch (err) {
      // Swallow loop errors (e.g. transient DB blips) so the worker keeps polling.
      console.error("[extraction-worker] tick failed:", err);
    }
    // Drain the queue back-to-back while there is work; idle-poll otherwise.
    setTimeout(() => void tick(), processedAny ? 0 : IDLE_INTERVAL_MS);
  };

  void tick();
}
