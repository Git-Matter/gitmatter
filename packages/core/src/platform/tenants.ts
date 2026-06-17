import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { type TenantRole, tenantInvites, tenants, user } from "@workspace/db/schema";
import { recordAudit } from "./audit.js";
import { ensureDefaultMatter } from "./matters.js";

const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

/** Pending (unconsumed, unexpired) invite for an email, newest first. */
async function pendingInvite(email: string) {
  const [row] = await db
    .select()
    .from(tenantInvites)
    .where(
      and(
        eq(tenantInvites.email, email.toLowerCase().trim()),
        isNull(tenantInvites.acceptedAt),
        gt(tenantInvites.expiresAt, new Date())
      )
    )
    .orderBy(desc(tenantInvites.createdAt));
  return row ?? null;
}

/**
 * Assign a freshly-created user to a tenant (create-or-invite). If a pending
 * invite matches their email they join that tenant with its role; otherwise a
 * new tenant is created and they become its admin. Stamps user.tenantId/role and
 * provisions their home matter. Idempotent for an already-assigned user.
 */
export async function provisionUserTenant(u: {
  id: string;
  name: string;
  email: string;
}): Promise<{ tenantId: string; role: TenantRole }> {
  const [existing] = await db
    .select({ tenantId: user.tenantId, tenantRole: user.tenantRole })
    .from(user)
    .where(eq(user.id, u.id));
  if (existing?.tenantId) {
    await ensureDefaultMatter(u.id, u.name, existing.tenantId);
    return { tenantId: existing.tenantId, role: existing.tenantRole };
  }

  const invite = await pendingInvite(u.email);
  let tenantId: string;
  let role: TenantRole;
  if (invite) {
    tenantId = invite.tenantId;
    role = invite.role;
    await db
      .update(tenantInvites)
      .set({ acceptedAt: new Date() })
      .where(eq(tenantInvites.id, invite.id));
    void recordAudit({
      eventType: "invite.accept",
      actorId: u.id,
      tenantId,
      target: invite.id,
      metadata: { email: u.email, role },
    });
  } else {
    const [t] = await db
      .insert(tenants)
      .values({ name: `${u.name}'s Organization`, createdBy: u.id })
      .returning();
    tenantId = t!.id;
    role = "admin";
  }

  await db.update(user).set({ tenantId, tenantRole: role }).where(eq(user.id, u.id));
  await ensureDefaultMatter(u.id, u.name, tenantId);
  return { tenantId, role };
}

// ---- Invite management (tenant admins) ----

export async function createInvite(
  tenantId: string,
  invitedBy: string,
  email: string,
  role: TenantRole = "member"
) {
  const token = randomUUID();
  const [row] = await db
    .insert(tenantInvites)
    .values({
      tenantId,
      email: email.toLowerCase().trim(),
      token,
      role,
      invitedBy,
      expiresAt: new Date(Date.now() + INVITE_TTL_MS),
    })
    .returning();
  void recordAudit({
    eventType: "invite.create",
    actorId: invitedBy,
    tenantId,
    target: row!.id,
    metadata: { email: row!.email, role },
  });
  return row!;
}

export function listInvites(tenantId: string) {
  return db
    .select()
    .from(tenantInvites)
    .where(eq(tenantInvites.tenantId, tenantId))
    .orderBy(desc(tenantInvites.createdAt));
}

export async function revokeInvite(tenantId: string, id: string) {
  await db
    .delete(tenantInvites)
    .where(and(eq(tenantInvites.id, id), eq(tenantInvites.tenantId, tenantId)));
}

export function getInviteByToken(token: string) {
  return db
    .select()
    .from(tenantInvites)
    .where(eq(tenantInvites.token, token))
    .then((r) => r[0] ?? null);
}

export function getTenant(id: string) {
  return db
    .select()
    .from(tenants)
    .where(eq(tenants.id, id))
    .then((r) => r[0] ?? null);
}
