import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type ArtifactType,
  type MatterRole,
  artifactShares,
  documents,
  tabularReviews,
  user,
} from "@workspace/db/schema";

// Per-artifact sharing for documents and reviews. Mirrors the matter member
// functions (platform/matters.ts) but keyed by (artifactType, artifactId). The
// intrinsic owner (artifact.userId) is implicit — never a row in artifact_shares.

// Only these artifact types support direct sharing today.
type ShareableType = Extract<ArtifactType, "document" | "tabular_review">;

const SHARE_TABLE = {
  document: documents,
  tabular_review: tabularReviews,
} as const;

/** The owner + tenant of a shareable artifact, or null if it doesn't exist. */
async function artifactOwner(artifactType: ShareableType, artifactId: string) {
  const table = SHARE_TABLE[artifactType];
  const [row] = await db
    .select({ ownerId: table.userId, tenantId: table.tenantId })
    .from(table)
    .where(eq(table.id, artifactId));
  return row ?? null;
}

export type ArtifactPerson = {
  userId: string;
  role: MatterRole;
  addedAt: Date | null;
  name: string;
  email: string;
};

/**
 * Everyone with access to an artifact: the intrinsic owner (as an "owner" row)
 * merged with explicit shares. Same row shape as listMembers so the share dialog
 * is type-compatible.
 */
export async function listArtifactShares(
  artifactType: ShareableType,
  artifactId: string
): Promise<ArtifactPerson[]> {
  const owner = await artifactOwner(artifactType, artifactId);
  if (!owner) return [];

  const shares = await db
    .select({
      userId: artifactShares.userId,
      role: artifactShares.role,
      addedAt: artifactShares.addedAt,
      name: user.name,
      email: user.email,
    })
    .from(artifactShares)
    .innerJoin(user, eq(artifactShares.userId, user.id))
    .where(
      and(eq(artifactShares.artifactType, artifactType), eq(artifactShares.artifactId, artifactId))
    );

  const [ownerRow] = owner.ownerId
    ? await db
        .select({ name: user.name, email: user.email })
        .from(user)
        .where(eq(user.id, owner.ownerId))
    : [];

  // Owner first, then shares — but never list the owner twice if a stray share
  // row exists for them.
  const people: ArtifactPerson[] = [];
  if (owner.ownerId && ownerRow) {
    people.push({
      userId: owner.ownerId,
      role: "owner",
      addedAt: null,
      name: ownerRow.name,
      email: ownerRow.email,
    });
  }
  for (const s of shares) {
    if (s.userId === owner.ownerId) continue;
    people.push(s);
  }
  return people;
}

/** Add (or re-role) a share. Tenant-bounded: the target must belong to the
 *  artifact's tenant. The intrinsic owner cannot be added as a share. */
export async function addArtifactShareByEmail(
  artifactType: ShareableType,
  artifactId: string,
  email: string,
  role: MatterRole = "editor"
) {
  const owner = await artifactOwner(artifactType, artifactId);
  if (!owner) throw new Error("Artifact not found");
  if (!owner.tenantId) throw new Error("Artifact is not shareable");

  const [target] = await db
    .select({ id: user.id, tenantId: user.tenantId })
    .from(user)
    .where(eq(user.email, email.toLowerCase().trim()));
  if (!target || target.tenantId !== owner.tenantId) {
    throw new Error("can only share with users in your organization");
  }
  if (target.id === owner.ownerId) {
    throw new Error("user already owns this item");
  }

  await db
    .insert(artifactShares)
    .values({ artifactType, artifactId, userId: target.id, role })
    .onConflictDoUpdate({
      target: [artifactShares.artifactType, artifactShares.artifactId, artifactShares.userId],
      set: { role },
    });
  return target.id;
}

/** Remove a share. No last-owner guard needed: the intrinsic owner is never a
 *  share row, so the artifact can never be orphaned. */
export async function removeArtifactShare(
  artifactType: ShareableType,
  artifactId: string,
  userId: string
) {
  await db
    .delete(artifactShares)
    .where(
      and(
        eq(artifactShares.artifactType, artifactType),
        eq(artifactShares.artifactId, artifactId),
        eq(artifactShares.userId, userId)
      )
    );
}

export type ShareSummary = { count: number; names: string[] };

/**
 * For a batch of artifact ids, the explicit shares (NOT counting the owner):
 * how many people it's shared with and their names. The list endpoints add the
 * owner on top to get the total "people with access".
 */
export async function shareCountByArtifact(
  artifactType: ShareableType,
  ids: string[]
): Promise<Map<string, ShareSummary>> {
  const out = new Map<string, ShareSummary>();
  if (!ids.length) return out;
  const rows = await db
    .select({ artifactId: artifactShares.artifactId, name: user.name })
    .from(artifactShares)
    .innerJoin(user, eq(artifactShares.userId, user.id))
    .where(
      and(eq(artifactShares.artifactType, artifactType), inArray(artifactShares.artifactId, ids))
    );
  for (const r of rows) {
    const cur = out.get(r.artifactId) ?? { count: 0, names: [] };
    cur.count += 1;
    if (cur.names.length < 3) cur.names.push(r.name);
    out.set(r.artifactId, cur);
  }
  return out;
}

/** Ids of artifacts of a type directly shared with a user — powers "shared with
 *  me" list scopes. */
export async function sharedArtifactIds(
  artifactType: ShareableType,
  userId: string
): Promise<string[]> {
  const rows = await db
    .select({ artifactId: artifactShares.artifactId })
    .from(artifactShares)
    .where(and(eq(artifactShares.artifactType, artifactType), eq(artifactShares.userId, userId)));
  return rows.map((r) => r.artifactId);
}

/** Everyone in a tenant — backs the Settings members list and the share picker. */
export function listTenantMembers(tenantId: string) {
  return db
    .select({
      id: user.id,
      name: user.name,
      email: user.email,
      role: user.tenantRole,
    })
    .from(user)
    .where(eq(user.tenantId, tenantId));
}
