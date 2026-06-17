import { index, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import type { ArtifactType } from "./commits.js";
import type { MatterRole } from "./matters.js";

// Per-artifact sharing (documents, reviews). An artifact = (artifactType,
// artifactId); a share grants a user a role on that artifact directly, on top of
// any access inherited from its matter. Effective role is the higher of the two.
// The artifact's intrinsic owner (artifact.userId) is implicit — never a row here.
export const artifactShares = pgTable(
  "artifact_shares",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactType: text("artifact_type").$type<ArtifactType>().notNull(),
    artifactId: uuid("artifact_id").notNull(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    // Reuses the matter role hierarchy: viewer < editor < owner (co-owner).
    role: text("role").$type<MatterRole>().notNull().default("editor"),
    addedBy: text("added_by").references(() => user.id, { onDelete: "set null" }),
    addedAt: timestamp("added_at").defaultNow().notNull(),
  },
  (t) => [
    unique("artifact_share_unique").on(t.artifactType, t.artifactId, t.userId),
    // Powers "artifacts shared with me" lists.
    index("artifact_shares_user_idx").on(t.userId),
    // Powers listing shares + the per-artifact count aggregation.
    index("artifact_shares_artifact_idx").on(t.artifactType, t.artifactId),
  ]
);

export type ArtifactShare = typeof artifactShares.$inferSelect;
