import { sql } from "drizzle-orm";
import type {
  ContractReviewSnapshot,
  FindingProvenance,
  FindingDisposition,
  FindingOutcome,
} from "@workspace/contracts";
import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { matters } from "./matters.js";
import { tenants } from "./tenants.js";

export type TabularColumn = {
  index: number;
  name: string;
  prompt: string;
  format?: string;
  // For the "tag" format: the closed set of labels the model must choose from.
  tags?: string[];
};

export type CellContent = {
  summary: string;
  flag: "green" | "grey" | "yellow" | "red";
  reasoning: string;
  outcome?: FindingOutcome;
};

// One piece of grounding evidence for a cell: a verbatim quote and, when known,
// the page it came from. Stored in the tabular_cells.citations column.
export type CellCitation = { page?: number; quote: string };

export const tabularReviews = pgTable(
  "tabular_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    jurisdiction: text("jurisdiction"),
    columnsConfig: jsonb("columns_config").$type<TabularColumn[]>().notNull(),
    documentIds: jsonb("document_ids").$type<string[]>().notNull(),
    workflowId: uuid("workflow_id"),
    inputSnapshot: jsonb("input_snapshot").$type<ContractReviewSnapshot>(),
    requestKey: text("request_key"),
    requestFingerprint: text("request_fingerprint"),
    headCommitId: uuid("head_commit_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("tabular_reviews_tenant_idx").on(t.tenantId),
    unique("tabular_review_request_unique").on(t.requestKey),
  ]
);

export const tabularCells = pgTable(
  "tabular_cells",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    reviewId: uuid("review_id")
      .notNull()
      .references(() => tabularReviews.id, { onDelete: "cascade" }),
    documentId: uuid("document_id").notNull(),
    columnIndex: integer("column_index").notNull(),
    content: jsonb("content").$type<CellContent | null>(),
    finding: jsonb("finding").$type<FindingProvenance>(),
    disposition: jsonb("disposition").$type<FindingDisposition>(),
    citations: jsonb("citations").$type<CellCitation[] | null>(),
    status: text("status")
      .$type<"pending" | "generating" | "done" | "error">()
      .default("pending")
      .notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastCommitId: uuid("last_commit_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    unique("tabular_cell_unique").on(t.reviewId, t.documentId, t.columnIndex),
    index("tabular_cells_search_idx").using(
      "gin",
      sql`to_tsvector('english', coalesce(${t.content}->>'summary', '') || ' ' || coalesce(${t.content}->>'reasoning', ''))`
    ),
  ]
);

export type TabularReview = typeof tabularReviews.$inferSelect;
export type TabularCell = typeof tabularCells.$inferSelect;
