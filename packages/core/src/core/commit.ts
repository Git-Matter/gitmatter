import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, getTableColumns, isNotNull, lte, sql } from "drizzle-orm";
import { db, type Tx } from "@workspace/db/client";
import {
  type ArtifactType,
  type MatterRole,
  commits,
  documents,
  fieldChanges,
  tabularReviews,
  user,
  workflows,
} from "@workspace/db/schema";

// Least-privilege restriction carried by a scoped MCP token. Null members mean
// "no restriction on that axis"; an absent scope means the agent has the full
// power of its user (pre-scope tokens, in-app assistant).
export type TokenScope = {
  /** Matters the token may touch, or null for all the user's matters. */
  matterIds: string[] | null;
  /** Cap on the token's effective role, or null for no cap. */
  maxRole: MatterRole | null;
};

export type Actor =
  | { type: "user"; userId: string }
  | { type: "agent"; userId: string; agentLabel: string; scope?: TokenScope };

export type FieldChange = { path: string; before: unknown; after: unknown };

export type FieldDiff = {
  path: string;
  before: unknown;
  after: unknown;
  op: "added" | "removed" | "modified";
};

// Artifact head-pointer tables, keyed by artifact type.
const HEAD_TABLE = {
  tabular_review: tabularReviews,
  workflow: workflows,
  document: documents,
} as const;

export interface RecordCommitArgs {
  artifactType: ArtifactType;
  artifactId: string;
  actor: Actor;
  op: string;
  message: string;
  /**
   * Mutates live tables inside the transaction and returns the field-level diff.
   * Receives the generated commitId so it can stamp `last_commit_id` on touched rows.
   */
  apply: (ctx: {
    tx: Tx;
    commitId: string;
  }) => Promise<{ changes: FieldChange[]; summary?: unknown }>;
  skipIfNoChanges?: boolean;
}

/**
 * The single mutation path. Every change to an artifact — by a human route or an
 * MCP agent tool — flows through here, producing one commit with field changes.
 */
export async function recordCommit(args: RecordCommitArgs) {
  return db.transaction(async (tx) => {
    // Serialize all commits to this artifact for the duration of the transaction.
    // A transaction-scoped advisory lock is robust even when no commit row exists
    // yet (unlike SELECT ... FOR UPDATE, which locks nothing on an empty set).
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`${args.artifactType}:${args.artifactId}`}))`
    );
    const lastRows = (await tx.execute(sql`
      select id, seq from ${commits}
      where artifact_type = ${args.artifactType} and artifact_id = ${args.artifactId}
      order by seq desc limit 1
    `)) as unknown as Array<{ id: string; seq: number }>;
    const last = lastRows[0];
    const parentCommitId = last?.id ?? null;
    const nextSeq = (last?.seq ?? 0) + 1;

    const commitId = randomUUID();
    const { changes, summary } = await args.apply({ tx, commitId });

    if (changes.length === 0 && args.skipIfNoChanges) {
      return { commit: null, changes };
    }

    const [commit] = await tx
      .insert(commits)
      .values({
        id: commitId,
        artifactType: args.artifactType,
        artifactId: args.artifactId,
        seq: nextSeq,
        parentCommitId,
        actorType: args.actor.type,
        actorId: args.actor.userId,
        agentLabel: args.actor.type === "agent" ? args.actor.agentLabel : null,
        op: args.op,
        message: args.message,
        summary: summary ?? null,
      })
      .returning();

    if (changes.length) {
      await tx.insert(fieldChanges).values(
        changes.map((c) => ({
          commitId,
          path: c.path,
          before: c.before ?? null,
          after: c.after ?? null,
        }))
      );
    }

    const headTable = HEAD_TABLE[args.artifactType];
    await tx
      .update(headTable)
      .set({ headCommitId: commitId })
      .where(eq(headTable.id, args.artifactId));

    return { commit, changes };
  });
}

/** Fold field_changes (seq <= uptoSeq, last-writer-wins) into a path->value map. */
async function stateAtSeq(
  artifactType: ArtifactType,
  artifactId: string,
  uptoSeq: number
): Promise<Map<string, unknown>> {
  const rows = await db
    .select({ path: fieldChanges.path, after: fieldChanges.after, seq: commits.seq })
    .from(fieldChanges)
    .innerJoin(commits, eq(fieldChanges.commitId, commits.id))
    .where(
      and(
        eq(commits.artifactType, artifactType),
        eq(commits.artifactId, artifactId),
        lte(commits.seq, uptoSeq)
      )
    )
    .orderBy(asc(commits.seq));

  const map = new Map<string, unknown>();
  for (const r of rows) {
    if (r.after === null) map.delete(r.path);
    else map.set(r.path, r.after);
  }
  return map;
}

/** Field-level diff between two commit seqs (current = head seq). */
export async function diffCommits(
  artifactType: ArtifactType,
  artifactId: string,
  fromSeq: number,
  toSeq: number
): Promise<FieldDiff[]> {
  const a = await stateAtSeq(artifactType, artifactId, fromSeq);
  const b = await stateAtSeq(artifactType, artifactId, toSeq);
  const paths = new Set([...a.keys(), ...b.keys()]);
  const out: FieldDiff[] = [];
  for (const p of paths) {
    const before = a.has(p) ? a.get(p) : null;
    const after = b.has(p) ? b.get(p) : null;
    if (JSON.stringify(before) === JSON.stringify(after)) continue;
    out.push({
      path: p,
      before: before ?? null,
      after: after ?? null,
      op: !a.has(p) ? "added" : !b.has(p) ? "removed" : "modified",
    });
  }
  return out;
}

export async function listCommits(artifactType: ArtifactType, artifactId: string) {
  // Resolve the acting user's identity so the audit trail can name them — a
  // shared artifact has many actors, and the UI must tell them apart (not just
  // "you"). agent commits leave actorName/actorEmail null and rely on agentLabel.
  return db
    .select({ ...getTableColumns(commits), actorName: user.name, actorEmail: user.email })
    .from(commits)
    .leftJoin(user, eq(user.id, commits.actorId))
    .where(and(eq(commits.artifactType, artifactType), eq(commits.artifactId, artifactId)))
    .orderBy(desc(commits.seq));
}

export async function getCommit(commitId: string) {
  const [c] = await db.select().from(commits).where(eq(commits.id, commitId));
  return c ?? null;
}

export async function getCommitChanges(commitId: string) {
  return db.select().from(fieldChanges).where(eq(fieldChanges.commitId, commitId));
}

/** Blame fallback: the latest commit that set a given path to a non-null value. */
export async function deriveBlame(artifactType: ArtifactType, artifactId: string, path: string) {
  const [row] = await db
    .select({ ...getTableColumns(commits), actorName: user.name, actorEmail: user.email })
    .from(fieldChanges)
    .innerJoin(commits, eq(fieldChanges.commitId, commits.id))
    .leftJoin(user, eq(user.id, commits.actorId))
    .where(
      and(
        eq(commits.artifactType, artifactType),
        eq(commits.artifactId, artifactId),
        eq(fieldChanges.path, path),
        isNotNull(fieldChanges.after)
      )
    )
    .orderBy(desc(commits.seq))
    .limit(1);
  return row ?? null;
}
