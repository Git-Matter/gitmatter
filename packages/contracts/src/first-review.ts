import type { LlmModel, LlmProvider } from "./llmProvider/index.js";

/** Read-only first-review facts, captured for the caller's current permissions. */
export type FirstReviewStatus = {
  capturedAt: string;
  organization: {
    name: string;
    storageRegion: "legacy" | "eu" | "us" | "au" | null;
    canPublishFirmStandard: boolean;
  };
  matters: Array<{ id: string; name: string; canEdit: boolean }>;
  mattersTruncated: boolean;
  matter: { id: string; name: string; canEdit: boolean } | null;
  application: {
    providers: Array<{
      provider: LlmProvider;
      label: string;
      available: boolean;
      source: "user" | "env" | null;
      models: LlmModel[];
    }>;
    /** Presence only; no provider request validates credentials or service availability. */
    verification: "configuration_only";
  };
  agent: {
    connections: Array<{
      label: string;
      kind: "static" | "oauth";
      lastUsedAt: string | null;
    }>;
    /** Observed use is historical, never proof that the client is online now. */
    recentlyUsed: boolean;
  };
  playbooks: Array<{ id: string; title: string; ruleCount: number }>;
  playbooksTruncated: boolean;
  documents: Array<{
    id: string;
    title: string;
    fileType: string;
    status: "pending" | "processing" | "ready" | "failed";
    ready: boolean;
    uploaded: boolean;
  }>;
  documentsTruncated: boolean;
  /** Permission filtering stopped at a bounded scan; absence is not established. */
  documentsSearchIncomplete: boolean;
  reviewSearchIncomplete: boolean;
  review: {
    id: string;
    title: string;
    instructionsCaptured: boolean;
    totalFindings: number;
    completedFindings: number;
    failedFindings: number;
    unresolvedFindings: number;
    pendingEdits: number;
    pendingApprovals: number;
    sourceChanged: boolean;
    decisionsComplete: boolean;
    cleanReady: boolean;
  } | null;
};
