import { integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { matters } from "./matters.js";

// Uploaded source documents. `markdown` holds the extracted text (via the
// markitdown MCP sidecar or a local extractor) used as LLM context. Extraction
// runs as a background job: an upload lands `pending`, the worker claims it
// (`processing`), then sets `ready` (markdown populated) or `failed` (error +
// attempts bumped). Pasted-text documents are born `ready`.
export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

export const documents = pgTable("documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  matterId: uuid("matter_id")
    .notNull()
    .references(() => matters.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  fileType: text("file_type").notNull(),
  storagePath: text("storage_path"),
  markdown: text("markdown"),
  sizeBytes: integer("size_bytes"),
  status: text("status").$type<DocumentStatus>().notNull().default("ready"),
  extractionError: text("extraction_error"),
  attempts: integer("attempts").notNull().default(0),
  claimedAt: timestamp("claimed_at"),
  // Head pointer for the commit spine: documents are an artifact so the
  // background extraction is recorded as a system-authored commit.
  headCommitId: uuid("head_commit_id"),
  createdAt: timestamp("created_at").defaultNow().notNull(),
});

export type Document = typeof documents.$inferSelect;
