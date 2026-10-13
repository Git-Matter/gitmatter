import { z } from "zod";

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

/** Shared admission limits for application-funded provider work, never a provider billing guarantee. */
const tokenLimit = z.number().int().min(0).max(2_147_483_647);
const concurrency = z.number().int().min(1).max(100);
export const jobControlPolicySchema = z
  .object({
    budgetWindowMinutes: z.number().int().min(1).max(43_200),
    tenantTokenLimit: tokenLimit,
    userTokenLimit: tokenLimit,
    matterTokenLimit: tokenLimit,
    tokenTokenLimit: tokenLimit,
    runTokenLimit: tokenLimit,
    tenantCostLimitUsd: z.number().min(0).max(1_000_000),
    tenantConcurrency: concurrency,
    userConcurrency: concurrency,
    providerConcurrency: z
      .object({
        anthropic: concurrency,
        gemini: concurrency,
        openai: concurrency,
        openrouter: concurrency,
      })
      .strict(),
  })
  .strict();
export type JobControlPolicy = z.infer<typeof jobControlPolicySchema>;

export type JobUsageSummary = {
  knownTokens: number;
  heldTokens: number;
  knownEstimatedUsd: number;
  heldEstimatedUsd: number;
  unpricedAttempts: number;
};

export type MatterJobsSummary = {
  jobs: JobSnapshot[];
  counts: Record<JobState, number>;
  spend: JobUsageSummary;
  truncated: boolean;
};

export type JobControlsSnapshot = {
  revision: number;
  configured: JobControlPolicy | null;
  effective: JobControlPolicy;
  scope: "application_llm";
  usage: JobUsageSummary;
  capacity: { queued: number; running: number; failed: number };
};

export type JobUsageAttribution = JobUsageSummary & {
  matterId: string | null;
  actorId: string;
  actorType: "user" | "agent";
  agentLabel: string | null;
  provider: string | null;
  model: string;
  day: string;
  attempts: number;
};

export type JobNotification = { id: string; job: JobSnapshot; createdAt: string; read: boolean };
export type JobNotificationPage = { events: JobNotification[]; nextCursor: string | null };
