import { index, integer, jsonb, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import { clients } from "./clients.js";
import { matters } from "./matters.js";
import { tenants } from "./tenants.js";

// The firm's clause library — approved language, fallback ladders, and the
// commentary that teaches when each position applies. A clause is an artifact
// on the commit spine: every edit is a commit with field-level blame, so "who
// changed the standard indemnity, when, and why" is always answerable.
//
// Scoping: tenant-wide by default (matterId null); matterId scopes a clause to
// one matter; clientId marks a client overlay ("client X never accepts
// arbitration") that takes precedence over the firm default when drafting for
// that client.
//
// Fallback ladders: the standard position is the rank-0 clause; each concession
// is a sibling row with parentClauseId pointing at the standard and a
// fallbackRank ordering the retreat (1 = first fallback). Each variant is its
// own artifact so it versions and blames independently.

export type ClauseRiskRating = "acceptable" | "negotiable" | "escalate";
export type ClauseStatus = "approved" | "draft" | "deprecated";

export const clauses = pgTable(
  "clauses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // The intrinsic owner (creator) — canAccessArtifact's owner shortcut.
    userId: text("user_id").references(() => user.id, { onDelete: "set null" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    // Null = firm-wide; set = scoped to one matter.
    matterId: uuid("matter_id").references(() => matters.id, { onDelete: "cascade" }),
    // Client overlay: this clause overrides the firm default for this client.
    clientId: uuid("client_id").references(() => clients.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    // The clause language itself, markdown.
    body: text("body").notNull(),
    // Clause type, e.g. "limitation-of-liability", "indemnification".
    category: text("category").notNull(),
    jurisdiction: text("jurisdiction"),
    riskRating: text("risk_rating").$type<ClauseRiskRating>().default("acceptable").notNull(),
    // Teaching notes: why this position, when to escalate, who approves deviations.
    guidance: text("guidance"),
    tags: jsonb("tags").$type<string[]>(),
    status: text("status").$type<ClauseStatus>().default("draft").notNull(),
    // Fallback ladder: null = the standard position; set = a concession variant
    // of the parent, ordered by fallbackRank (1 = first retreat).
    parentClauseId: uuid("parent_clause_id"),
    fallbackRank: integer("fallback_rank"),
    // Precedent link: the matter whose negotiation produced this language.
    sourceMatterId: uuid("source_matter_id"),
    createdBy: text("created_by").references(() => user.id, { onDelete: "set null" }),
    headCommitId: uuid("head_commit_id"),
    // Blame map: { "field/body": commitId, ... } — same pattern as workflows.
    fieldCommits: jsonb("field_commits").$type<Record<string, string>>(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [
    index("clauses_tenant_category_idx").on(t.tenantId, t.category),
    index("clauses_parent_idx").on(t.parentClauseId),
  ]
);

export type Clause = typeof clauses.$inferSelect;
