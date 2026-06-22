import type { Document } from "@workspace/db/schema";
import { recordExtraction } from "../platform/usage.js";
import { processDocument } from "./documents.js";

// Per-user extraction queue. Runs one extraction at a time per user: extra
// uploads chain behind the user's current job instead of parsing several PDFs at
// once. In-memory (single web instance), so the chain is lost on restart — a doc
// left `processing` is recovered via the manual retry button.

const chains = new Map<string, Promise<void>>();

export function enqueueExtraction(doc: Document): void {
  // Meter the job against the per-user extraction budget (log-only).
  void recordExtraction({ userId: doc.userId, tenantId: doc.tenantId });
  const prev = chains.get(doc.userId) ?? Promise.resolve();
  // Swallow the previous job's failure so one bad doc doesn't stall the chain.
  const next = prev.catch(() => {}).then(() => processDocument(doc));
  chains.set(doc.userId, next);
  void next.finally(() => {
    // Drop the entry only if nothing newer queued behind us.
    if (chains.get(doc.userId) === next) chains.delete(doc.userId);
  });
}
