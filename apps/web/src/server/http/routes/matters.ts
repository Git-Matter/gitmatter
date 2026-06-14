import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  addMember,
  checkConflicts,
  clearConflicts,
  closeMatter,
  createClient,
  createFolder,
  createMatter,
  deleteFolder,
  findUserByEmail,
  getClientOverview,
  getMatter,
  hasMatterAccess,
  listClients,
  listFolders,
  listMattersForUser,
  listMembers,
  removeMember,
  renameFolder,
  searchUsers,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import {
  addMemberSchema,
  clearConflictsSchema,
  conflictsCheckSchema,
  createClientSchema,
  createMatterSchema,
} from "../schemas/matters.js";

export const mattersRoute = new Hono<AuthEnv>();

// ---- Clients (tenant directory) ----

mattersRoute.get("/api/clients", async (c) => c.json(await listClients(c.get("user").tenantId)));

mattersRoute.post("/api/clients", zValidator("json", createClientSchema), async (c) => {
  const user = c.get("user");
  const client = await createClient(user.id, user.tenantId, c.req.valid("json"));
  return c.json(client, 201);
});

mattersRoute.get("/api/clients/:id", async (c) => {
  const overview = await getClientOverview(c.get("user").id, c.req.param("id"));
  return overview ? c.json(overview) : c.json({ error: "Not found" }, 404);
});

// ---- Matters ----

mattersRoute.get("/api/matters", async (c) => c.json(await listMattersForUser(c.get("user").id)));

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

// Mike-style "Add by email": look up a tenant user, then add them. 404s if the
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
