import {
  type AnyPgColumn,
  boolean,
  index,
  integer,
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

// Uploaded source documents. `markdown` holds the extracted text (PDF via
// pdf.js, DOCX via mammoth) used as LLM context. Extraction
// runs as a background job: an upload lands `pending`, the worker claims it
// (`processing`), then sets `ready` (markdown populated) or `failed` (error +
// attempts bumped). Pasted-text documents are born `ready`.
export type DocumentStatus = "pending" | "processing" | "ready" | "failed";

// Folders organize a matter's documents into a tree (self-referential parent).
// A null parentFolderId is a top-level folder under the matter root.
export const documentFolders = pgTable(
  "document_folders",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    parentFolderId: uuid("parent_folder_id").references((): AnyPgColumn => documentFolders.id, {
      onDelete: "cascade",
    }),
    name: text("name").notNull(),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [index("document_folders_matter_idx").on(t.matterId)]
);

export const documents = pgTable(
  "documents",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Origin/home matter (a hint). A document can be linked into many matters via
    // matter_documents, so its lifecycle is NOT tied to this one: deleting the
    // origin matter nulls this out rather than destroying the doc.
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "set null" }),
    // Folder within the matter; null = matter root.
    folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "set null" }),
    title: text("title").notNull(),
    fileType: text("file_type").notNull(),
    // Governing-law jurisdiction; overrides the user default for tool resolution
    // when the document is being redlined as a draft.
    jurisdiction: text("jurisdiction"),
    // Extracted text (pdf/text) AND the editable draft body. Redlines on a
    // non-docx document operate as find->replace on this field.
    markdown: text("markdown"),
    sizeBytes: integer("size_bytes"),
    // Page count of the active file when extraction can determine it (PDF via
    // pdf.js, DOCX via docProps/app.xml). Null when unknown.
    pageCount: integer("page_count"),
    status: text("status").$type<DocumentStatus>().notNull().default("ready"),
    extractionError: text("extraction_error"),
    // Set when a PDF extracted too thin to be a real text layer (likely a scan;
    // we don't OCR). The UI shows a passive "little text — may be scanned"
    // warning. See processDocument.
    ocrSuggested: boolean("ocr_suggested").notNull().default(false),
    attempts: integer("attempts").notNull().default(0),
    claimedAt: timestamp("claimed_at"),
    // Bytes live on document_versions (mirrors contracts/contractVersions); this
    // points at the active version. Set after the first version is inserted.
    currentVersionId: uuid("current_version_id"),
    // Head pointer for the commit spine: documents are an artifact so the
    // background extraction is recorded as a system-authored commit.
    headCommitId: uuid("head_commit_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    // Staged: an upload made from the chat composer that the user has NOT yet
    // committed to the library. The row + bytes exist so we can extract and feed
    // the file to the model, but it's hidden from every library/matter list until
    // the user presses Enter (commit) or removes the chip (hard discard). An
    // orphan sweep purges staged rows older than the abandon window.
    staged: boolean("staged").notNull().default(false),
    // Soft-delete: set on delete, hidden from lists. A purge job hard-deletes
    // (and frees S3 bytes) after the retention window (30 days).
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
  },
  (t) => [
    index("documents_matter_idx").on(t.matterId),
    index("documents_tenant_idx").on(t.tenantId),
  ]
);

// Associates a document with the matters it appears in (many-to-many). A
// document's `matterId` is its origin/home matter; this table is the source of
// truth for *which* matters list it. Every doc keeps a self-link to its origin,
// and linking the same document into another matter adds a row here. `folderId`
// is the placement within THAT matter (null = matter root); linked docs default
// to root.
export const matterDocuments = pgTable(
  "matter_documents",
  {
    matterId: uuid("matter_id")
      .notNull()
      .references(() => matters.id, { onDelete: "cascade" }),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    folderId: uuid("folder_id").references(() => documentFolders.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.matterId, t.documentId] }),
    index("matter_documents_doc_idx").on(t.documentId),
  ]
);

// Immutable file snapshots. Every upload/edit/replace adds a row; the version
// create AND tombstone are recorded as commits on the document artifact, so the
// chain stays append-only (no in-place soft-delete flag). storagePath is nulled
// when a version is tombstoned (bytes purged, row kept for history).
export const documentVersions = pgTable(
  "document_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    versionNumber: integer("version_number").notNull(),
    storagePath: text("storage_path"),
    source: text("source")
      .$type<
        | "upload"
        | "generated"
        | "edit"
        | "replace"
        | "assistant_edit"
        | "user_edit"
        | "user_accept"
        | "user_reject"
      >()
      .notNull(),
    sizeBytes: integer("size_bytes"),
    fileType: text("file_type").notNull(),
    deletedAt: timestamp("deleted_at"),
    deletedBy: text("deleted_by").references(() => user.id, { onDelete: "set null" }),
    lastCommitId: uuid("last_commit_id"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [unique("document_version_unique").on(t.documentId, t.versionNumber)]
);

// Tracked changes (redlines) on a document. For docx documents the w-ids point at
// the OOXML w:ins/w:del wrappers; for text/pdf documents they stay null and the
// edit is a find->replace on documents.markdown. Lifted from mike's document_edits
// with audit columns added.
export const documentEdits = pgTable("document_edits", {
  id: uuid("id").primaryKey().defaultRandom(),
  documentId: uuid("document_id")
    .notNull()
    .references(() => documents.id, { onDelete: "cascade" }),
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

export type DocumentFolder = typeof documentFolders.$inferSelect;
export type Document = typeof documents.$inferSelect;
export type MatterDocument = typeof matterDocuments.$inferSelect;
export type DocumentVersion = typeof documentVersions.$inferSelect;
export type DocumentEdit = typeof documentEdits.$inferSelect;
