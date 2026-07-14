import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type ArtifactType,
  type MatterRole,
  artifactShares,
  clauses,
  clientMembers,
  clients,
  documents,
  matterMembers,
  matters,
  tabularReviews,
  user,
  workflows,
} from "@workspace/db/schema";
import type { Actor, TokenScope } from "./commit.js";

// Re-export so consumers can name the role type without reaching into the db pkg.
export type { MatterRole } from "@workspace/db/schema";

// Ordered so a higher role satisfies a lower requirement.
const ROLE_RANK: Record<MatterRole, number> = { viewer: 0, editor: 1, owner: 2 };

/**
 * Who a guard is checking: a bare userId (human routes, internals — never
 * scoped) or an Actor (tool layer). A scoped agent actor is clamped: matters
 * outside its scope are invisible, and its effective role is capped at
 * `maxRole` — even on artifacts the underlying user owns outright.
 */
export type AccessSubject = string | Actor;

function subjectUserId(subject: AccessSubject): string {
  return typeof subject === "string" ? subject : subject.userId;
}

function subjectScope(subject: AccessSubject): TokenScope | null {
  if (typeof subject === "string" || subject.type !== "agent") return null;
  return subject.scope ?? null;
}

/** True when the scope permits touching the given matter. A matter-scoped token
 *  cannot touch artifacts with no matter (null matterId). */
export function scopeAllowsMatter(scope: TokenScope | null, matterId: string | null): boolean {
  if (!scope?.matterIds) return true;
  return matterId !== null && scope.matterIds.includes(matterId);
}

function clampRank(scope: TokenScope | null, rank: number): number {
  return scope?.maxRole ? Math.min(rank, ROLE_RANK[scope.maxRole]) : rank;
}

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
  clause: clauses,
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

/**
 * The caller's role on a client, or null if not a member. Like matterRole, asserts
 * same-tenant as defense-in-depth. A client is visible only to its members.
 */
async function clientRole(userId: string, clientId: string): Promise<MatterRole | null> {
  const [row] = await db
    .select({ role: clientMembers.role, clientTenant: clients.tenantId, userTenant: user.tenantId })
    .from(clientMembers)
    .innerJoin(clients, eq(clientMembers.clientId, clients.id))
    .innerJoin(user, eq(clientMembers.userId, user.id))
    .where(and(eq(clientMembers.clientId, clientId), eq(clientMembers.userId, userId)));
  if (!row) return null;
  if (row.clientTenant !== row.userTenant) return null;
  return row.role;
}

/** True if the subject is a member of the client with at least `min` role. A
 *  matter-scoped agent reaches a client only through one of its allowed matters. */
export async function hasClientAccess(
  subject: AccessSubject,
  clientId: string,
  min: MatterRole = "viewer"
): Promise<boolean> {
  const userId = subjectUserId(subject);
  const scope = subjectScope(subject);
  const role = await clientRole(userId, clientId);
  if (!role) return false;
  if (scope?.matterIds) {
    const [allowed] = await db
      .select({ id: matters.id })
      .from(matters)
      .where(and(eq(matters.clientId, clientId), inArray(matters.id, scope.matterIds)))
      .limit(1);
    if (!allowed) return false;
  }
  return clampRank(scope, ROLE_RANK[role]) >= ROLE_RANK[min];
}

/** True if the subject is a member of the matter with at least `min` role. */
export async function hasMatterAccess(
  subject: AccessSubject,
  matterId: string,
  min: MatterRole = "viewer"
): Promise<boolean> {
  const scope = subjectScope(subject);
  if (!scopeAllowsMatter(scope, matterId)) return false;
  const role = await matterRole(subjectUserId(subject), matterId);
  if (!role) return false;
  return clampRank(scope, ROLE_RANK[role]) >= ROLE_RANK[min];
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
  subject: AccessSubject,
  artifactType: ArtifactType,
  artifactId: string,
  min: MatterRole = "viewer"
): Promise<boolean> {
  const userId = subjectUserId(subject);
  const scope = subjectScope(subject);
  const table = MATTER_TABLE[artifactType];
  if (!table) throw new Error(`canAccessArtifact: unsupported artifact type "${artifactType}"`);
  const [row] = await db
    .select({ matterId: table.matterId, ownerId: table.userId, tenantId: table.tenantId })
    .from(table)
    .where(eq(table.id, artifactId));
  if (!row) return false;

  // A matter-scoped token cannot touch artifacts outside its matters — including
  // artifacts the underlying user owns, and artifacts with no matter yet.
  if (!scopeAllowsMatter(scope, row.matterId)) return false;

  // Firm-library clauses and playbooks are visible to every member of the
  // tenant. Only an admin gets the editor-level capability through this shared
  // guard; a draft's creator still gets ownership below.
  let firmRole = -1;
  if (!row.matterId && row.tenantId && (artifactType === "clause" || artifactType === "workflow")) {
    const [account] = await db
      .select({ tenantId: user.tenantId, tenantRole: user.tenantRole })
      .from(user)
      .where(eq(user.id, userId));
    if (account?.tenantId === row.tenantId)
      firmRole = account.tenantRole === "admin" ? ROLE_RANK.owner : ROLE_RANK.viewer;
  }

  // The intrinsic owner has full access (covers the not-yet-backfilled
  // null-matterId case too), subject to the scope's role cap.
  let best = row.ownerId === userId ? ROLE_RANK.owner : firmRole;

  // Effective role = the higher of matter membership and a direct artifact share.
  if (best < ROLE_RANK.owner && row.matterId) {
    const mRole = await matterRole(userId, row.matterId);
    if (mRole) best = Math.max(best, ROLE_RANK[mRole]);
  }
  if (best < ROLE_RANK.owner && row.tenantId) {
    const sRole = await artifactShareRole(userId, artifactType, artifactId, row.tenantId);
    if (sRole) best = Math.max(best, ROLE_RANK[sRole]);
  }
  if (best < 0) return false;
  return clampRank(scope, best) >= ROLE_RANK[min];
}

/**
 * Read access to a document, with review access cascading: a user who can read a
 * tabular review can also read the documents that review contains, even when the
 * docs were never shared with them directly. Read-only — editor endpoints keep
 * gating on `canAccessArtifact("document", …, "editor")`.
 */
export async function canReadDocument(subject: AccessSubject, docId: string): Promise<boolean> {
  if (await canAccessArtifact(subject, "document", docId)) return true;
  const reviews = await db
    .select({ id: tabularReviews.id })
    .from(tabularReviews)
    .where(sql`${tabularReviews.documentIds} @> ${JSON.stringify([docId])}::jsonb`);
  for (const r of reviews) {
    if (await canAccessArtifact(subject, "tabular_review", r.id)) return true;
  }
  return false;
}
