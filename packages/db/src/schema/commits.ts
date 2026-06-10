import { index, integer, jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";

// The git spine. An artifact = (artifactType, artifactId). Each artifact has a
// linear chain of commits (monotonic seq + parentCommitId). A commit groups one
// or more field_changes (generic path/before/after triples).

export type ArtifactType = "contract" | "tabular_review" | "workflow" | "document";
export type ActorType = "user" | "agent";

export const commits = pgTable(
  "commits",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    artifactType: text("artifact_type").$type<ArtifactType>().notNull(),
    artifactId: uuid("artifact_id").notNull(),
    seq: integer("seq").notNull(),
    parentCommitId: uuid("parent_commit_id"),
    actorType: text("actor_type").$type<ActorType>().notNull(),
    // Always the gitcounsel user. For agent commits, the user the MCP token maps to.
    actorId: text("actor_id").references(() => user.id, { onDelete: "set null" }),
    agentLabel: text("agent_label"),
    op: text("op").notNull(),
    message: text("message").notNull(),
    summary: jsonb("summary"),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    unique("commits_artifact_seq_unique").on(t.artifactType, t.artifactId, t.seq),
    index("commits_artifact_seq_idx").on(t.artifactType, t.artifactId, t.seq),
  ]
);

export const fieldChanges = pgTable(
  "field_changes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    commitId: uuid("commit_id")
      .notNull()
      .references(() => commits.id, { onDelete: "cascade" }),
    path: text("path").notNull(),
    before: jsonb("before"),
    after: jsonb("after"),
  },
  (t) => [
    index("field_changes_commit_idx").on(t.commitId),
    index("field_changes_path_idx").on(t.path),
  ]
);

export type Commit = typeof commits.$inferSelect;
export type FieldChangeRow = typeof fieldChanges.$inferSelect;
