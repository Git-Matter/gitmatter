import {
  boolean,
  index,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { matters } from "./matters.js";
import { tenants } from "./tenants.js";
import type { TabularColumn } from "./tabular.js";

// One step of a multi-step assistant workflow.
export type WorkflowStep = { title?: string; promptMd: string };

// One playbook rule: how the firm handles one clause type in this contract
// type. Harvey-style anatomy — a standard position, ordered fallbacks (inline
// text or a clause-library reference), a red line, and teaching guidance.
export type PlaybookRule = {
  id: string;
  clauseType: string;
  // Firm standard language. Keep standardPosition as a readable snapshot for
  // older playbooks, but resolve this reference at run time when present.
  standardClauseId?: string;
  standardPosition: string;
  fallbacks?: Array<string | { clauseId: string }>;
  unacceptable?: string;
  guidance?: string;
  // red = unacceptable deviation blocks the deal; yellow = needs review.
  severity: "red" | "yellow";
};

// Library lifecycle shared with clauses: members/agents draft, a firm admin
// approves, deprecated items drop out of suggestion and execution.
export type WorkflowStatus = "draft" | "approved" | "deprecated";

export const workflows = pgTable(
  "workflows",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").references(() => user.id, { onDelete: "cascade" }),
    // Null for system templates (global, tenant-agnostic); set for tenant workflows.
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    // Null for system templates (global, matter-agnostic); set for user workflows.
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    type: text("type").$type<"assistant" | "tabular" | "playbook">().notNull(),
    promptMd: text("prompt_md").notNull(),
    // Playbook rules (type "playbook" only).
    rules: jsonb("rules").$type<PlaybookRule[]>(),
    // Default "approved" keeps every pre-lifecycle workflow behaving as before;
    // new playbooks are created as drafts explicitly.
    status: text("status").$type<WorkflowStatus>().default("approved").notNull(),
    // Ordered prompt steps for assistant workflows. Each runs as its own chat
    // turn in sequence, so a later step sees earlier steps' answers. Null/empty
    // means the workflow is a single prompt (promptMd) — the legacy shape.
    steps: jsonb("steps").$type<WorkflowStep[]>(),
    columnsConfig: jsonb("columns_config").$type<TabularColumn[]>(),
    practice: text("practice"),
    isSystem: boolean("is_system").default(false).notNull(),
    headCommitId: uuid("head_commit_id"),
    // Blame map: { "field/title": commitId, "field/prompt_md": commitId, ... }
    fieldCommits: jsonb("field_commits").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [index("workflows_tenant_idx").on(t.tenantId)]
);

export type Workflow = typeof workflows.$inferSelect;

// Per-email sharing of a custom workflow. Recipients are matched by email so a
// workflow can be shared before the recipient has signed in.
export const workflowShares = pgTable(
  "workflow_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    sharedWithEmail: text("shared_with_email").notNull(),
    allowEdit: boolean("allow_edit").default(false).notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("workflow_share_unique").on(t.workflowId, t.sharedWithEmail),
    index("workflow_shares_email_idx").on(t.sharedWithEmail),
  ]
);

// Built-in (system) workflows a user has hidden from their library.
export const hiddenWorkflows = pgTable(
  "hidden_workflows",
  {
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    workflowId: uuid("workflow_id")
      .notNull()
      .references(() => workflows.id, { onDelete: "cascade" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.workflowId] })]
);

export type WorkflowShare = typeof workflowShares.$inferSelect;
