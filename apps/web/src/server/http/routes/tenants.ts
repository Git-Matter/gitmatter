import { Hono } from "hono";
import {
  createInvite,
  getTenant,
  listInvites,
  listTenantMembers,
  revokeInvite,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";

export const tenantsRoute = new Hono<AuthEnv>();

// Current tenant (for the org settings / people surfaces).
tenantsRoute.get("/api/tenant", async (c) => {
  const t = await getTenant(c.get("user").tenantId);
  return t ? c.json(t) : c.json({ error: "Not found" }, 404);
});

// Everyone in the caller's organization — backs the settings members list and
// the share picker. Any member may read it.
tenantsRoute.get("/api/tenant/members", async (c) => {
  return c.json(await listTenantMembers(c.get("user").tenantId));
});

// Pending invites — tenant admins only.
tenantsRoute.get("/api/tenant/invites", async (c) => {
  const user = c.get("user");
  if (user.tenantRole !== "admin") return c.json({ error: "Forbidden" }, 403);
  return c.json(await listInvites(user.tenantId));
});

tenantsRoute.post("/api/tenant/invites", async (c) => {
  const user = c.get("user");
  if (user.tenantRole !== "admin") return c.json({ error: "Forbidden" }, 403);
  const body = (await c.req.json().catch(() => ({}))) as { email?: string; role?: string };
  if (!body.email?.trim()) return c.json({ error: "email required" }, 400);
  const invite = await createInvite(
    user.tenantId,
    user.id,
    body.email.trim(),
    body.role === "admin" ? "admin" : "member"
  );
  // A real deployment emails `invite.token` as a sign-up link; we return it so
  // the inviter can share it directly in dev.
  return c.json(invite, 201);
});

tenantsRoute.delete("/api/tenant/invites/:id", async (c) => {
  const user = c.get("user");
  if (user.tenantRole !== "admin") return c.json({ error: "Forbidden" }, 403);
  await revokeInvite(user.tenantId, c.req.param("id"));
  return c.body(null, 204);
});
