import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { matters } from "./matters.js";
import { user } from "./auth.js";
import type {
  CellProposalPayload,
  WorkflowProposalPayload,
  ExportProposalPayload,
} from "@workspace/contracts";
export type {
  ApprovalPolicy,
  CellProposalPayload,
  WorkflowProposalPayload,
} from "@workspace/contracts";

// Content is immutable. Only lifecycle state and its last commit advance.
export const approvalProposals = pgTable(
  "approval_proposals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    kind: text("kind").$type<"cell" | "workflow" | "export">().notNull(),
    artifactId: uuid("artifact_id").notNull(),
    revision: integer("revision").notNull().default(1),
    proposalCommitId: uuid("proposal_commit_id").notNull(),
    contentHash: text("content_hash").notNull(),
    policyRevision: integer("policy_revision").notNull(),
    requiredRole: text("required_role").$type<"editor" | "owner">().notNull(),
    proposerId: text("proposer_id")
      .notNull()
      .references(() => user.id),
    agentLabel: text("agent_label"),
    payload: jsonb("payload")
      .$type<CellProposalPayload | WorkflowProposalPayload | ExportProposalPayload>()
      .notNull(),
    status: text("status")
      .$type<"pending" | "applied" | "rejected" | "withdrawn">()
      .notNull()
      .default("pending"),
    lastCommitId: uuid("last_commit_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("approval_queue_idx").on(t.matterId, t.status, t.createdAt, t.id)]
);

export const commitApprovals = pgTable(
  "commit_approvals",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    proposalId: uuid("proposal_id")
      .notNull()
      .references(() => approvalProposals.id, { onDelete: "cascade" }),
    proposalRevision: integer("proposal_revision").notNull(),
    proposalCommitId: uuid("proposal_commit_id").notNull(),
    contentHash: text("content_hash").notNull(),
    capturedPolicyRevision: integer("captured_policy_revision").notNull(),
    currentPolicyRevision: integer("current_policy_revision").notNull(),
    sourceVersionId: uuid("source_version_id"),
    baseCellCommitId: uuid("base_cell_commit_id"),
    actorId: text("actor_id")
      .notNull()
      .references(() => user.id),
    requestId: uuid("request_id").notNull(),
    requestFingerprint: text("request_fingerprint").notNull(),
    decision: text("decision").$type<"approve" | "reject" | "withdraw">().notNull(),
    note: text("note"),
    applicationCommitId: uuid("application_commit_id").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("approval_terminal_unique").on(t.proposalId, t.proposalRevision),
    unique("approval_request_unique").on(t.actorId, t.requestId),
  ]
);
