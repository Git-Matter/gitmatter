import { randomUUID } from "node:crypto";
import { and, asc, desc, eq, isNull, ne, or, sql } from "drizzle-orm";
import { type Jurisdiction, jurisdictionMatches } from "@workspace/registry";
import { db } from "@workspace/db/client";
import {
  type Clause,
  type ClauseRiskRating,
  type ClauseStatus,
  clauses,
} from "@workspace/db/schema";
import { matters } from "@workspace/db/schema";
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
  overridesClauseId?: string | null;
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
  { key: "field/parent_clause_id", col: "parentClauseId" },
  { key: "field/fallback_rank", col: "fallbackRank" },
  { key: "field/overrides_clause_id", col: "overridesClauseId" },
];

export async function createClause(actor: Actor, input: ClauseInput): Promise<string> {
  const tenantId = await getUserTenant(actor.userId);
  if (!tenantId) throw new Error("No tenant");
  if (input.clientId && input.matterId)
    throw new Error("A clause can be scoped to a client or a matter, not both");
  if ((input.clientId || input.matterId) && !input.parentClauseId && !input.overridesClauseId)
    throw new Error("A client or matter exception must name the firm standard it overrides");
  if (input.overridesClauseId) {
    if (!input.clientId && !input.matterId)
      throw new Error("Only a client or matter exception can override a firm clause");
    const [base] = await db.select().from(clauses).where(eq(clauses.id, input.overridesClauseId));
    if (
      !base ||
      base.tenantId !== tenantId ||
      base.clientId ||
      base.matterId ||
      base.parentClauseId
    )
      throw new Error("Override target must be a firm standard clause");
    if (base.category !== input.category)
      throw new Error("An exception must use the same category as its firm standard");
  }
  if (input.parentClauseId) {
    const [parent] = await db.select().from(clauses).where(eq(clauses.id, input.parentClauseId));
    if (!parent || parent.tenantId !== tenantId) throw new Error("Parent clause not found");
    if (parent.parentClauseId) throw new Error("Fallbacks chain off the standard position only");
    if (
      parent.clientId !== (input.clientId ?? null) ||
      parent.matterId !== (input.matterId ?? null)
    )
      throw new Error("A fallback must stay in the same firm, client, or matter scope");
  }
  const clauseId = randomUUID();
  await recordCommit({
    artifactType: "clause",
    artifactId: clauseId,
    actor,
    op: "create",
    message: `Created clause "${input.title}"`,
    apply: async ({ tx, commitId }) => {
      let fallbackRank: number | null = null;
      if (input.parentClauseId) {
        // Serialize sibling creation so fallback order is stable even when two
        // lawyers add a position at the same time.
        await tx.execute(
          sql`select pg_advisory_xact_lock(hashtext(${`clause-ladder:${input.parentClauseId}`}))`
        );
        if (input.fallbackRank !== undefined && input.fallbackRank !== null) {
          fallbackRank = input.fallbackRank;
        } else {
          const [last] = await tx
            .select({ fallbackRank: clauses.fallbackRank })
            .from(clauses)
            .where(eq(clauses.parentClauseId, input.parentClauseId))
            .orderBy(desc(clauses.fallbackRank))
            .limit(1);
          fallbackRank = (last?.fallbackRank ?? 0) + 1;
        }
      }
      const fieldCommits = Object.fromEntries(FIELDS.map((f) => [f.key, commitId]));
      const values = {
        parentClauseId: input.parentClauseId ?? null,
        fallbackRank,
        overridesClauseId: input.overridesClauseId ?? null,
      };
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
        ...values,
        sourceMatterId: input.sourceMatterId ?? null,
        createdBy: actor.userId,
        fieldCommits,
      });
      return {
        changes: FIELDS.map((f) => ({
          path: f.key,
          before: null,
          after: (values[f.col as keyof typeof values] ?? input[f.col] ?? null) as unknown,
        })),
      };
    },
  });
  return clauseId;
}

export async function updateClause(actor: Actor, clauseId: string, patch: Partial<ClauseInput>) {
  const [row] = await db.select().from(clauses).where(eq(clauses.id, clauseId));
  if (!row) throw new Error("Clause not found");
  if (patch.overridesClauseId !== undefined)
    throw new Error(
      "The firm standard an exception overrides is set when the exception is created"
    );

  const current = row as unknown as Record<string, unknown>;
  // Moving a clause into a ladder or changing its rank needs sibling locking and
  // explicit audit semantics. Only creation establishes that topology for now.
  const fields = FIELDS.filter(
    (f) => f.col !== "parentClauseId" && f.col !== "fallbackRank" && f.col !== "overridesClauseId"
  ).flatMap((f) => {
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

export type ResolvedClause = Clause & {
  appliedScope: "firm" | "client" | "matter";
  baseClauseId: string;
};

/** Resolve one firm standard for the matter that is actually being worked on.
 * Matter exceptions win, then client exceptions, then the firm standard. */
export async function resolveClause(
  tenantId: string,
  clauseId: string,
  opts: { matterId?: string | null; clientId?: string | null } = {}
): Promise<ResolvedClause | null> {
  const [base] = await db.select().from(clauses).where(eq(clauses.id, clauseId));
  if (!base || base.tenantId !== tenantId || base.status !== "approved") return null;

  let clientId = opts.clientId ?? null;
  if (opts.matterId) {
    const [matter] = await db
      .select({ clientId: matters.clientId, tenantId: matters.tenantId })
      .from(matters)
      .where(eq(matters.id, opts.matterId));
    if (!matter || matter.tenantId !== tenantId) return null;
    clientId = matter.clientId;
  }

  const findOverride = async (where: ReturnType<typeof and>) => {
    const [row] = await db
      .select()
      .from(clauses)
      .where(where)
      .orderBy(desc(clauses.updatedAt))
      .limit(1);
    return row ?? null;
  };

  if (opts.matterId) {
    const row = await findOverride(
      and(
        eq(clauses.tenantId, tenantId),
        eq(clauses.overridesClauseId, base.id),
        eq(clauses.matterId, opts.matterId),
        eq(clauses.status, "approved")
      )
    );
    if (row) return { ...row, appliedScope: "matter", baseClauseId: base.id };
  }
  if (clientId) {
    const row = await findOverride(
      and(
        eq(clauses.tenantId, tenantId),
        eq(clauses.overridesClauseId, base.id),
        eq(clauses.clientId, clientId),
        eq(clauses.status, "approved")
      )
    );
    if (row) return { ...row, appliedScope: "client", baseClauseId: base.id };
  }
  return { ...base, appliedScope: "firm", baseClauseId: base.id };
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
  opts: {
    category?: string;
    jurisdiction?: string;
    clientId?: string | null;
    matterId?: string | null;
    limit?: number;
  }
): Promise<ResolvedClause[]> {
  const bases = await listClauses(tenantId, { category: opts.category });
  const resolved = await Promise.all(
    bases
      .filter((clause) => clause.status === "approved")
      .map((clause) =>
        resolveClause(tenantId, clause.id, {
          clientId: opts.clientId ?? null,
          matterId: opts.matterId ?? null,
        })
      )
  );
  return resolved
    .filter((item): item is ResolvedClause => {
      if (!item) return false;
      return (
        !opts.jurisdiction ||
        !item.jurisdiction ||
        jurisdictionMatches(item.jurisdiction as Jurisdiction, opts.jurisdiction as Jurisdiction)
      );
    })
    .slice(0, opts.limit ?? 8);
}
