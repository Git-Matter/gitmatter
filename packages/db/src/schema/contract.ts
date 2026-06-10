import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { matters } from "./matters.js";

export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  // Owning matter — every artifact belongs to one.
  matterId: uuid("matter_id")
    .notNull()
    .references(() => matters.id, { onDelete: "cascade" }),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  title: text("title").notNull(),
  // Governing-law jurisdiction; overrides the user default for tool resolution.
  jurisdiction: text("jurisdiction"),
  // Current contract text (markdown). The DOCX-XML tracked-changes port is deferred;
  // MVP redlines operate on plain text.
  body: text("body").default("").notNull(),
  currentVersionId: uuid("current_version_id"),
  headCommitId: uuid("head_commit_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  updatedAt: timestamp("updated_at").defaultNow().notNull(),
});

export const contractVersions = pgTable("contract_versions", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  versionNumber: integer("version_number").notNull(),
  storagePath: text("storage_path").notNull(),
  source: text("source").notNull(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

// Tracked changes, lifted from mike's document_edits with audit columns added.
export const contractEdits = pgTable("contract_edits", {
  id: uuid("id").primaryKey().defaultRandom(),
  contractId: uuid("contract_id")
    .notNull()
    .references(() => contracts.id, { onDelete: "cascade" }),
  versionId: uuid("version_id"),
  changeId: text("change_id").notNull(),
  delWId: text("del_w_id"),
  insWId: text("ins_w_id"),
  deletedText: text("deleted_text"),
  insertedText: text("inserted_text"),
  contextBefore: text("context_before"),
  contextAfter: text("context_after"),
  reason: text("reason"),
  status: text("status").$type<"pending" | "accepted" | "rejected">().default("pending").notNull(),
  createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
  resolvedBy: text("resolved_by").references(() => user.id, { onDelete: "set null" }),
  lastCommitId: uuid("last_commit_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  resolvedAt: timestamp("resolved_at"),
});

export type Contract = typeof contracts.$inferSelect;
export type ContractVersion = typeof contractVersions.$inferSelect;
export type ContractEdit = typeof contractEdits.$inferSelect;
