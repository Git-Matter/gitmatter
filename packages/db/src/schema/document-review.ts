import { index, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { documents } from "./documents.js";
import { tenants } from "./tenants.js";
import { user } from "./auth.js";

// Append-only practitioner attestations. Content state, not a mutable flag on
// the document, determines whether a historical review is still current.
export const documentReviews = pgTable(
  "document_reviews",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => documents.id, { onDelete: "cascade" }),
    tenantId: uuid("tenant_id")
      .notNull()
      .references(() => tenants.id, { onDelete: "cascade" }),
    reviewerId: text("reviewer_id").references(() => user.id, { onDelete: "set null" }),
    reviewerName: text("reviewer_name").notNull(),
    reviewedAt: timestamp("reviewed_at").notNull().defaultNow(),
    scope: text("scope").notNull(),
    documentVersionId: uuid("document_version_id"),
    stateToken: text("state_token").notNull(),
    // Stamped inside recordCommit before the commit row is inserted, as with
    // other artifact last_commit_id columns; deliberately not an immediate FK.
    commitId: uuid("commit_id").notNull(),
  },
  (t) => [index("document_reviews_document_idx").on(t.documentId, t.reviewedAt)]
);
