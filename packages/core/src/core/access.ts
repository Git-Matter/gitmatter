import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type ArtifactType,
  type MatterRole,
  artifactShares,
  documents,
  matterMembers,
  matters,
  tabularReviews,
  user,
  workflows,
} from "@workspace/db/schema";

// Re-export so consumers can name the role type without reaching into the db pkg.
export type { MatterRole } from "@workspace/db/schema";

// Ordered so a higher role satisfies a lower requirement.
const ROLE_RANK: Record<MatterRole, number> = { viewer: 0, editor: 1, owner: 2 };

/** The tenant a user belongs to, or null if unassigned. */
export async function getUserTenant(userId: string): Promise<string | null> {
  const [row] = await db.select({ tenantId: user.tenantId }).from(user).where(eq(user.id, userId));
  return row?.tenantId ?? null;
}

/** True if the user belongs to the given tenant. */
export async function sameTenant(userId: string, tenantId: string): Promise<boolean> {
  return (await getUserTenant(userId)) === tenantId;
}

// Artifact tables that carry a matterId + owner, keyed by artifact type.
// Chats carry a matterId too but are NOT artifacts (no commit spine, not in
// ArtifactType); chat routes check `hasMatterAccess` directly instead.
const MATTER_TABLE = {
  tabular_review: tabularReviews,
  workflow: workflows,
  document: documents,
} as const;

/**
 * The caller's role on a matter, or null if not a member. Asserts same-tenant as
 * defense-in-depth against cross-tenant id injection (membership normally implies
 * same tenant).
 */
async function matterRole(userId: string, matterId: string): Promise<MatterRole | null> {
  const [row] = await db
    .select({ role: matterMembers.role, matterTenant: matters.tenantId, userTenant: user.tenantId })
    .from(matterMembers)
    .innerJoin(matters, eq(matterMembers.matterId, matters.id))
    .innerJoin(user, eq(matterMembers.userId, user.id))
    .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, userId)));
  if (!row) return null;
  if (row.matterTenant !== row.userTenant) return null;
  return row.role;
}

/** The caller's direct share role on an artifact, or null. Tenant-checked. */
async function artifactShareRole(
  userId: string,
  artifactType: ArtifactType,
  artifactId: string,
  artifactTenant: string
): Promise<MatterRole | null> {
  const [row] = await db
    .select({ role: artifactShares.role, userTenant: user.tenantId })
    .from(artifactShares)
    .innerJoin(user, eq(artifactShares.userId, user.id))
    .where(
      and(
        eq(artifactShares.artifactType, artifactType),
        eq(artifactShares.artifactId, artifactId),
        eq(artifactShares.userId, userId)
      )
    );
  if (!row) return null;
  // Defense-in-depth: shares are tenant-bound at write time, re-check on read.
  if (row.userTenant !== artifactTenant) return null;
  return row.role;
}

/** True if the user is a member of the matter with at least `min` role. */
export async function hasMatterAccess(
  userId: string,
  matterId: string,
  min: MatterRole = "viewer"
): Promise<boolean> {
  const role = await matterRole(userId, matterId);
  if (!role) return false;
  return ROLE_RANK[role] >= ROLE_RANK[min];
}

/**
 * Resolve an artifact to its matter and check the caller's access. The single
 * chokepoint replacing the scattered `artifact.userId === user.id` checks.
 *
 * During the matter rollout an artifact may have a null matterId (not yet
 * backfilled); those fall back to owner-only access. Once every artifact is
 * matter-scoped (NOT NULL), the fallback becomes dead and can be removed.
 *
 * Note: globally-readable resources (e.g. system workflows, which have null
 * userId + null matterId) return false here — do NOT route their reads through
 * this guard; the route layer permits them via the `isSystem` flag.
 */
export async function canAccessArtifact(
  userId: string,
  artifactType: ArtifactType,
  artifactId: string,
  min: MatterRole = "viewer"
): Promise<boolean> {
  const table = MATTER_TABLE[artifactType];
  if (!table) throw new Error(`canAccessArtifact: unsupported artifact type "${artifactType}"`);
  const [row] = await db
    .select({ matterId: table.matterId, ownerId: table.userId, tenantId: table.tenantId })
    .from(table)
    .where(eq(table.id, artifactId));
  if (!row) return false;

  // The intrinsic owner always has full access (covers the not-yet-backfilled
  // null-matterId case too).
  if (row.ownerId === userId) return true;

  // Effective role = the higher of matter membership and a direct artifact share.
  let best = -1;
  if (row.matterId) {
    const mRole = await matterRole(userId, row.matterId);
    if (mRole) best = Math.max(best, ROLE_RANK[mRole]);
  }
  if (row.tenantId) {
    const sRole = await artifactShareRole(userId, artifactType, artifactId, row.tenantId);
    if (sRole) best = Math.max(best, ROLE_RANK[sRole]);
  }
  if (best < 0) return false;
  return best >= ROLE_RANK[min];
}
