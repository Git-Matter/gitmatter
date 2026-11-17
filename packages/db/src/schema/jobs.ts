import {
  doublePrecision,
  index,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants.js";
import type { MatterRole } from "./matters.js";
import type { JobControlPolicy, JobSnapshot } from "@workspace/contracts";

// Authorization snapshot, never keys, bearer values, URLs, or legal content.
export type JobActor =
  | { type: "user"; userId: string }
  | {
      type: "agent";
      userId: string;
      agentLabel: string;
      scope?: { matterIds: string[] | null; maxRole: MatterRole | null };
    };
export type DurableJobState = "queued" | "running" | "succeeded" | "failed" | "cancelled";

export const jobs = pgTable(
  "jobs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<"document_extraction" | "review_cell">().notNull(),
    artifactType: text("artifact_type")
      .$type<"document" | "tabular_review">()
      .notNull()
      .default("document"),
    sourceDocumentId: uuid("source_document_id"),
    columnIndex: integer("column_index"),
    model: text("model"),
    provider: text("provider"),
    snapshotFingerprint: text("snapshot_fingerprint"),
    baseCellCommitId: uuid("base_cell_commit_id"),
    runId: uuid("run_id"),
    schemaVersion: integer("schema_version").notNull().default(1),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id"),
    artifactId: uuid("artifact_id").notNull(),
    userId: text("user_id").notNull(),
    actor: jsonb("actor").$type<JobActor>().notNull(),
    credentialId: uuid("credential_id"),
    inputVersionId: uuid("input_version_id").notNull(),
    requestId: text("request_id").notNull(),
    fingerprint: text("fingerprint").notNull(),
    lastRetryRequestId: text("last_retry_request_id"),
    lastRetryFingerprint: text("last_retry_fingerprint"),
    state: text("state").$type<DurableJobState>().notNull().default("queued"),
    revision: integer("revision").notNull().default(1),
    attempts: integer("attempts").notNull().default(0),
    maxAttempts: integer("max_attempts").notNull().default(3),
    leaseOwner: text("lease_owner"),
    leaseEpoch: integer("lease_epoch").notNull().default(0),
    leaseExpiresAt: timestamp("lease_expires_at"),
    nextAttemptAt: timestamp("next_attempt_at").notNull().defaultNow(),
    cancellationRequestedAt: timestamp("cancellation_requested_at"),
    errorCode: text("error_code"),
    resultCommitId: uuid("result_commit_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [
    unique("jobs_request_unique").on(t.tenantId, t.userId, t.kind, t.requestId),
    index("jobs_due_idx").on(t.state, t.nextAttemptAt),
    index("jobs_lease_idx").on(t.state, t.leaseExpiresAt),
    index("jobs_artifact_idx").on(t.artifactId),
    index("jobs_capacity_idx").on(t.tenantId, t.userId, t.state),
  ]
);

export const jobControlPolicies = pgTable("job_control_policies", {
  tenantId: uuid("tenant_id")
    .primaryKey()
    .references(() => tenants.id, { onDelete: "cascade" }),
  revision: integer("revision").notNull().default(1),
  policy: jsonb("policy").$type<JobControlPolicy>().notNull(),
  updatedBy: text("updated_by").notNull(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

/** Persist intent before object I/O; only unpublished, expired writes may be reclaimed. */
export const stagedObjects = pgTable(
  "staged_objects",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    storagePath: text("storage_path").notNull().unique(),
    sizeBytes: integer("size_bytes").notNull(),
    revision: integer("revision").notNull().default(0),
    state: text("state")
      .$type<"staged" | "attached" | "deleting" | "deleted">()
      .notNull()
      .default("staged"),
    expiresAt: timestamp("expires_at").notNull(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("staged_objects_reconcile_idx").on(t.state, t.expiresAt)]
);

/** A terminal status is published in the same transaction as the legal checkpoint. */
export const jobNotifications = pgTable(
  "job_notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id"),
    revision: integer("revision").notNull(),
    payload: jsonb("payload").$type<JobSnapshot>().notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("job_notifications_revision_unique").on(t.jobId, t.revision),
    index("job_notifications_matter_idx").on(t.tenantId, t.matterId, t.createdAt),
  ]
);

export const jobNotificationReads = pgTable(
  "job_notification_reads",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    notificationId: uuid("notification_id")
      .notNull()
      .references(() => jobNotifications.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    readAt: timestamp("read_at").notNull().defaultNow(),
  },
  (t) => [unique("job_notification_reads_user_unique").on(t.notificationId, t.userId)]
);

export const jobUnits = pgTable(
  "job_units",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    unitKey: text("unit_key").notNull(),
    commitId: uuid("commit_id"),
    completedAt: timestamp("completed_at").notNull().defaultNow(),
  },
  (t) => [unique("job_units_key_unique").on(t.jobId, t.unitKey)]
);

export const jobReceipts = pgTable(
  "job_receipts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id")
      .notNull()
      .references(() => jobs.id, { onDelete: "cascade" }),
    operationKey: text("operation_key").notNull(),
    commitId: uuid("commit_id").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("job_receipts_operation_unique").on(t.jobId, t.operationKey)]
);

export type DurableJob = typeof jobs.$inferSelect;

// A provider attempt reserves before dispatch. Missing/ambiguous usage retains
// its reservation; it cannot be silently reported as a free completion.
export const jobSpendReservations = pgTable(
  "job_spend_reservations",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    jobId: uuid("job_id").references(() => jobs.id, { onDelete: "cascade" }),
    operationId: uuid("operation_id").notNull().defaultRandom().unique(),
    sourceKind: text("source_kind")
      .$type<"durable_review" | "sync_review" | "chat" | "generation">()
      .notNull()
      .default("durable_review"),
    actor: jsonb("actor").$type<JobActor>(),
    provider: text("provider"),
    dispatchedAt: timestamp("dispatched_at"),
    leaseExpiresAt: timestamp("lease_expires_at"),
    leaseEpoch: integer("lease_epoch").notNull(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    userId: text("user_id").notNull(),
    matterId: uuid("matter_id"),
    tokenId: uuid("token_id"),
    runId: uuid("run_id"),
    model: text("model").notNull(),
    reservedTokens: integer("reserved_tokens").notNull(),
    reservedUsd: doublePrecision("reserved_usd"),
    actualTokens: integer("actual_tokens"),
    actualUsd: doublePrecision("actual_usd"),
    state: text("state")
      .$type<"reserved" | "settled" | "unknown" | "released">()
      .notNull()
      .default("reserved"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    unique("job_spend_attempt_unique").on(t.jobId, t.leaseEpoch),
    index("job_spend_tenant_idx").on(t.tenantId, t.createdAt),
  ]
);
