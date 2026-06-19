import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type ArtifactType,
  type MatterRole,
  artifactShares,
  documents,
  matterMembers,
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
 * For a batch of artifacts, everyone who can access each one: the owner, the
 * members of its matter (matter sharing cascades to child items), and anyone it's
 * directly shared with — deduped by user. `count` is the distinct head count and
 * `names` the first few (owner first). Drives the "Shared with" cell, so it must
 * read ≤ 1 (i.e. owner only) as "Private".
 */
export async function accessSummaryByArtifact(
  artifactType: ShareableType,
  artifacts: Array<{ id: string; matterId: string | null; ownerId: string | null }>
): Promise<Map<string, ShareSummary>> {
  const out = new Map<string, ShareSummary>();
  if (!artifacts.length) return out;

  const ids = artifacts.map((a) => a.id);
  const matterIds = [...new Set(artifacts.map((a) => a.matterId).filter((x): x is string => !!x))];
  const ownerIds = [...new Set(artifacts.map((a) => a.ownerId).filter((x): x is string => !!x))];

  const shareRows = await db
    .select({
      artifactId: artifactShares.artifactId,
      userId: artifactShares.userId,
      name: user.name,
    })
    .from(artifactShares)
    .innerJoin(user, eq(artifactShares.userId, user.id))
    .where(
      and(eq(artifactShares.artifactType, artifactType), inArray(artifactShares.artifactId, ids))
    );
  const sharesByArtifact = new Map<string, Array<{ userId: string; name: string }>>();
  for (const r of shareRows) {
    const list = sharesByArtifact.get(r.artifactId) ?? [];
    list.push({ userId: r.userId, name: r.name });
    sharesByArtifact.set(r.artifactId, list);
  }

  const memberRows = matterIds.length
    ? await db
        .select({ matterId: matterMembers.matterId, userId: matterMembers.userId, name: user.name })
        .from(matterMembers)
        .innerJoin(user, eq(matterMembers.userId, user.id))
        .where(inArray(matterMembers.matterId, matterIds))
    : [];
  const membersByMatter = new Map<string, Array<{ userId: string; name: string }>>();
  for (const r of memberRows) {
    const list = membersByMatter.get(r.matterId) ?? [];
    list.push({ userId: r.userId, name: r.name });
    membersByMatter.set(r.matterId, list);
  }

  const ownerNameById = new Map<string, string>();
  if (ownerIds.length) {
    const ownerRows = await db
      .select({ id: user.id, name: user.name })
      .from(user)
      .where(inArray(user.id, ownerIds));
    for (const o of ownerRows) ownerNameById.set(o.id, o.name);
  }

  for (const a of artifacts) {
    const seen = new Set<string>();
    const names: string[] = [];
    const add = (userId: string | null, name?: string | null) => {
      if (!userId || seen.has(userId)) return;
      seen.add(userId);
      if (name) names.push(name);
    };
    add(a.ownerId, a.ownerId ? ownerNameById.get(a.ownerId) : null);
    for (const m of membersByMatter.get(a.matterId ?? "") ?? []) add(m.userId, m.name);
    for (const s of sharesByArtifact.get(a.id) ?? []) add(s.userId, s.name);
    out.set(a.id, { count: seen.size, names: names.slice(0, 3) });
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
