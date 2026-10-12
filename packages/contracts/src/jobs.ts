/** Durable work wire shapes. Inputs and credential references stay server-side. */
export type JobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";
export type JobErrorCode =
  | "access_denied"
  | "stale_source"
  | "input_not_ready"
  | "unsupported_format"
  | "extraction_failed"
  | "storage_unavailable"
  | "limit_reached"
  | "attempts_exhausted"
  | "provider_unavailable"
  | "provider_outcome_unknown";

export type JobSnapshot = {
  id: string;
  kind: "document_extraction" | "review_cell";
  documentId: string;
  columnIndex: number | null;
  artifactId: string;
  state: JobState;
  revision: number;
  attempts: number;
  maxAttempts: number;
  completed: number;
  total: number;
  errorCode: JobErrorCode | null;
  nextAttemptAt: string;
  cancellationRequestedAt: string | null;
  resultCommitId: string | null;
  updatedAt: string;
  usage?: {
    uncertainAttempts: number;
    knownTokens: number;
    heldTokenEstimate: number;
    knownEstimatedUsd: number | null;
    heldEstimatedUsd: number | null;
  };
};
