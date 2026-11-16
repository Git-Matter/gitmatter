import {
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import type { TemplateContent } from "@workspace/contracts";
import { user } from "./auth.js";
import { tenants } from "./tenants.js";

export const templates = pgTable(
  "templates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    ownerId: text("owner_id").references(() => user.id, { onDelete: "set null" }),
    reviewNote: text("review_note"),
    reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "set null" }),
    publishedBy: text("published_by").references(() => user.id, { onDelete: "set null" }),
    publishedAt: timestamp("published_at"),
    status: text("status")
      .$type<"draft" | "review" | "changes_requested" | "published" | "archived">()
      .notNull()
      .default("draft"),
    draftRevisionId: uuid("draft_revision_id"),
    publishedRevisionId: uuid("published_revision_id"),
    headCommitId: uuid("head_commit_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("templates_tenant_idx").on(t.tenantId)]
);

// Content is immutable. Publishing advances a pointer, never edits a revision.
export const templateRevisions = pgTable(
  "template_revisions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    content: jsonb("content").$type<TemplateContent>().notNull(),
    storagePath: text("storage_path"),
    fileName: text("file_name"),
    sizeBytes: integer("size_bytes"),
    sha256: text("sha256"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [unique("template_revision_unique").on(t.templateId, t.version)]
);

export const templateMembers = pgTable(
  "template_members",
  {
    templateId: uuid("template_id")
      .notNull()
      .references(() => templates.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    role: text("role").$type<"editor" | "reviewer">().notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.templateId, t.userId] }),
    index("template_members_user_idx").on(t.userId),
  ]
);
