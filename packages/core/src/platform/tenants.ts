import { randomUUID } from "node:crypto";
import { and, desc, eq, gt, isNull } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  auditEvents,
  type StorageRegion,
  type TenantRole,
  tenantInvites,
  tenants,
  user,
} from "@workspace/db/schema";
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

/**
 * Choose storage placement once for a newly-created organization. Region is
 * immutable because moving it later requires an audited object migration.
 */
export async function setTenantStorageRegion(
  tenantId: string,
  actorId: string,
  region: Exclude<StorageRegion, "legacy">
) {
  const [updated] = await db
    .update(tenants)
    .set({ storageRegion: region })
    .where(and(eq(tenants.id, tenantId), isNull(tenants.storageRegion)))
    .returning();
  if (!updated) throw new Error("Data region has already been selected");
  void recordAudit({
    eventType: "tenant.storage_region_set",
    actorId,
    tenantId,
    target: tenantId,
    metadata: { region },
  });
  return updated;
}

/**
 * A tenant-admin export that proves the application's data-residency control.
 * It deliberately does not attest to a cloud provider's configuration: retain
 * the provider-console evidence listed in `externalEvidenceRequired` alongside
 * this record before making an external residency claim.
 */
export async function buildTenantPrivacyEvidence(tenantId: string) {
  const [tenant] = await db
    .select({
      id: tenants.id,
      name: tenants.name,
      storageRegion: tenants.storageRegion,
      createdAt: tenants.createdAt,
    })
    .from(tenants)
    .where(eq(tenants.id, tenantId));
  if (!tenant) throw new Error("Tenant not found");

  const [selection] = await db
    .select({
      actorId: auditEvents.actorId,
      createdAt: auditEvents.createdAt,
      metadata: auditEvents.metadata,
    })
    .from(auditEvents)
    .where(
      and(
        eq(auditEvents.tenantId, tenantId),
        eq(auditEvents.eventType, "tenant.storage_region_set")
      )
    )
    .orderBy(desc(auditEvents.createdAt))
    .limit(1);

  const storageTarget =
    tenant.storageRegion === "eu"
      ? {
          label: "Cloudflare R2 EU jurisdiction",
          configuration: "S3_EU_*",
          providerEvidence:
            "R2 bucket details showing jurisdiction EU and the bucket-scoped API-token policy.",
        }
      : tenant.storageRegion === "us"
        ? {
            label: "United States regional object storage",
            configuration: "S3_US_*",
            providerEvidence:
              "AWS S3 GetBucketLocation, Block Public Access, encryption, and IAM-policy evidence for the configured bucket.",
          }
        : tenant.storageRegion === "au"
          ? {
              label: "Australia regional object storage",
              configuration: "S3_AU_*",
              providerEvidence:
                "AWS S3 GetBucketLocation, Block Public Access, encryption, and IAM-policy evidence for the configured bucket.",
            }
          : {
              label: "Legacy object storage",
              configuration: "S3_*",
              providerEvidence:
                "The provider configuration and residency evidence for the legacy bucket.",
            };

  return {
    schemaVersion: "1.0",
    generatedAt: new Date().toISOString(),
    purpose: "Evidence of gitmatter's document object-storage routing control.",
    scope:
      "Document object storage only. This record does not establish the location of Postgres, audit logs, backups, AI providers, or other subprocessors.",
    tenant: {
      id: tenant.id,
      name: tenant.name,
      createdAt: tenant.createdAt.toISOString(),
      storageRegion: tenant.storageRegion,
    },
    routingControl: {
      immutableAfterSelection: true,
      target: storageTarget,
      selectionAuditEvent: selection
        ? {
            actorId: selection.actorId,
            createdAt: selection.createdAt.toISOString(),
            metadata: selection.metadata,
          }
        : null,
    },
    externalEvidenceRequired: [
      storageTarget.providerEvidence,
      "A dated export or screenshot of the production deployment environment showing the matching S3_* target is configured, with credentials redacted.",
      "The current Cloudflare or AWS contractual/data-residency documentation applicable to the account and plan.",
    ],
  };
}
