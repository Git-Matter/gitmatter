import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  addClientMember,
  addMember,
  auditTrailToCsv,
  auditTrailToDocx,
  checkConflicts,
  clearConflicts,
  closeMatter,
  createClient,
  createFolder,
  createMatter,
  createPracticeArea,
  deleteClients,
  deleteFolder,
  findUserByEmail,
  gatherMatterAudit,
  getClientOverview,
  getMatter,
  hasClientAccess,
  hasMatterAccess,
  listClientMembers,
  listClients,
  listClientsPage,
  listFolders,
  listMattersForUser,
  listMattersPage,
  listPracticeAreas,
  matterUsageSummary,
  listMembers,
  removeClientMember,
  removeMember,
  renameFolder,
  searchUsers,
  selectClients,
  recordAudit,
  updateClient,
  updateMatter,
  rowsToCsv,
  type ClientSelection,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { parsePageQuery } from "../lib/page-query.js";
import {
  addMemberSchema,
  clearConflictsSchema,
  conflictsCheckSchema,
  createClientSchema,
  createMatterSchema,
  updateClientSchema,
  updateMatterSchema,
} from "../schemas/matters.js";

export const mattersRoute = new Hono<AuthEnv>();

const clientStatuses = ["active", "inactive"] as const;
const clientSorts = ["name", "type", "clientNumber", "status", "createdAt", "shared"] as const;
type ClientStatusQuery = (typeof clientStatuses)[number];

function isClientStatus(value: string | undefined): value is ClientStatusQuery {
  return clientStatuses.some((status) => status === value);
}

// ---- Clients (tenant directory) ----

mattersRoute.get("/api/clients", async (c) => {
  const paged = parsePageQuery(c, {
    sorts: clientSorts,
    filters: { status: clientStatuses },
  });
  if (paged) return c.json(await listClientsPage(c.get("user").id, paged));
  return c.json(await listClients(c.get("user").id));
});

mattersRoute.post("/api/clients", zValidator("json", createClientSchema), async (c) => {
  const user = c.get("user");
  const client = await createClient(user.id, user.tenantId, c.req.valid("json"));
  return c.json(client, 201);
});

mattersRoute.patch("/api/clients/:id", zValidator("json", updateClientSchema), async (c) => {
  const id = c.req.param("id");
  // Editing client details is owner-only.
  if (!(await hasClientAccess(c.get("user").id, id, "owner")))
    return c.json({ error: "Forbidden" }, 403);
  const updated = await updateClient(c.get("user").tenantId, id, c.req.valid("json"));
  return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
});

// Build a ClientSelection from a request: `all` (with the live filter) or an
// explicit id list. Used by both bulk delete (JSON body) and export (query).
function clientSelection(src: {
  all?: unknown;
  ids?: unknown;
  q?: string;
  status?: string;
}): ClientSelection {
  if (src.all) {
    return { all: true, q: src.q, status: isClientStatus(src.status) ? src.status : undefined };
  }
  const ids = Array.isArray(src.ids)
    ? (src.ids as unknown[]).filter((v): v is string => typeof v === "string")
    : typeof src.ids === "string"
      ? src.ids.split(",").filter(Boolean)
      : [];
  return { ids };
}

mattersRoute.post("/api/clients/bulk-delete", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as Record<string, unknown>;
  const sel = clientSelection({
    all: body.all,
    ids: body.ids,
    q: typeof body.q === "string" ? body.q : undefined,
    status: typeof body.status === "string" ? body.status : undefined,
  });
  return c.json(await deleteClients(c.get("user").id, sel));
});

mattersRoute.get("/api/clients/export", async (c) => {
  const sel = clientSelection({
    all: c.req.query("all"),
    ids: c.req.query("ids"),
    q: c.req.query("q"),
    status: c.req.query("status"),
  });
  const rows = await selectClients(c.get("user").id, sel);
  const header = ["id", "name", "type", "clientNumber", "status", "createdAt"];
  const csv = rowsToCsv([
    header,
    ...rows.map((r) => [
      r.id,
      r.name,
      r.type,
      r.clientNumber,
      r.status,
      r.createdAt instanceof Date ? r.createdAt.toISOString() : r.createdAt,
    ]),
  ]);
  return new Response(csv, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="clients.csv"`,
    },
  });
});

mattersRoute.get("/api/clients/:id", async (c) => {
  const overview = await getClientOverview(c.get("user").id, c.req.param("id"));
  return overview ? c.json(overview) : c.json({ error: "Not found" }, 404);
});

// ---- Client team (sharing) ----

// People with access (members + their roles); the creator has role "owner".
mattersRoute.get("/api/clients/:id/people", async (c) => {
  const id = c.req.param("id");
  if (!(await hasClientAccess(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  return c.json(await listClientMembers(id));
});

// Add by email: look up a tenant user, then add them. 404s if the
// email isn't a user in this tenant.
mattersRoute.post("/api/clients/:id/members/by-email", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  if (!(await hasClientAccess(user.id, id, "owner"))) return c.json({ error: "Forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
  if (!body.email) return c.json({ error: "email required" }, 400);
  const target = await findUserByEmail(user.tenantId, body.email);
  if (!target) return c.json({ error: "No user in your organization with that email" }, 404);
  try {
    await addClientMember(id, target.id, (body.role as "owner" | "editor" | "viewer") ?? "editor");
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
  return c.json(target, 201);
});

mattersRoute.delete("/api/clients/:id/members/:userId", async (c) => {
  const id = c.req.param("id");
  if (!(await hasClientAccess(c.get("user").id, id, "owner")))
    return c.json({ error: "Forbidden" }, 403);
  try {
    await removeClientMember(id, c.req.param("userId"));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
  return c.body(null, 204);
});

// ---- Matters ----

const matterScopes = ["all", "mine", "shared"] as const;
const matterSorts = ["name", "client", "updatedAt", "createdAt", "owner", "shared"] as const;

mattersRoute.get("/api/matters", async (c) => {
  const paged = parsePageQuery(c, { sorts: matterSorts, filters: { scope: matterScopes } });
  if (paged) return c.json(await listMattersPage(c.get("user").id, paged));
  return c.json(await listMattersForUser(c.get("user").id));
});

mattersRoute.post(
  "/api/matters/conflicts-check",
  zValidator("json", conflictsCheckSchema),
  async (c) => c.json(await checkConflicts(c.get("user").tenantId, c.req.valid("json")))
);

mattersRoute.post("/api/matters", zValidator("json", createMatterSchema), async (c) => {
  const matter = await createMatter(c.get("user").id, c.req.valid("json"));
  return c.json(matter, 201);
});

mattersRoute.get("/api/matters/:id", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  const matter = await getMatter(id);
  return matter ? c.json(matter) : c.json({ error: "Not found" }, 404);
});

// Per-matter LLM/tool usage, aggregated for billing the spend to the matter as
// a client disbursement. CSV format for pasting into a billing system.
mattersRoute.get("/api/matters/:id/usage", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  const summary = await matterUsageSummary(id);
  if (c.req.query("format") !== "csv") return c.json(summary);
  const rows: Array<Array<string | number | null>> = [
    ["kind", "provider", "model_or_tool", "calls", "input_tokens", "output_tokens", "est_cost_usd"],
    ...summary.llm.map((r) => [
      "llm",
      r.provider,
      r.model,
      r.calls,
      r.inputTokens,
      r.outputTokens,
      r.costUsd === null ? null : r.costUsd.toFixed(4),
    ]),
    ...summary.embeddings.map((r) => [
      "embedding",
      r.provider,
      r.model,
      r.calls,
      r.inputTokens,
      0,
      null,
    ]),
    ...summary.tools.map((r) => ["tool", null, r.tool, r.calls, null, null, null]),
  ];
  return new Response(rowsToCsv(rows), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="matter-usage.csv"`,
    },
  });
});

// Export the matter's full audit trail (read-only, no commit). Any member can
// export; each export is itself recorded in the security audit log.
mattersRoute.get("/api/matters/:id/audit-export", async (c) => {
  const id = c.req.param("id");
  const userId = c.get("user").id;
  if (!(await hasMatterAccess(userId, id))) return c.json({ error: "Not found" }, 404);
  const trail = await gatherMatterAudit(id);
  if (!trail) return c.json({ error: "Not found" }, 404);
  const matter = await getMatter(id);
  const format = c.req.query("format") === "docx" ? "docx" : "csv";
  void recordAudit({
    eventType: "matter.audit_export",
    actorId: userId,
    tenantId: matter?.tenantId,
    target: id,
    metadata: { format, entries: trail.entries.length },
  });
  const safe = trail.matterName.replace(/[^\w.-]+/g, "_") || "matter";
  if (format === "docx") {
    return new Response((await auditTrailToDocx(trail)) as BodyInit, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${safe}-audit.docx"`,
      },
    });
  }
  return new Response(auditTrailToCsv(trail), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${safe}-audit.csv"`,
    },
  });
});

mattersRoute.patch("/api/matters/:id", zValidator("json", updateMatterSchema), async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id, "owner")))
    return c.json({ error: "Forbidden" }, 403);
  const updated = await updateMatter(id, c.req.valid("json"));
  return updated ? c.json(updated) : c.json({ error: "Not found" }, 404);
});

mattersRoute.post("/api/matters/:id/close", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id, "owner")))
    return c.json({ error: "Forbidden" }, 403);
  await closeMatter(id);
  return c.body(null, 204);
});

mattersRoute.post(
  "/api/matters/:id/clear-conflicts",
  zValidator("json", clearConflictsSchema),
  async (c) => {
    const id = c.req.param("id");
    if (!(await hasMatterAccess(c.get("user").id, id, "owner")))
      return c.json({ error: "Forbidden" }, 403);
    await clearConflicts(id, c.req.valid("json").notes);
    return c.body(null, 204);
  }
);

// ---- Matter team ----

mattersRoute.get("/api/matters/:id/members", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  return c.json(await listMembers(id));
});

mattersRoute.post("/api/matters/:id/members", zValidator("json", addMemberSchema), async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id, "owner")))
    return c.json({ error: "Forbidden" }, 403);
  const { userId, role } = c.req.valid("json");
  try {
    await addMember(id, userId, role);
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
  return c.body(null, 204);
});

// Add by email: look up a tenant user, then add them. 404s if the
// email isn't a user in this tenant (they must sign up / be invited first).
mattersRoute.post("/api/matters/:id/members/by-email", async (c) => {
  const id = c.req.param("id");
  const user = c.get("user");
  if (!(await hasMatterAccess(user.id, id, "owner"))) return c.json({ error: "Forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
  if (!body.email) return c.json({ error: "email required" }, 400);
  const target = await findUserByEmail(user.tenantId, body.email);
  if (!target) return c.json({ error: "No user in your organization with that email" }, 404);
  try {
    await addMember(id, target.id, (body.role as "owner" | "editor" | "viewer") ?? "editor");
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
  return c.json(target, 201);
});

// People with access (members + their roles); the matter owner has role "owner".
mattersRoute.get("/api/matters/:id/people", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  return c.json(await listMembers(id));
});

// ---- Document folders ----

mattersRoute.get("/api/matters/:id/folders", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id))) return c.json({ error: "Not found" }, 404);
  return c.json(await listFolders(id));
});

mattersRoute.post("/api/matters/:id/folders", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id, "editor")))
    return c.json({ error: "Forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as {
    name?: string;
    parentFolderId?: string | null;
  };
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  const folder = await createFolder(c.get("user").id, id, {
    name: body.name.trim(),
    parentFolderId: body.parentFolderId ?? null,
  });
  return c.json(folder, 201);
});

mattersRoute.patch("/api/matters/:id/folders/:folderId", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id, "editor")))
    return c.json({ error: "Forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  await renameFolder(id, c.req.param("folderId"), body.name.trim());
  return c.body(null, 204);
});

mattersRoute.delete("/api/matters/:id/folders/:folderId", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id, "editor")))
    return c.json({ error: "Forbidden" }, 403);
  await deleteFolder(id, c.req.param("folderId"));
  return c.body(null, 204);
});

mattersRoute.delete("/api/matters/:id/members/:userId", async (c) => {
  const id = c.req.param("id");
  if (!(await hasMatterAccess(c.get("user").id, id, "owner")))
    return c.json({ error: "Forbidden" }, 403);
  try {
    await removeMember(id, c.req.param("userId"));
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "failed" }, 400);
  }
  return c.body(null, 204);
});

// ---- Firm user directory ----

mattersRoute.get("/api/users/search", async (c) => {
  const q = c.req.query("q")?.trim();
  if (!q) return c.json([]);
  return c.json(await searchUsers(c.get("user").tenantId, q));
});

// ---- Practice areas (per-user pick list, shared by workflows + matters) ----

mattersRoute.get("/api/practice-areas", async (c) =>
  c.json(await listPracticeAreas(c.get("user").id))
);

mattersRoute.post("/api/practice-areas", async (c) => {
  const body = (await c.req.json().catch(() => ({}))) as { name?: string };
  if (!body.name?.trim()) return c.json({ error: "name required" }, 400);
  return c.json({ name: await createPracticeArea(c.get("user").id, body.name) }, 201);
});
