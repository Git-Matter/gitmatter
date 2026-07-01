import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  type Actor,
  createClause,
  getClause,
  getClauseLadder,
  listClauses,
  updateClause,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";

// The firm's clause library. Reads are tenant-wide (the library is shared firm
// knowledge). Any member drafts; only a tenant admin approves, edits approved
// language, or deprecates — the approval is what makes the library trustworthy.

const clauseFields = {
  title: z.string().min(1).optional(),
  body: z.string().min(1).optional(),
  category: z.string().min(1).optional(),
  jurisdiction: z.string().nullable().optional(),
  riskRating: z.enum(["acceptable", "negotiable", "escalate"]).optional(),
  guidance: z.string().nullable().optional(),
  tags: z.array(z.string()).nullable().optional(),
  status: z.enum(["approved", "draft", "deprecated"]).optional(),
  parentClauseId: z.string().nullable().optional(),
  fallbackRank: z.number().int().min(1).nullable().optional(),
};

const createClauseSchema = z.object({
  ...clauseFields,
  title: z.string().min(1),
  body: z.string().min(1),
  category: z.string().min(1),
});
const updateClauseSchema = z.object(clauseFields);

export const clausesRoute = new Hono<AuthEnv>();

const actorFor = (userId: string): Actor => ({ type: "user", userId });

clausesRoute.get("/api/clauses", async (c) => {
  const u = c.get("user");
  if (!u.tenantId) return c.json({ error: "No tenant" }, 403);
  const rows = await listClauses(u.tenantId, {
    category: c.req.query("category") || undefined,
    includeDeprecated: c.req.query("includeDeprecated") === "true",
    includeFallbacks: c.req.query("includeFallbacks") === "true",
  });
  return c.json(rows);
});

clausesRoute.get("/api/clauses/:id", async (c) => {
  const u = c.get("user");
  const clause = await getClause(c.req.param("id"));
  if (!clause || clause.tenantId !== u.tenantId) return c.json({ error: "Not found" }, 404);
  return c.json({ clause, ladder: await getClauseLadder(clause.id) });
});

clausesRoute.post("/api/clauses", zValidator("json", createClauseSchema), async (c) => {
  const u = c.get("user");
  if (!u.tenantId) return c.json({ error: "No tenant" }, 403);
  const body = c.req.valid("json");
  // Only admins publish directly; members' clauses land as drafts.
  const status = body.status === "approved" && u.tenantRole !== "admin" ? "draft" : body.status;
  const id = await createClause(actorFor(u.id), { ...body, status });
  return c.json({ id }, 201);
});

clausesRoute.patch("/api/clauses/:id", zValidator("json", updateClauseSchema), async (c) => {
  const u = c.get("user");
  const clause = await getClause(c.req.param("id"));
  if (!clause || clause.tenantId !== u.tenantId) return c.json({ error: "Not found" }, 404);
  const patch = c.req.valid("json");
  const isAdmin = u.tenantRole === "admin";
  const isCreator = clause.userId === u.id;
  // Draft clauses: creator or admin. Approved/deprecated language: admin only.
  if (clause.status !== "draft" && !isAdmin) return c.json({ error: "Forbidden" }, 403);
  if (clause.status === "draft" && !isAdmin && !isCreator)
    return c.json({ error: "Forbidden" }, 403);
  if (patch.status === "approved" && !isAdmin)
    return c.json({ error: "Forbidden: only a firm admin can approve clauses" }, 403);
  const result = await updateClause(actorFor(u.id), clause.id, patch);
  return c.json({ committed: !!result.commit });
});
