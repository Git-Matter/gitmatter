/** Content-free operational events shared by UI and engine. */
export type FunnelEventName =
  | "upload_started"
  | "upload_failed"
  | "extraction_ready"
  | "extraction_failed"
  | "review_usage"
  | "playbook_started"
  | "playbook_completed"
  | "playbook_failed"
  | "finding_opened"
  | "redline_proposed"
  | "redline_resolved"
  | "redline_failed"
  | "document_exported"
  | "document_export_failed";

export type FunnelProperties = {
  actorType: "user" | "agent";
  documentId?: string;
  matterId?: string;
  reviewId?: string;
  workflowId?: string;
  columnIndex?: number;
  durationMs?: number;
  pageCount?: number;
  characterCount?: number;
  documentCount?: number;
  cellCount?: number;
  failedCount?: number;
  inputTokens?: number;
  outputTokens?: number;
  provider?: "anthropic" | "openai" | "gemini" | "openrouter";
  model?: string;
  outcome?: "succeeded" | "partial" | "failed";
  decision?: "accept" | "reject";
  failureCategory?: "storage" | "extraction" | "provider" | "validation" | "unknown";
};
