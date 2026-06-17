import { Hono } from "hono";
import {
  buildTenantExport,
  createInvite,
  emailEnabled,
  getTenant,
  listInvites,
  listTenantMembers,
  recordAudit,
  revokeInvite,
  sendInviteEmail,
} from "@workspace/core";
import { type AuthEnv } from "../middleware/auth.js";
import { serverOrigin } from "../lib/origin.js";
import { clientMeta } from "../lib/request-meta.js";

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
  const link = `${serverOrigin(c)}/signup?email=${encodeURIComponent(invite.email)}`;
  // With a real email provider, send the link and never expose the token in the
  // API response. In dev (console transport) we return the invite (token incl.)
  // so the inviter can share the link directly.
  if (emailEnabled()) {
    const org = await getTenant(user.tenantId);
    await sendInviteEmail(invite.email, link, org?.name);
    return c.json({ ok: true, email: invite.email, role: invite.role }, 201);
  }
  return c.json(invite, 201);
});

// Full per-tenant data export (admin only): a zip of CSVs + documents manifest.
tenantsRoute.get("/api/tenant/export", async (c) => {
  const user = c.get("user");
  if (user.tenantRole !== "admin") return c.json({ error: "Forbidden" }, 403);
  const { filename, bytes } = await buildTenantExport(user.tenantId);
  void recordAudit({
    eventType: "tenant.export",
    actorId: user.id,
    tenantId: user.tenantId,
    ...clientMeta(c),
  });
  return new Response(bytes as BodyInit, {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
});

tenantsRoute.delete("/api/tenant/invites/:id", async (c) => {
  const user = c.get("user");
  if (user.tenantRole !== "admin") return c.json({ error: "Forbidden" }, 403);
  await revokeInvite(user.tenantId, c.req.param("id"));
  return c.body(null, 204);
});
