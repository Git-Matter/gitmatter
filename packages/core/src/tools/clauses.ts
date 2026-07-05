import { z } from "zod";
import { getUserTenant } from "../core/index.js";
import {
  createClause,
  getClause,
  getClauseLadder,
  listClauses,
  suggestClauses,
  updateClause,
} from "../content/clauses.js";
import type { ToolContext, ToolSpec } from "./types.js";

// The firm's clause library over MCP: agents read approved language and
// fallback ladders while drafting, and (for unscoped editor tokens) maintain
// the library itself. Reads are tenant-wide — the library IS the firm's shared
// knowledge — but writes are refused for matter-scoped or viewer-capped tokens.
export function buildClauseTools({ actor }: ToolContext): ToolSpec[] {
  const scope = actor.type === "agent" ? (actor.scope ?? null) : null;
  const readOnly = !!scope?.matterIds || scope?.maxRole === "viewer";

  const tenant = async () => getUserTenant(actor.userId);

  return [
    {
      name: "list_clauses",
      description:
        "List the firm's clause library (approved language + negotiation positions), standard positions only. Filter by category. Use get_clause for a clause's full body and fallback ladder.",
      schema: {
        category: z.string().optional(),
        includeDeprecated: z.boolean().optional(),
      },
      handler: async ({ category, includeDeprecated }) => {
        const tenantId = await tenant();
        if (!tenantId) return { error: "Forbidden: no tenant" };
        const rows = await listClauses(tenantId, {
          category: category as string | undefined,
          includeDeprecated: includeDeprecated as boolean | undefined,
        });
        return {
          clauses: rows.map((r) => ({
            id: r.id,
            title: r.title,
            category: r.category,
            jurisdiction: r.jurisdiction,
            riskRating: r.riskRating,
            status: r.status,
          })),
        };
      },
    },
    {
      name: "get_clause",
      description:
        "Fetch one clause with its full body, guidance, and fallback ladder (standard position first, then concessions in retreat order).",
      schema: { clauseId: z.string() },
      handler: async ({ clauseId }) => {
        const tenantId = await tenant();
        const clause = await getClause(clauseId as string);
        if (!clause || !tenantId || clause.tenantId !== tenantId) return { error: "Not found" };
        const ladder = await getClauseLadder(clause.id);
        return { clause, ladder };
      },
    },
    {
      name: "suggest_clauses",
      description:
        "Approved clauses relevant to a category and jurisdiction — use these as preferred language when drafting or proposing edits, and cite the clause id.",
      schema: {
        category: z.string().optional(),
        jurisdiction: z.string().optional(),
        clientId: z.string().optional(),
      },
      handler: async ({ category, jurisdiction, clientId }) => {
        const tenantId = await tenant();
        if (!tenantId) return { error: "Forbidden: no tenant" };
        const rows = await suggestClauses(tenantId, {
          category: category as string | undefined,
          jurisdiction: jurisdiction as string | undefined,
          clientId: (clientId as string | undefined) ?? null,
        });
        return { clauses: rows };
      },
    },
    {
      name: "write_clause",
      description:
        "Create or update a clause in the firm library. Provide clauseId to update. New clauses land as drafts; a firm admin approves them in the UI. Set parentClauseId + fallbackRank to add a fallback position.",
      schema: {
        clauseId: z.string().optional(),
        title: z.string().optional(),
        body: z.string().optional(),
        category: z.string().optional(),
        jurisdiction: z.string().optional(),
        riskRating: z.enum(["acceptable", "negotiable", "escalate"]).optional(),
        guidance: z.string().optional(),
        tags: z.array(z.string()).optional(),
        parentClauseId: z.string().optional(),
        fallbackRank: z.number().int().min(1).optional(),
      },
      handler: async (input) => {
        if (readOnly)
          return { error: "Forbidden: this token's scope does not allow library writes" };
        const tenantId = await tenant();
        if (!tenantId) return { error: "Forbidden: no tenant" };
        const { clauseId, ...rest } = input as {
          clauseId?: string;
          title?: string;
          body?: string;
          category?: string;
        } & Record<string, unknown>;
        if (clauseId) {
          const existing = await getClause(clauseId);
          if (!existing || existing.tenantId !== tenantId) return { error: "Not found" };
          // Agents refine drafts; approved language changes only via the UI.
          if (existing.status === "approved")
            return { error: "Forbidden: approved clauses are edited by firm admins in the UI" };
          const result = await updateClause(actor, clauseId, rest);
          return { clauseId, committed: !!result.commit };
        }
        if (!rest.title || !rest.body || !rest.category)
          return { error: "title, body, and category are required to create a clause" };
        const id = await createClause(actor, {
          title: rest.title,
          body: rest.body,
          category: rest.category,
          jurisdiction: (rest.jurisdiction as string | undefined) ?? null,
          riskRating: rest.riskRating as never,
          guidance: (rest.guidance as string | undefined) ?? null,
          tags: (rest.tags as string[] | undefined) ?? null,
          parentClauseId: (rest.parentClauseId as string | undefined) ?? null,
          fallbackRank: (rest.fallbackRank as number | undefined) ?? null,
        });
        return { clauseId: id, committed: true };
      },
    },
  ];
}
