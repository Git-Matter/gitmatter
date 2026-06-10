import { integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { matters } from "./matters.js";

export type TabularColumn = {
  index: number;
  name: string;
  prompt: string;
  format?: string;
};

export type CellContent = {
  summary: string;
  flag: "green" | "grey" | "yellow" | "red";
  reasoning: string;
};

export const tabularReviews = pgTable("tabular_reviews", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  matterId: uuid("matter_id")
    .notNull()
    .references(() => matters.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  jurisdiction: text("jurisdiction"),
  columnsConfig: jsonb("columns_config").$type<TabularColumn[]>().notNull(),
  documentIds: jsonb("document_ids").$type<string[]>().notNull(),
  workflowId: uuid("workflow_id"),
  headCommitId: uuid("head_commit_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

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
    citations: jsonb("citations"),
    status: text("status")
      .$type<"pending" | "generating" | "done" | "error">()
      .default("pending")
      .notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    lastCommitId: uuid("last_commit_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("tabular_cell_unique").on(t.reviewId, t.documentId, t.columnIndex)]
);

export type TabularReview = typeof tabularReviews.$inferSelect;
export type TabularCell = typeof tabularCells.$inferSelect;
