import { randomUUID } from "node:crypto";
import { and, asc, eq, isNull, ne, or } from "drizzle-orm";
import { type Jurisdiction, jurisdictionMatches } from "@workspace/registry";
import { db } from "@workspace/db/client";
import {
  type Clause,
  type ClauseRiskRating,
  type ClauseStatus,
  clauses,
} from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";
import { getUserTenant } from "../core/access.js";

// The clause library. Every mutation goes through recordCommit (artifact type
// "clause") with a fieldCommits blame map, same pattern as workflows: "who
// changed the standard indemnity, when, and why" is answerable per field.

export type ClauseInput = {
  title: string;
  body: string;
  category: string;
  jurisdiction?: string | null;
  riskRating?: ClauseRiskRating;
  guidance?: string | null;
  tags?: string[] | null;
  status?: ClauseStatus;
  matterId?: string | null;
  clientId?: string | null;
  parentClauseId?: string | null;
  fallbackRank?: number | null;
  sourceMatterId?: string | null;
};

// Every versioned field, in one place, so create/update stay in lockstep.
const FIELDS: Array<{ key: string; col: keyof ClauseInput }> = [
  { key: "field/title", col: "title" },
  { key: "field/body", col: "body" },
  { key: "field/category", col: "category" },
  { key: "field/jurisdiction", col: "jurisdiction" },
  { key: "field/risk_rating", col: "riskRating" },
  { key: "field/guidance", col: "guidance" },
  { key: "field/tags", col: "tags" },
  { key: "field/status", col: "status" },
  { key: "field/fallback_rank", col: "fallbackRank" },
];

export async function createClause(actor: Actor, input: ClauseInput): Promise<string> {
  const tenantId = await getUserTenant(actor.userId);
  if (!tenantId) throw new Error("No tenant");
  if (input.parentClauseId) {
    const [parent] = await db.select().from(clauses).where(eq(clauses.id, input.parentClauseId));
    if (!parent || parent.tenantId !== tenantId) throw new Error("Parent clause not found");
    if (parent.parentClauseId) throw new Error("Fallbacks chain off the standard position only");
  }
  const clauseId = randomUUID();
  await recordCommit({
    artifactType: "clause",
    artifactId: clauseId,
    actor,
    op: "create",
    message: `Created clause "${input.title}"`,
    apply: async ({ tx, commitId }) => {
      const fieldCommits = Object.fromEntries(FIELDS.map((f) => [f.key, commitId]));
      await tx.insert(clauses).values({
        id: clauseId,
        userId: actor.userId,
        tenantId,
        matterId: input.matterId ?? null,
        clientId: input.clientId ?? null,
        title: input.title,
        body: input.body,
        category: input.category,
        jurisdiction: input.jurisdiction ?? null,
        riskRating: input.riskRating ?? "acceptable",
        guidance: input.guidance ?? null,
        tags: input.tags ?? null,
        status: input.status ?? "draft",
        parentClauseId: input.parentClauseId ?? null,
        fallbackRank: input.parentClauseId ? (input.fallbackRank ?? 1) : null,
        sourceMatterId: input.sourceMatterId ?? null,
        createdBy: actor.userId,
        fieldCommits,
      });
      return {
        changes: FIELDS.map((f) => ({
          path: f.key,
          before: null,
          after: (input[f.col] ?? null) as unknown,
        })),
      };
    },
  });
  return clauseId;
}

export async function updateClause(actor: Actor, clauseId: string, patch: Partial<ClauseInput>) {
  const [row] = await db.select().from(clauses).where(eq(clauses.id, clauseId));
  if (!row) throw new Error("Clause not found");

  const current = row as unknown as Record<string, unknown>;
  const fields = FIELDS.flatMap((f) => {
    const after = patch[f.col];
    if (after === undefined) return [];
    const before = current[f.col] ?? null;
    if (JSON.stringify(before) === JSON.stringify(after)) return [];
    return [{ key: f.key, col: f.col, before, after: after as unknown }];
  });
  if (!fields.length) return { commit: null, changes: [] };

  return recordCommit({
    artifactType: "clause",
    artifactId: clauseId,
    actor,
    op: "update",
    message: `Updated ${fields.map((f) => f.key.replace("field/", "")).join(", ")}`,
    apply: async ({ tx, commitId }) => {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      const fieldCommits = { ...row.fieldCommits };
      for (const f of fields) {
        set[f.col] = f.after;
        fieldCommits[f.key] = commitId;
      }
      set.fieldCommits = fieldCommits;
      await tx.update(clauses).set(set).where(eq(clauses.id, clauseId));
      return { changes: fields.map((f) => ({ path: f.key, before: f.before, after: f.after })) };
    },
  });
}

export async function getClause(clauseId: string): Promise<Clause | null> {
  const [row] = await db.select().from(clauses).where(eq(clauses.id, clauseId));
  return row ?? null;
}

/** The standard position plus its fallback ladder, in retreat order. */
export async function getClauseLadder(clauseId: string): Promise<Clause[]> {
  const root = await getClause(clauseId);
  if (!root) return [];
  const standardId = root.parentClauseId ?? root.id;
  const [standard, fallbacks] = await Promise.all([
    root.parentClauseId ? getClause(standardId) : Promise.resolve(root),
    db
      .select()
      .from(clauses)
      .where(eq(clauses.parentClauseId, standardId))
      .orderBy(asc(clauses.fallbackRank)),
  ]);
  return standard ? [standard, ...fallbacks] : fallbacks;
}

/** Firm-wide (and optionally matter/client-scoped) clauses the user can see.
 *  Standard positions only unless includeFallbacks — the ladder loads per clause. */
export async function listClauses(
  tenantId: string,
  opts: {
    category?: string;
    matterId?: string | null;
    clientId?: string | null;
    includeDeprecated?: boolean;
    includeFallbacks?: boolean;
  } = {}
): Promise<Clause[]> {
  const conds = [
    eq(clauses.tenantId, tenantId),
    // Firm-wide always; matter/client-scoped only when asked for that scope.
    or(isNull(clauses.matterId), ...(opts.matterId ? [eq(clauses.matterId, opts.matterId)] : [])),
  ];
  if (opts.category) conds.push(eq(clauses.category, opts.category));
  if (!opts.includeDeprecated) conds.push(ne(clauses.status, "deprecated"));
  if (!opts.includeFallbacks) conds.push(isNull(clauses.parentClauseId));
  const rows = await db
    .select()
    .from(clauses)
    .where(and(...conds))
    .orderBy(asc(clauses.category), asc(clauses.title));
  // Client overlays surface only for their client; others see firm defaults.
  return rows.filter((r) => !r.clientId || r.clientId === opts.clientId);
}

/** Approved clauses relevant to a category/jurisdiction — what drafting injects.
 *  Client overlays (when a clientId is given) shadow same-category firm defaults. */
export async function suggestClauses(
  tenantId: string,
  opts: { category?: string; jurisdiction?: string; clientId?: string | null; limit?: number }
): Promise<Clause[]> {
  const rows = await listClauses(tenantId, {
    category: opts.category,
    clientId: opts.clientId ?? null,
  });
  const approved = rows.filter(
    (r) =>
      r.status === "approved" &&
      (!opts.jurisdiction ||
        !r.jurisdiction ||
        jurisdictionMatches(r.jurisdiction as Jurisdiction, opts.jurisdiction as Jurisdiction))
  );
  const overlayCategories = new Set(approved.filter((r) => r.clientId).map((r) => r.category));
  const shadowed = approved.filter((r) => r.clientId || !overlayCategories.has(r.category));
  return shadowed.slice(0, opts.limit ?? 8);
}
