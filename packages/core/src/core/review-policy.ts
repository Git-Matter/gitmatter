import { createHash } from "node:crypto";
import { and, eq, gt, inArray } from "drizzle-orm";
import { clauses, commits, workflows, type TabularReview } from "@workspace/db/schema";
import { db } from "@workspace/db/client";
import { canAccessArtifact, type AccessReader } from "./access.js";
import { canReadApprovedLibrary } from "./library-access.js";

/** Live approval and accepted-content revision for captured firm/matter positions.
 * Proposal-only audit heads do not change workflow field revisions. */
export async function reviewPolicySnapshotCurrent(
  actor: import("./commit.js").Actor,
  review: TabularReview,
  reader: AccessReader = db
) {
  const snapshot = review.inputSnapshot;
  if (!snapshot || !snapshot.rules.length || snapshot.playbookId === "ad-hoc") return true;
  const [workflow] = await reader
    .select()
    .from(workflows)
    .where(eq(workflows.id, snapshot.playbookId))
    .for("share");
  if (
    !workflow ||
    workflow.type !== "playbook" ||
    workflow.status !== "approved" ||
    (!(await canReadApprovedLibrary(actor, "workflow", workflow.id, review.matterId, reader)) &&
      !(await canAccessArtifact(actor, "workflow", workflow.id, "viewer", reader)))
  )
    return false;
  const seed = `seed:${workflow.id}:${createHash("sha256")
    .update(JSON.stringify(workflow.rules ?? []))
    .digest("hex")}`;
  if (snapshot.playbookRevision.startsWith("seed:")) {
    if (seed !== snapshot.playbookRevision) return false;
  } else if (workflow.headCommitId !== snapshot.playbookRevision) {
    if (
      !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
        snapshot.playbookRevision
      )
    )
      return false;
    const [captured] = await reader
      .select({ seq: commits.seq })
      .from(commits)
      .where(
        and(
          eq(commits.id, snapshot.playbookRevision),
          eq(commits.artifactType, "workflow"),
          eq(commits.artifactId, workflow.id)
        )
      );
    if (!captured) return false;
    const fieldIds = [...new Set(Object.values(workflow.fieldCommits ?? {}))];
    if (fieldIds.length) {
      const [changed] = await reader
        .select({ id: commits.id })
        .from(commits)
        .where(
          and(
            inArray(commits.id, fieldIds),
            eq(commits.artifactType, "workflow"),
            eq(commits.artifactId, workflow.id),
            gt(commits.seq, captured.seq)
          )
        )
        .limit(1);
      if (changed) return false;
    }
  }
  for (const captured of snapshot.rules.flatMap((rule) => rule.clauses)) {
    if (!(await canReadApprovedLibrary(actor, "clause", captured.id, review.matterId, reader)))
      return false;
    const [clause] = await reader
      .select()
      .from(clauses)
      .where(eq(clauses.id, captured.id))
      .for("share");
    if (
      !clause ||
      clause.status !== "approved" ||
      clause.body !== captured.body ||
      (clause.headCommitId ??
        `seed:${clause.id}:${createHash("sha256").update(clause.body).digest("hex")}`) !==
        captured.revision
    )
      return false;
  }
  return true;
}
