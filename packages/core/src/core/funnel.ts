import { z } from "zod";
import type { FunnelEventName, FunnelProperties } from "@workspace/contracts";
import { LLM_MODELS } from "../ai/provider/catalog.js";
import { logEvent } from "./log.js";

const count = z.number().finite().nonnegative();
const id = z.string().uuid();
// Strip unknown properties at runtime, even if a caller bypasses TypeScript.
// Free-text error, prompt, filename, citation and agent-label fields never pass.
const propertiesSchema = z.object({
  actorType: z.enum(["user", "agent"]),
  documentId: id.optional(),
  matterId: id.optional(),
  reviewId: id.optional(),
  workflowId: id.optional(),
  columnIndex: count.int().optional(),
  durationMs: count.optional(),
  pageCount: count.optional(),
  characterCount: count.optional(),
  documentCount: count.optional(),
  cellCount: count.optional(),
  failedCount: count.optional(),
  inputTokens: count.optional(),
  outputTokens: count.optional(),
  provider: z.enum(["anthropic", "openai", "gemini", "openrouter"]).optional(),
  model: z
    .string()
    .transform((value) => LLM_MODELS.find((model) => model.id === value)?.id)
    .optional(),
  outcome: z.enum(["succeeded", "partial", "failed"]).optional(),
  decision: z.enum(["accept", "reject"]).optional(),
  failureCategory: z
    .enum(["storage", "extraction", "provider", "validation", "unknown"])
    .optional(),
});
const eventSchema = z.enum([
  "upload_started",
  "upload_failed",
  "extraction_ready",
  "extraction_failed",
  "review_usage",
  "playbook_started",
  "playbook_completed",
  "playbook_failed",
  "finding_opened",
  "redline_proposed",
  "redline_resolved",
  "redline_failed",
  "document_exported",
  "document_export_failed",
]);
export type FunnelSink = (event: FunnelEventName, properties: FunnelProperties) => void;
let sink: FunnelSink | null = null;
export function setFunnelSink(next: FunnelSink | null): void {
  sink = next;
}
export function recordFunnel(event: FunnelEventName, properties: FunnelProperties): void {
  const parsed = propertiesSchema.safeParse(properties);
  if (!eventSchema.safeParse(event).success || !parsed.success) return;
  try {
    logEvent("info", event, parsed.data);
  } catch {
    /* observation must not break work */
  }
  try {
    sink?.(event, parsed.data);
  } catch {
    /* analytics is best effort */
  }
}
