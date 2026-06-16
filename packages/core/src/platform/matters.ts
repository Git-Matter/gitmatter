import { and, asc, count, desc, eq, ilike, inArray, isNull, ne, or } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type MatterRole,
  clients,
  documentFolders,
  documents,
  matterMembers,
  matters,
  tabularReviews,
  user,
} from "@workspace/db/schema";

// Clients and matters are firm organization, not commit-spine artifacts — plain
// CRUD with a `createdBy` audit column. Access to the WORK inside a matter is
// governed by matter_members (see the core access guard).

// ---- Clients ----

export async function createClient(
  creatorId: string,
  tenantId: string,
  input: { name: string; type?: "organization" | "individual"; clientNumber?: string }
) {
  const [row] = await db
    .insert(clients)
    .values({
      tenantId,
      name: input.name,
      type: input.type ?? "organization",
      clientNumber: input.clientNumber ?? null,
      createdBy: creatorId,
    })
    .returning();
  return row!;
}

export async function updateClient(
  tenantId: string,
  id: string,
  fields: {
    name?: string;
    type?: "organization" | "individual";
    clientNumber?: string | null;
    status?: "active" | "inactive";
  }
) {
  const [row] = await db
    .update(clients)
    .set({ ...fields, updatedAt: new Date() })
    .where(and(eq(clients.id, id), eq(clients.tenantId, tenantId)))
    .returning();
  return row ?? null;
}

export async function listClients(tenantId: string) {
  return db
    .select()
    .from(clients)
    .where(eq(clients.tenantId, tenantId))
    .orderBy(desc(clients.createdAt));
}

export type ClientListSort = "name" | "type" | "clientNumber" | "status" | "createdAt";

export type ClientListParams = {
  q?: string;
  status?: "active" | "inactive";
  page: number;
  pageSize: number;
  sort?: ClientListSort;
  dir?: "asc" | "desc";
};

// Shared WHERE for the client list: tenant scope + optional status + fuzzy
// search. Used by the paged list, bulk delete, and CSV export so all three
// resolve the exact same set for a given filter.
function clientFilter(tenantId: string, opts: { q?: string; status?: "active" | "inactive" }) {
  const q = opts.q?.trim();
  return and(
    eq(clients.tenantId, tenantId),
    opts.status ? eq(clients.status, opts.status) : undefined,
    q
      ? or(
          ilike(clients.name, `%${q}%`),
          ilike(clients.type, `%${q}%`),
          ilike(clients.clientNumber, `%${q}%`)
        )
      : undefined
  );
}

export async function listClientsPage(tenantId: string, params: ClientListParams) {
  const where = clientFilter(tenantId, params);
  const sortCols = {
    name: clients.name,
    type: clients.type,
    clientNumber: clients.clientNumber,
    status: clients.status,
    createdAt: clients.createdAt,
  };
  const sortCol = sortCols[params.sort ?? "createdAt"];
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const offset = params.page * params.pageSize;

  const [rows, countRows] = await Promise.all([
    db.select().from(clients).where(where).orderBy(order).limit(params.pageSize).offset(offset),
    db.select({ count: count() }).from(clients).where(where),
  ]);

  return { rows, rowCount: Number(countRows[0]?.count ?? 0) };
}

// A bulk selection is either an explicit set of ids (the rows the user ticked)
// or "everything matching the current filter" — the latter never enumerates ids
// on the client, so it stays correct across pages and large result sets.
export type ClientSelection =
  | { ids: string[] }
  | { all: true; q?: string; status?: "active" | "inactive" };

async function resolveClientIds(tenantId: string, sel: ClientSelection): Promise<string[]> {
  if ("ids" in sel) {
    if (!sel.ids.length) return [];
    // Re-scope to the tenant so a caller can't act on ids from another firm.
    const rows = await db
      .select({ id: clients.id })
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, sel.ids)));
    return rows.map((r) => r.id);
  }
  const rows = await db.select({ id: clients.id }).from(clients).where(clientFilter(tenantId, sel));
  return rows.map((r) => r.id);
}

/** Full client rows for a selection, name-sorted — backs CSV export. */
export async function selectClients(tenantId: string, sel: ClientSelection) {
  if ("ids" in sel) {
    if (!sel.ids.length) return [];
    return db
      .select()
      .from(clients)
      .where(and(eq(clients.tenantId, tenantId), inArray(clients.id, sel.ids)))
      .orderBy(asc(clients.name));
  }
  return db.select().from(clients).where(clientFilter(tenantId, sel)).orderBy(asc(clients.name));
}

/** Bulk-delete clients in a selection. Clients that still have matters are
 *  blocked (would orphan work) and counted as `skipped`; the rest are deleted.
 *  Returns the split so the UI can report it. */
export async function deleteClients(
  tenantId: string,
  sel: ClientSelection
): Promise<{ deleted: number; skipped: number }> {
  const candidateIds = await resolveClientIds(tenantId, sel);
  if (!candidateIds.length) return { deleted: 0, skipped: 0 };

  const withMatters = await db
    .selectDistinct({ clientId: matters.clientId })
    .from(matters)
    .where(inArray(matters.clientId, candidateIds));
  const blocked = new Set(withMatters.map((r) => r.clientId));
  const deletable = candidateIds.filter((id) => !blocked.has(id));

  // Chunk to stay clear of the bind-parameter limit on large "select all" sets.
  for (let i = 0; i < deletable.length; i += 500) {
    const chunk = deletable.slice(i, i + 500);
    await db.delete(clients).where(and(eq(clients.tenantId, tenantId), inArray(clients.id, chunk)));
  }
  return { deleted: deletable.length, skipped: blocked.size };
}

export async function getClient(id: string) {
  const [row] = await db.select().from(clients).where(eq(clients.id, id));
  return row ?? null;
}

/** Client plus the work under it the user can see: their matters on this client,
 *  and the documents/reviews filed under those matters. Returns null if the client
 *  doesn't exist. Artifact lists are empty when the user has no matters. */
export async function getClientOverview(userId: string, clientId: string) {
  const client = await getClient(clientId);
  if (!client) return null;

  const matterRows = await db
    .select({ matter: matters, role: matterMembers.role })
    .from(matterMembers)
    .innerJoin(matters, eq(matterMembers.matterId, matters.id))
    .where(and(eq(matterMembers.userId, userId), eq(matters.clientId, clientId)))
    .orderBy(desc(matters.updatedAt));

  const matterIds = matterRows.map((r) => r.matter.id);
  if (!matterIds.length) {
    return { client, matters: matterRows, documents: [], reviews: [] };
  }

  const [documentRows, reviewRows] = await Promise.all([
    db
      .select({
        id: documents.id,
        title: documents.title,
        fileType: documents.fileType,
        status: documents.status,
        matterId: documents.matterId,
        createdAt: documents.createdAt,
      })
      .from(documents)
      .where(and(inArray(documents.matterId, matterIds), isNull(documents.deletedAt)))
      .orderBy(desc(documents.createdAt)),
    db
      .select({
        id: tabularReviews.id,
        title: tabularReviews.title,
        matterId: tabularReviews.matterId,
        createdAt: tabularReviews.createdAt,
      })
      .from(tabularReviews)
      .where(inArray(tabularReviews.matterId, matterIds))
      .orderBy(desc(tabularReviews.createdAt)),
  ]);

  return {
    client,
    matters: matterRows,
    documents: documentRows,
    reviews: reviewRows,
  };
}

// ---- Matters ----

type MatterInput = {
  clientId: string;
  name: string;
  practiceArea?: string;
  adverseParties?: string[];
};

/** Create a matter and add the creator as its `owner` member, atomically. The
 *  matter copies its client's tenantId down (the isolation root). */
export async function createMatter(creatorId: string, input: MatterInput) {
  const [client] = await db
    .select({ tenantId: clients.tenantId })
    .from(clients)
    .where(eq(clients.id, input.clientId));
  if (!client) throw new Error("Client not found");
  return db.transaction(async (tx) => {
    const [matter] = await tx
      .insert(matters)
      .values({
        tenantId: client.tenantId,
        clientId: input.clientId,
        name: input.name,
        practiceArea: input.practiceArea ?? null,
        adverseParties: input.adverseParties ?? null,
        createdBy: creatorId,
        leadAttorney: creatorId,
      })
      .returning();
    await tx
      .insert(matterMembers)
      .values({ matterId: matter!.id, userId: creatorId, role: "owner" });
    return matter!;
  });
}

/** Update a matter's editable details (plain CRUD — matters aren't commit-spine
 *  artifacts). Only provided fields change. */
export async function updateMatter(
  id: string,
  fields: {
    clientId?: string;
    name?: string;
    practiceArea?: string | null;
    jurisdiction?: string | null;
    status?: "open" | "closed";
    conflictCleared?: boolean;
    conflictNotes?: string | null;
  }
) {
  // Keep closedAt in step with status; drop conflict notes when un-clearing.
  const closedAt =
    fields.status === "closed" ? new Date() : fields.status === "open" ? null : undefined;
  const conflictNotes = fields.conflictCleared === false ? null : fields.conflictNotes;
  const [row] = await db
    .update(matters)
    .set({ ...fields, conflictNotes, closedAt, updatedAt: new Date() })
    .where(eq(matters.id, id))
    .returning();
  return row ?? null;
}

// Owner name + people-with-access count for a set of matters, keyed by matter id.
async function matterMemberAgg(matterIds: string[]) {
  const memberRows = await db
    .select({ matterId: matterMembers.matterId, role: matterMembers.role, name: user.name })
    .from(matterMembers)
    .innerJoin(user, eq(matterMembers.userId, user.id))
    .where(inArray(matterMembers.matterId, matterIds));

  const byMatter = new Map<string, { owner: string | null; count: number }>();
  for (const m of memberRows) {
    const agg = byMatter.get(m.matterId) ?? { owner: null, count: 0 };
    agg.count += 1;
    if (m.role === "owner") agg.owner = m.name;
    byMatter.set(m.matterId, agg);
  }
  return byMatter;
}

/** Matters the user is staffed on, newest first, with the client, the user's
 *  role, the owner's name, and how many people have access (for the list view). */
export async function listMattersForUser(userId: string) {
  const base = await db
    .select({ matter: matters, client: clients, role: matterMembers.role })
    .from(matterMembers)
    .innerJoin(matters, eq(matterMembers.matterId, matters.id))
    .innerJoin(clients, eq(matters.clientId, clients.id))
    .where(eq(matterMembers.userId, userId))
    .orderBy(desc(matters.updatedAt));

  const matterIds = base.map((b) => b.matter.id);
  if (!matterIds.length) return [];

  const byMatter = await matterMemberAgg(matterIds);
  return base.map((b) => ({
    ...b,
    ownerName: byMatter.get(b.matter.id)?.owner ?? null,
    memberCount: byMatter.get(b.matter.id)?.count ?? 1,
  }));
}

export type MatterListScope = "all" | "mine" | "shared";
export type MatterListSort = "name" | "client" | "updatedAt" | "createdAt";

export type MatterListParams = {
  q?: string;
  scope?: MatterListScope;
  page: number;
  pageSize: number;
  sort?: MatterListSort;
  dir?: "asc" | "desc";
};

/** Paginated counterpart to listMattersForUser: same row shape (matter + client +
 *  role + ownerName + memberCount), with server-side scope filter, name/client
 *  search, sort, and a parallel total count. */
export async function listMattersPage(userId: string, params: MatterListParams) {
  const q = params.q?.trim();
  const where = and(
    eq(matterMembers.userId, userId),
    params.scope === "mine"
      ? eq(matterMembers.role, "owner")
      : params.scope === "shared"
        ? ne(matterMembers.role, "owner")
        : undefined,
    q ? or(ilike(matters.name, `%${q}%`), ilike(clients.name, `%${q}%`)) : undefined
  );
  const sortCols = {
    name: matters.name,
    client: clients.name,
    updatedAt: matters.updatedAt,
    createdAt: matters.createdAt,
  };
  const sortCol = sortCols[params.sort ?? "updatedAt"];
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const offset = params.page * params.pageSize;

  const [base, countRows] = await Promise.all([
    db
      .select({ matter: matters, client: clients, role: matterMembers.role })
      .from(matterMembers)
      .innerJoin(matters, eq(matterMembers.matterId, matters.id))
      .innerJoin(clients, eq(matters.clientId, clients.id))
      .where(where)
      .orderBy(order)
      .limit(params.pageSize)
      .offset(offset),
    db
      .select({ count: count() })
      .from(matterMembers)
      .innerJoin(matters, eq(matterMembers.matterId, matters.id))
      .innerJoin(clients, eq(matters.clientId, clients.id))
      .where(where),
  ]);

  const rowCount = Number(countRows[0]?.count ?? 0);
  const matterIds = base.map((b) => b.matter.id);
  if (!matterIds.length) return { rows: [], rowCount };

  const byMatter = await matterMemberAgg(matterIds);
  const rows = base.map((b) => ({
    ...b,
    ownerName: byMatter.get(b.matter.id)?.owner ?? null,
    memberCount: byMatter.get(b.matter.id)?.count ?? 1,
  }));
  return { rows, rowCount };
}

export async function getMatter(id: string) {
  const [row] = await db.select().from(matters).where(eq(matters.id, id));
  return row ?? null;
}

export async function closeMatter(id: string) {
  await db
    .update(matters)
    .set({ status: "closed", closedAt: new Date(), updatedAt: new Date() })
    .where(eq(matters.id, id));
}

/** Record a conflicts clearance after the user has reviewed any matches. */
export async function clearConflicts(id: string, notes?: string) {
  await db
    .update(matters)
    .set({ conflictCleared: true, conflictNotes: notes ?? null, updatedAt: new Date() })
    .where(eq(matters.id, id));
}

// ---- Members ----

export async function listMembers(matterId: string) {
  return db
    .select({
      userId: matterMembers.userId,
      role: matterMembers.role,
      addedAt: matterMembers.addedAt,
      name: user.name,
      email: user.email,
    })
    .from(matterMembers)
    .innerJoin(user, eq(matterMembers.userId, user.id))
    .where(eq(matterMembers.matterId, matterId));
}

/** Add (or re-role) a member. Sharing is tenant-bounded: the target user must
 *  belong to the same tenant as the matter. */
export async function addMember(matterId: string, userId: string, role: MatterRole = "editor") {
  const [matter] = await db
    .select({ tenantId: matters.tenantId })
    .from(matters)
    .where(eq(matters.id, matterId));
  if (!matter) throw new Error("Matter not found");
  const [target] = await db
    .select({ tenantId: user.tenantId })
    .from(user)
    .where(eq(user.id, userId));
  if (!target) throw new Error("User not found");
  if (target.tenantId !== matter.tenantId) {
    throw new Error("can only share with users in your organization");
  }
  await db
    .insert(matterMembers)
    .values({ matterId, userId, role })
    .onConflictDoUpdate({ target: [matterMembers.matterId, matterMembers.userId], set: { role } });
}

/** Find a tenant user by exact email — backs the "Add by email" share path. */
export async function findUserByEmail(tenantId: string, email: string) {
  const [row] = await db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(and(eq(user.email, email.toLowerCase().trim()), eq(user.tenantId, tenantId)));
  return row ?? null;
}

/** Remove a member. Refuses to remove the matter's last owner (would orphan it). */
export async function removeMember(matterId: string, userId: string) {
  const owners = await db
    .select({ userId: matterMembers.userId })
    .from(matterMembers)
    .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.role, "owner")));
  if (owners.length <= 1 && owners.some((o) => o.userId === userId)) {
    throw new Error("cannot remove the last owner of a matter");
  }
  await db
    .delete(matterMembers)
    .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, userId)));
}

// ---- Firm user directory ----

/** Substring search over the caller's tenant users by name or email. */
export async function searchUsers(tenantId: string, q: string) {
  const term = `%${q}%`;
  return db
    .select({ id: user.id, name: user.name, email: user.email })
    .from(user)
    .where(and(eq(user.tenantId, tenantId), or(ilike(user.name, term), ilike(user.email, term))))
    .limit(20);
}

// ---- Document folders ----

export function listFolders(matterId: string) {
  return db
    .select()
    .from(documentFolders)
    .where(eq(documentFolders.matterId, matterId))
    .orderBy(documentFolders.name);
}

export async function createFolder(
  creatorId: string,
  matterId: string,
  input: { name: string; parentFolderId?: string | null }
) {
  const [m] = await db
    .select({ tenantId: matters.tenantId })
    .from(matters)
    .where(eq(matters.id, matterId));
  if (!m) throw new Error("Matter not found");
  const [row] = await db
    .insert(documentFolders)
    .values({
      matterId,
      tenantId: m.tenantId,
      name: input.name,
      parentFolderId: input.parentFolderId ?? null,
      createdBy: creatorId,
    })
    .returning();
  return row!;
}

export async function renameFolder(matterId: string, folderId: string, name: string) {
  await db
    .update(documentFolders)
    .set({ name })
    .where(and(eq(documentFolders.id, folderId), eq(documentFolders.matterId, matterId)));
}

export async function deleteFolder(matterId: string, folderId: string) {
  await db
    .delete(documentFolders)
    .where(and(eq(documentFolders.id, folderId), eq(documentFolders.matterId, matterId)));
}

// ---- Conflicts ----

/** Lightweight conflict check: does the new client/adverse-party overlap an
 *  existing client or another matter's adverse parties? Returns the matches. */
export async function checkConflicts(
  tenantId: string,
  input: { clientName: string; adverseParties?: string[] }
) {
  const names = new Set(
    [input.clientName, ...(input.adverseParties ?? [])].map((n) => n.toLowerCase().trim())
  );
  const [existingClients, existingMatters] = await Promise.all([
    db.select({ name: clients.name }).from(clients).where(eq(clients.tenantId, tenantId)),
    db
      .select({ name: matters.name, adverseParties: matters.adverseParties })
      .from(matters)
      .where(eq(matters.tenantId, tenantId)),
  ]);
  const matches: string[] = [];
  for (const c of existingClients)
    if (names.has(c.name.toLowerCase().trim())) matches.push(`existing client "${c.name}"`);
  for (const m of existingMatters)
    for (const ap of m.adverseParties ?? [])
      if (names.has(ap.toLowerCase().trim()))
        matches.push(`adverse party "${ap}" on matter "${m.name}"`);
  return { matches };
}

// ---- Default matter ----

/** Every user has a home matter. Idempotent: returns the user's first matter, or
 *  creates a personal client + "General" matter + owner membership. */
export async function ensureDefaultMatter(
  userId: string,
  displayName: string,
  tenantId: string
): Promise<string> {
  const [existing] = await db
    .select({ id: matters.id })
    .from(matterMembers)
    .innerJoin(matters, eq(matterMembers.matterId, matters.id))
    .where(eq(matterMembers.userId, userId))
    .limit(1);
  if (existing) return existing.id;

  return db.transaction(async (tx) => {
    const [client] = await tx
      .insert(clients)
      .values({
        tenantId,
        name: `${displayName} (Personal)`,
        type: "individual",
        createdBy: userId,
      })
      .returning();
    const [matter] = await tx
      .insert(matters)
      .values({
        tenantId,
        clientId: client!.id,
        name: "General",
        createdBy: userId,
        leadAttorney: userId,
        conflictCleared: true,
      })
      .returning();
    await tx.insert(matterMembers).values({ matterId: matter!.id, userId, role: "owner" });
    return matter!.id;
  });
}
