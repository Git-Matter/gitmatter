import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  commits,
  documentEdits,
  documentVersions,
  documents,
  matterDocuments,
  matterMembers,
  matters,
  user,
  type Document,
} from "@workspace/db/schema";
import { shareCountByArtifact, sharedArtifactIds } from "../platform/shares.js";
import { type Actor, recordCommit } from "../core/commit.js";
import { extractMarkdown, type SupportedFileType } from "./extract.js";
import { emitDocStatus } from "./extractionEvents.js";
import { generateDocx, type DocxSpec } from "./docx/generate.js";
import {
  applyTrackedEdits,
  extractDocxBodyText,
  resolveTrackedChange,
} from "./docx/trackedChanges.js";
import { buildStoragePath, deleteObject, getObject, putObject } from "../core/storage.js";

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DocumentListSort = "title" | "fileType" | "status" | "createdAt";

export type ShareScope = "all" | "mine" | "shared";

export type DocumentListParams = {
  q?: string;
  status?: "pending" | "processing" | "ready" | "failed";
  page: number;
  pageSize: number;
  sort?: DocumentListSort;
  dir?: "asc" | "desc";
  matterId?: string;
  folderId?: string | null;
  // Visibility scope for the user-scoped (non-matter) view:
  // mine = owned, shared = shared with me, all = owned + shared + matter-inherited.
  scope?: ShareScope;
};

const documentListFields = {
  id: documents.id,
  title: documents.title,
  fileType: documents.fileType,
  status: documents.status,
  extractionError: documents.extractionError,
  sizeBytes: documents.sizeBytes,
  folderId: documents.folderId,
  currentVersionId: documents.currentVersionId,
  createdAt: documents.createdAt,
};

/** Resolve a matter's tenant — documents copy tenantId down for isolation + key building. */
async function matterTenant(matterId: string): Promise<string> {
  const [m] = await db
    .select({ tenantId: matters.tenantId })
    .from(matters)
    .where(eq(matters.id, matterId));
  if (!m) throw new Error("Matter not found");
  return m.tenantId;
}

export function listDocuments(userId: string) {
  return db
    .select(documentListFields)
    .from(documents)
    .where(and(eq(documents.userId, userId), isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt));
}

/** Documents in a matter, optionally scoped to a folder (null folderId = root).
 * Reads through matter_documents so linked (not just origin) docs are included;
 * folder placement is per-matter (matter_documents.folderId). */
export function listMatterDocuments(matterId: string, folderId?: string | null) {
  const folderCond =
    folderId === undefined
      ? undefined
      : folderId === null
        ? isNull(matterDocuments.folderId)
        : eq(matterDocuments.folderId, folderId);
  return db
    .select(documentListFields)
    .from(matterDocuments)
    .innerJoin(documents, eq(documents.id, matterDocuments.documentId))
    .where(and(eq(matterDocuments.matterId, matterId), folderCond, isNull(documents.deletedAt)))
    .orderBy(desc(documents.createdAt));
}

export async function listDocumentsPage(userId: string, params: DocumentListParams) {
  const q = params.q?.trim();
  // Matter-scoped views read through matter_documents so linked (not just origin)
  // docs are included, and folder placement is per-matter; user-scoped views read
  // documents directly.
  const byMatter = !!params.matterId;
  const folderCol = byMatter ? matterDocuments.folderId : documents.folderId;
  const folderCond =
    params.folderId === undefined
      ? undefined
      : params.folderId === null
        ? isNull(folderCol)
        : eq(folderCol, params.folderId);

  // The user-scoped (non-matter) view honors a visibility scope. "shared" reads
  // direct shares; "all" also folds in matter-inherited access (docs whose origin
  // or linked matter the user is a member of).
  let scopeCond;
  if (!byMatter) {
    const scope: ShareScope = params.scope ?? "all";
    const owned = eq(documents.userId, userId);
    const sharedIds = await sharedArtifactIds("document", userId);
    const sharedCond = sharedIds.length ? inArray(documents.id, sharedIds) : sql`false`;
    if (scope === "mine") {
      scopeCond = owned;
    } else if (scope === "shared") {
      scopeCond = sharedCond;
    } else {
      const myMatters = db
        .select({ matterId: matterMembers.matterId })
        .from(matterMembers)
        .where(eq(matterMembers.userId, userId));
      const linkedDocs = db
        .select({ id: matterDocuments.documentId })
        .from(matterDocuments)
        .where(inArray(matterDocuments.matterId, myMatters));
      scopeCond = or(
        owned,
        sharedCond,
        inArray(documents.matterId, myMatters),
        inArray(documents.id, linkedDocs)
      );
    }
  }

  const where = and(
    byMatter ? eq(matterDocuments.matterId, params.matterId!) : scopeCond,
    isNull(documents.deletedAt),
    folderCond,
    params.status === "processing"
      ? inArray(documents.status, ["pending", "processing"])
      : params.status
        ? eq(documents.status, params.status)
        : undefined,
    q ? or(ilike(documents.title, `%${q}%`), ilike(documents.fileType, `%${q}%`)) : undefined
  );
  const sortCols = {
    title: documents.title,
    fileType: documents.fileType,
    status: documents.status,
    createdAt: documents.createdAt,
  };
  const sortCol = sortCols[params.sort ?? "createdAt"];
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const offset = params.page * params.pageSize;

  const rowsQuery = db
    .select({
      ...documentListFields,
      matterId: documents.matterId,
      matterName: matters.name,
      ownerId: documents.userId,
      ownerName: user.name,
      versionNumber: documentVersions.versionNumber,
    })
    .from(documents)
    .leftJoin(matters, eq(matters.id, documents.matterId))
    .leftJoin(user, eq(user.id, documents.userId))
    .leftJoin(documentVersions, eq(documentVersions.id, documents.currentVersionId))
    .$dynamic();
  const countQuery = db.select({ count: count() }).from(documents).$dynamic();
  if (byMatter) {
    rowsQuery.innerJoin(matterDocuments, eq(matterDocuments.documentId, documents.id));
    countQuery.innerJoin(matterDocuments, eq(matterDocuments.documentId, documents.id));
  }

  const [rows, countRows] = await Promise.all([
    rowsQuery.where(where).orderBy(order).limit(params.pageSize).offset(offset),
    countQuery.where(where),
  ]);

  // Attach "people with access": the owner plus everyone the doc is shared with.
  const shares = await shareCountByArtifact(
    "document",
    rows.map((r) => r.id)
  );
  const withShares = rows.map(({ ownerId, ...r }) => {
    const s = shares.get(r.id);
    const names = [r.ownerName, ...(s?.names ?? [])].filter((n): n is string => !!n).slice(0, 3);
    return {
      ...r,
      isOwner: ownerId === userId,
      shareCount: (s?.count ?? 0) + 1,
      sharedNames: names,
    };
  });

  return { rows: withShares, rowCount: Number(countRows[0]?.count ?? 0) };
}

export async function getDocument(id: string) {
  const [row] = await db
    .select()
    .from(documents)
    .where(and(eq(documents.id, id), isNull(documents.deletedAt)));
  return row ?? null;
}

export function listVersions(documentId: string) {
  return db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNumber));
}

export async function createDocument(
  userId: string,
  input: {
    title: string;
    markdown: string;
    fileType?: string;
    matterId: string;
    folderId?: string | null;
  }
) {
  // Pasted text needs no extraction and no stored bytes — born ready.
  const [doc] = await db
    .insert(documents)
    .values({
      userId,
      tenantId: await matterTenant(input.matterId),
      matterId: input.matterId,
      folderId: input.folderId ?? null,
      title: input.title,
      fileType: input.fileType ?? "text/markdown",
      markdown: input.markdown,
      sizeBytes: input.markdown.length,
      status: "ready",
    })
    .returning();
  return doc;
}

/**
 * Generate a .docx from a structured spec, store it, and record a `create`
 * commit so the new document lands in the same audit log as everything else.
 * Used by the in-app chat tool and the MCP `generate_docx` tool.
 */
export async function createGeneratedDocument(
  actor: Actor,
  input: { matterId: string; spec: DocxSpec }
): Promise<Document> {
  const bytes = Buffer.from(await generateDocx(input.spec));
  const tenantId = await matterTenant(input.matterId);
  const docId = randomUUID();
  const versionId = randomUUID();
  const storagePath = buildStoragePath({
    tenantId,
    userId: actor.userId,
    artifactId: docId,
    ext: "docx",
  });
  await putObject(storagePath, bytes, DOCX_MIME);
  await db.insert(documents).values({
    id: docId,
    userId: actor.userId,
    tenantId,
    matterId: input.matterId,
    title: input.spec.title,
    fileType: "docx",
    sizeBytes: bytes.length,
    status: "ready",
    currentVersionId: versionId,
  });
  await db.insert(documentVersions).values({
    id: versionId,
    documentId: docId,
    versionNumber: 1,
    storagePath,
    source: "generated",
    sizeBytes: bytes.length,
    fileType: "docx",
  });
  await recordCommit({
    artifactType: "document",
    artifactId: docId,
    actor,
    op: "create",
    message: `Generated ${input.spec.title}`,
    apply: async ({ tx, commitId }) => {
      await tx
        .update(documentVersions)
        .set({ lastCommitId: commitId })
        .where(eq(documentVersions.id, versionId));
      return { changes: [{ path: "file", before: null, after: storagePath }] };
    },
  });
  const [final] = await db.select().from(documents).where(eq(documents.id, docId));
  return final!;
}

/**
 * Upload a PDF/DOCX: persist the raw bytes to object storage and insert a
 * `pending` row, then return immediately. The caller kicks extraction via the
 * per-user queue (`enqueueExtraction`); markdown extraction (DOCX via mammoth,
 * PDF via the docling sidecar) records a system-authored commit when it
 * completes.
 */
export async function uploadDocument(
  userId: string,
  input: {
    title: string;
    fileType: SupportedFileType;
    bytes: Buffer;
    matterId: string;
    folderId?: string | null;
  }
) {
  // Store the file BEFORE the row is visible to the extraction worker.
  // Inserting as `pending` first lets a worker claim it in the gap before the
  // object exists, which fails the doc with "no stored file to extract". So we
  // pre-generate the id, write the object, then insert the row already complete.
  const tenantId = await matterTenant(input.matterId);
  const id = randomUUID();
  const versionId = randomUUID();
  const storagePath = buildStoragePath({
    tenantId,
    userId,
    artifactId: id,
    ext: input.fileType,
  });
  await putObject(storagePath, input.bytes);
  const [row] = await db
    .insert(documents)
    .values({
      id,
      userId,
      tenantId,
      matterId: input.matterId,
      folderId: input.folderId ?? null,
      title: input.title,
      fileType: input.fileType,
      sizeBytes: input.bytes.length,
      currentVersionId: versionId,
      status: "pending",
    })
    .returning();
  await db.insert(documentVersions).values({
    id: versionId,
    documentId: id,
    versionNumber: 1,
    storagePath,
    source: "upload",
    sizeBytes: input.bytes.length,
    fileType: input.fileType,
  });
  // Self-link to the origin matter so it lists there (source of truth for which
  // matters a doc appears in).
  await db.insert(matterDocuments).values({
    matterId: input.matterId,
    documentId: id,
    folderId: input.folderId ?? null,
  });
  return row;
}

/**
 * Link existing documents into a matter (many-to-many). Only links docs the user
 * owns within the matter's tenant; placement defaults to the matter root. Idempotent
 * (re-linking is a no-op). Returns the number of new links created.
 */
export async function linkDocumentsToMatter(
  userId: string,
  matterId: string,
  documentIds: string[]
): Promise<number> {
  if (documentIds.length === 0) return 0;
  const tenantId = await matterTenant(matterId);
  const eligible = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        inArray(documents.id, documentIds),
        eq(documents.userId, userId),
        eq(documents.tenantId, tenantId),
        isNull(documents.deletedAt)
      )
    );
  if (eligible.length === 0) return 0;
  const inserted = await db
    .insert(matterDocuments)
    .values(eligible.map((d) => ({ matterId, documentId: d.id, folderId: null })))
    .onConflictDoNothing()
    .returning({ documentId: matterDocuments.documentId });
  return inserted.length;
}

/** Storage path of a document's active version, or null (pasted-text docs have none). */
export async function activeStoragePath(doc: Document): Promise<string | null> {
  if (!doc.currentVersionId) return null;
  const [v] = await db
    .select({ storagePath: documentVersions.storagePath })
    .from(documentVersions)
    .where(eq(documentVersions.id, doc.currentVersionId));
  return v?.storagePath ?? null;
}

// Access is checked at the route/tool layer via the matter guard; these operate
// by id.
//
// Soft-delete: hide the document from lists and record a `delete` commit. The
// row, its versions, and S3 bytes stay until the retention window lapses, then
// `purgeExpiredDocuments` hard-deletes them. Kicks an opportunistic purge.
export async function deleteDocument(actor: Actor, id: string) {
  const doc = await getDocument(id);
  if (!doc) return;
  await recordCommit({
    artifactType: "document",
    artifactId: id,
    actor,
    op: "delete",
    message: `Deleted ${doc.title}`,
    apply: async ({ tx }) => {
      await tx
        .update(documents)
        .set({ deletedAt: new Date(), deletedBy: actor.userId })
        .where(eq(documents.id, id));
      return { changes: [{ path: "deletedAt", before: null, after: "now" }] };
    },
  });
  void purgeExpiredDocuments().catch(() => {});
}

const RETENTION_DAYS = 30;

/**
 * Hard-delete documents whose soft-delete is older than the retention window:
 * free their S3 bytes, then remove the row (cascades versions/edits/commits).
 * Idempotent and safe to call repeatedly (startup + after each delete).
 */
export async function purgeExpiredDocuments(): Promise<number> {
  const expired = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        sql`${documents.deletedAt} is not null`,
        sql`${documents.deletedAt} < now() - interval '${sql.raw(String(RETENTION_DAYS))} days'`
      )
    );
  for (const { id } of expired) {
    const versions = await db
      .select({ storagePath: documentVersions.storagePath })
      .from(documentVersions)
      .where(eq(documentVersions.documentId, id));
    for (const v of versions) {
      if (v.storagePath) await deleteObject(v.storagePath).catch(() => {});
    }
    await db.delete(documents).where(eq(documents.id, id));
  }
  return expired.length;
}

/** Rename a document, recording the change on the audit spine. */
export async function renameDocument(actor: Actor, id: string, title: string) {
  const doc = await getDocument(id);
  if (!doc) throw new Error("Document not found");
  await recordCommit({
    artifactType: "document",
    artifactId: id,
    actor,
    op: "rename",
    message: `Renamed to "${title}"`,
    skipIfNoChanges: true,
    apply: async ({ tx }) => {
      await tx.update(documents).set({ title }).where(eq(documents.id, id));
      return {
        changes: title === doc.title ? [] : [{ path: "title", before: doc.title, after: title }],
      };
    },
  });
  return getDocumentDetail(id);
}

/**
 * Replace a document's file with a new uploaded version: store the bytes as the
 * next version, repoint `currentVersionId`, and reset the row to `pending` so the
 * caller can re-run extraction against the new content.
 */
export async function addDocumentVersion(
  actor: Actor,
  documentId: string,
  input: { fileType: SupportedFileType; bytes: Buffer }
): Promise<Document> {
  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");
  const latest = await latestVersion(documentId);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: doc.userId,
    artifactId: doc.id,
    ext: input.fileType,
    version: versionNumber,
  });
  await putObject(storagePath, input.bytes);
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "replace",
    message: latest
      ? `Replaced active file with version ${versionNumber} (superseded version ${latest.versionNumber})`
      : `Uploaded version ${versionNumber}`,
    apply: async ({ tx, commitId }) => {
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          documentId,
          versionNumber,
          storagePath,
          source: "replace",
          fileType: input.fileType,
          sizeBytes: input.bytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await tx
        .update(documents)
        .set({
          fileType: input.fileType,
          sizeBytes: input.bytes.length,
          currentVersionId: nv!.id,
          status: "pending",
          extractionError: null,
          attempts: 0,
          claimedAt: null,
        })
        .where(eq(documents.id, documentId));
      return {
        changes: [{ path: "version", before: latest?.versionNumber ?? null, after: versionNumber }],
      };
    },
  });
  const [row] = await db.select().from(documents).where(eq(documents.id, documentId));
  return row!;
}

/**
 * Soft-delete a past version: purge its stored bytes and tombstone the row so it
 * stays in the history. The active version can't be deleted — replace it first.
 */
export async function deleteDocumentVersion(actor: Actor, documentId: string, versionId: string) {
  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");
  if (doc.currentVersionId === versionId) throw new Error("Cannot delete the active version");
  const [v] = await db
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)));
  if (!v) throw new Error("Version not found");
  if (v.deletedAt) throw new Error("Version already deleted");
  if (v.storagePath) await deleteObject(v.storagePath);
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "delete_version",
    message: `Deleted version ${v.versionNumber}`,
    apply: async ({ tx, commitId }) => {
      await tx
        .update(documentVersions)
        .set({
          deletedAt: new Date(),
          deletedBy: actor.userId,
          storagePath: null,
          lastCommitId: commitId,
        })
        .where(eq(documentVersions.id, versionId));
      return {
        changes: [{ path: `version/${v.versionNumber}`, before: "active", after: "deleted" }],
      };
    },
  });
}

/**
 * Re-queue a document for extraction: a `failed` one, or a `processing` one
 * whose run was lost (claimed > 5 min ago, e.g. a server restart). Returns the
 * reset row so the caller can re-enqueue it; null if the doc isn't retryable.
 */
export async function retryDocument(id: string) {
  const [row] = await db
    .update(documents)
    .set({ status: "pending", extractionError: null, attempts: 0, claimedAt: null })
    .where(
      and(
        eq(documents.id, id),
        or(
          eq(documents.status, "failed"),
          and(
            eq(documents.status, "processing"),
            sql`${documents.claimedAt} < now() - interval '5 minutes'`
          )
        )
      )
    )
    .returning();
  return row ?? null;
}

/**
 * Extract markdown for a document and record the result as a system-authored
 * ("extractor" agent) commit on the document artifact. Drives the row through
 * `processing` -> `ready`/`failed` and emits each transition. On failure the
 * row is marked `failed` for the manual retry button (no auto-requeue).
 */
export async function processDocument(doc: Document): Promise<void> {
  // Flip to `processing` first: drives the UI badge and leaves a recoverable
  // (stale) row if the server dies mid-extract. Emit every transition so the
  // SSE stream can push it to the browser.
  console.log(
    `[extract] document ${doc.id} start (type=${doc.fileType}, attempt=${doc.attempts + 1})`
  );
  await db
    .update(documents)
    .set({ status: "processing", claimedAt: new Date(), attempts: doc.attempts + 1 })
    .where(eq(documents.id, doc.id));
  emitDocStatus({ userId: doc.userId, id: doc.id, status: "processing", extractionError: null });

  const fail = async (message: string, err?: unknown) => {
    // Log with context so a failed extraction is debuggable from server logs,
    // not just the truncated message stored on the row.
    console.error(
      `[extract] document ${doc.id} failed (type=${doc.fileType}, attempt=${doc.attempts + 1}): ${message}`,
      err instanceof Error ? err.stack : err
    );
    await db
      .update(documents)
      .set({ status: "failed", extractionError: message, claimedAt: null })
      .where(eq(documents.id, doc.id));
    emitDocStatus({ userId: doc.userId, id: doc.id, status: "failed", extractionError: message });
  };

  const storagePath = await activeStoragePath(doc);
  if (!storagePath) {
    await fail("no stored file to extract");
    return;
  }
  try {
    const bytes = Buffer.from(await getObject(storagePath));
    const { markdown, pageCount } = await extractMarkdown(bytes, doc.fileType as SupportedFileType);

    await recordCommit({
      artifactType: "document",
      artifactId: doc.id,
      actor: { type: "agent", userId: doc.userId, agentLabel: "extractor" },
      op: "extract",
      message: `Extracted markdown (${doc.fileType})`,
      // recordCommit stamps head_commit_id on the document row itself.
      apply: async ({ tx }) => {
        await tx
          .update(documents)
          .set({ markdown, pageCount, status: "ready", extractionError: null, claimedAt: null })
          .where(eq(documents.id, doc.id));
        return { changes: [{ path: "markdown", before: null, after: markdown }] };
      },
    });
    console.log(`[extract] document ${doc.id} ready (pageCount=${pageCount ?? "?"})`);
    emitDocStatus({ userId: doc.userId, id: doc.id, status: "ready", extractionError: null });
  } catch (err) {
    await fail(err instanceof Error ? err.message : "extraction failed", err);
  }
}

// --- Redline (tracked changes) -------------------------------------------
// Any document can be redlined. A DOCX document (fileType "docx" with a stored
// version) runs through the OOXML tracked-changes engine — each propose/resolve
// writes a new immutable version. Every other document redlines its `markdown`
// directly via find->replace. Both paths record commits on the document spine.

/** True for documents whose redlines manipulate real Word OOXML. */
function isDocxMode(doc: Document): boolean {
  return doc.fileType === "docx" && !!doc.currentVersionId;
}

async function latestVersion(documentId: string) {
  const [v] = await db
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.documentId, documentId))
    .orderBy(desc(documentVersions.versionNumber))
    .limit(1);
  return v ?? null;
}

async function loadDocxBytes(storagePath: string): Promise<Buffer> {
  return Buffer.from(await getObject(storagePath));
}

// One find->replace substitution the model (or a user) proposes. Context anchors
// disambiguate the match for docx; ignored for plain-text documents.
export type EditSpec = {
  find: string;
  replace: string;
  contextBefore?: string;
  contextAfter?: string;
  reason?: string;
};

// Provenance stamped on the version a redline mutation produces.
type VersionSource = "assistant_edit" | "user_edit" | "user_accept" | "user_reject";

// All of a turn's proposed edits land in ONE new version + ONE commit (mike
// parity), with one document_edits row per change that actually anchored.
async function proposeDocxEdit(
  actor: Actor,
  doc: Document,
  edits: EditSpec[],
  source: VersionSource
): Promise<string[]> {
  const v = await latestVersion(doc.id);
  if (!v?.storagePath) throw new Error("Document has no stored version");
  const result = await applyTrackedEdits(
    await loadDocxBytes(v.storagePath),
    edits.map((e) => ({
      find: e.find,
      replace: e.replace,
      context_before: e.contextBefore ?? "",
      context_after: e.contextAfter ?? "",
      reason: e.reason,
    })),
    { author: actor.userId }
  );
  const applied = result.changes;
  if (!applied.length)
    throw new Error(result.errors[0]?.reason ?? "no edits could be applied to the document");

  const versionNumber = v.versionNumber + 1;
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: doc.userId,
    artifactId: doc.id,
    ext: "docx",
    version: versionNumber,
  });
  await putObject(storagePath, result.bytes, DOCX_MIME);
  const newMarkdown = await extractDocxBodyText(result.bytes);

  await recordCommit({
    artifactType: "document",
    artifactId: doc.id,
    actor,
    op: "propose_edit",
    message:
      applied.length === 1
        ? `Proposed edit: "${applied[0]!.deletedText.slice(0, 40)}" → "${applied[0]!.insertedText.slice(0, 40)}"`
        : `Proposed ${applied.length} edits`,
    apply: async ({ tx, commitId }) => {
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          documentId: doc.id,
          versionNumber,
          storagePath,
          source,
          fileType: "docx",
          sizeBytes: result.bytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await tx.insert(documentEdits).values(
        applied.map((a) => ({
          documentId: doc.id,
          versionId: nv!.id,
          changeId: a.id,
          delWId: a.delId ?? null,
          insWId: a.insId ?? null,
          deletedText: a.deletedText,
          insertedText: a.insertedText,
          contextBefore: a.contextBefore,
          contextAfter: a.contextAfter,
          reason: a.reason ?? null,
          status: "pending" as const,
          createdBy: actor.userId,
          lastCommitId: commitId,
        }))
      );
      await tx
        .update(documents)
        .set({ markdown: newMarkdown, currentVersionId: nv!.id })
        .where(eq(documents.id, doc.id));
      return {
        changes: [
          ...applied.map((a) => ({
            path: `edit/${a.id}`,
            before: null,
            after: {
              find: a.deletedText,
              replace: a.insertedText,
              reason: a.reason ?? null,
              status: "pending",
            },
          })),
          { path: "version", before: v.versionNumber, after: versionNumber },
        ],
      };
    },
  });
  return applied.map((a) => a.id);
}

// Accept or reject a batch of pending changes in ONE new version + ONE commit.
async function resolveDocxEdits(
  actor: Actor,
  doc: Document,
  edits: Array<typeof documentEdits.$inferSelect>,
  decision: "accept" | "reject"
) {
  const v = await latestVersion(doc.id);
  if (!v?.storagePath) throw new Error("Document has no stored version");
  const wIds = edits.flatMap((e) => [e.delWId, e.insWId]).filter((x): x is string => !!x);
  const { bytes: newBytes } = await resolveTrackedChange(
    await loadDocxBytes(v.storagePath),
    wIds,
    decision
  );
  const versionNumber = v.versionNumber + 1;
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: doc.userId,
    artifactId: doc.id,
    ext: "docx",
    version: versionNumber,
  });
  await putObject(storagePath, newBytes, DOCX_MIME);
  const newMarkdown = await extractDocxBodyText(newBytes);
  const status = decision === "accept" ? "accepted" : "rejected";
  const source: VersionSource = decision === "accept" ? "user_accept" : "user_reject";
  const editIds = edits.map((e) => e.id);

  return recordCommit({
    artifactType: "document",
    artifactId: doc.id,
    actor,
    op: "resolve_edit",
    message:
      edits.length === 1
        ? `${status} edit ${edits[0]!.changeId.slice(0, 8)}`
        : `${status} ${edits.length} edits`,
    apply: async ({ tx, commitId }) => {
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          documentId: doc.id,
          versionNumber,
          storagePath,
          source,
          fileType: "docx",
          sizeBytes: newBytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await tx
        .update(documentEdits)
        .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), lastCommitId: commitId })
        .where(inArray(documentEdits.id, editIds));
      await tx
        .update(documents)
        .set({ markdown: newMarkdown, currentVersionId: nv!.id })
        .where(eq(documents.id, doc.id));
      return {
        changes: [
          ...edits.map((e) => ({
            path: `edit/${e.changeId}/status`,
            before: "pending",
            after: status,
          })),
          { path: "version", before: v.versionNumber, after: versionNumber },
        ],
      };
    },
  });
}

/**
 * Propose one or more tracked changes (find -> replace). The whole batch lands
 * in ONE new version + ONE commit; the version's source reflects who proposed
 * (chat → assistant_edit, user → user_edit). Returns a changeId per applied edit.
 */
export async function proposeEdit(
  actor: Actor,
  documentId: string,
  edits: EditSpec[]
): Promise<string[]> {
  if (!edits.length) throw new Error("No edits to propose");
  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");
  const source: VersionSource = actor.type === "agent" ? "assistant_edit" : "user_edit";
  if (isDocxMode(doc)) return proposeDocxEdit(actor, doc, edits, source);
  if (doc.markdown === null) throw new Error("Document has no text to edit yet");
  for (const e of edits)
    if (!doc.markdown.includes(e.find))
      throw new Error(`\`find\` text not present in the document: "${e.find.slice(0, 40)}"`);

  const changeIds = edits.map(() => randomUUID());
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "propose_edit",
    message:
      edits.length === 1
        ? `Proposed edit: "${edits[0]!.find.slice(0, 40)}" → "${edits[0]!.replace.slice(0, 40)}"`
        : `Proposed ${edits.length} edits`,
    apply: async ({ tx, commitId }) => {
      await tx.insert(documentEdits).values(
        edits.map((e, i) => ({
          documentId,
          changeId: changeIds[i]!,
          deletedText: e.find,
          insertedText: e.replace,
          contextBefore: e.contextBefore ?? null,
          contextAfter: e.contextAfter ?? null,
          reason: e.reason ?? null,
          status: "pending" as const,
          createdBy: actor.userId,
          lastCommitId: commitId,
        }))
      );
      return {
        changes: edits.map((e, i) => ({
          path: `edit/${changeIds[i]}`,
          before: null,
          after: { find: e.find, replace: e.replace, reason: e.reason ?? null, status: "pending" },
        })),
      };
    },
  });
  return changeIds;
}

/**
 * Accept or reject one or more pending changes in ONE new version + ONE commit.
 * Non-pending change ids are ignored; throws if none remain to resolve.
 */
export async function resolveEdits(
  actor: Actor,
  documentId: string,
  changeIds: string[],
  decision: "accept" | "reject"
) {
  if (!changeIds.length) throw new Error("No edits to resolve");
  const edits = await db
    .select()
    .from(documentEdits)
    .where(
      and(eq(documentEdits.documentId, documentId), inArray(documentEdits.changeId, changeIds))
    );
  const pending = edits.filter((e) => e.status === "pending");
  if (!pending.length) throw new Error("No pending edits to resolve");

  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");

  if (isDocxMode(doc)) return resolveDocxEdits(actor, doc, pending, decision);

  const status = decision === "accept" ? "accepted" : "rejected";
  const editIds = pending.map((e) => e.id);
  return recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "resolve_edit",
    message:
      pending.length === 1
        ? `${status} edit ${pending[0]!.changeId.slice(0, 8)}`
        : `${status} ${pending.length} edits`,
    apply: async ({ tx, commitId }) => {
      await tx
        .update(documentEdits)
        .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), lastCommitId: commitId })
        .where(inArray(documentEdits.id, editIds));

      const changes: Array<{ path: string; before: unknown; after: unknown }> = pending.map(
        (e) => ({
          path: `edit/${e.changeId}/status`,
          before: "pending",
          after: status,
        })
      );

      if (decision === "accept" && doc.markdown !== null) {
        let md = doc.markdown;
        for (const e of pending)
          if (e.deletedText !== null) md = md.replace(e.deletedText, e.insertedText ?? "");
        if (md !== doc.markdown) {
          await tx.update(documents).set({ markdown: md }).where(eq(documents.id, documentId));
          changes.push({ path: "markdown", before: doc.markdown, after: md });
        }
      }
      return { changes };
    },
  });
}

/** Accept or reject a single tracked change (one version/commit). */
export async function resolveEdit(
  actor: Actor,
  documentId: string,
  changeId: string,
  decision: "accept" | "reject"
) {
  return resolveEdits(actor, documentId, [changeId], decision);
}

/** Accept or reject EVERY pending change on a document in one version/commit. */
export async function resolveAllEdits(
  actor: Actor,
  documentId: string,
  decision: "accept" | "reject"
) {
  const pending = await db
    .select({ changeId: documentEdits.changeId })
    .from(documentEdits)
    .where(and(eq(documentEdits.documentId, documentId), eq(documentEdits.status, "pending")));
  if (!pending.length) throw new Error("No pending edits to resolve");
  return resolveEdits(
    actor,
    documentId,
    pending.map((p) => p.changeId),
    decision
  );
}

/** Document with its tracked edits and per-edit blame (commit that last touched each). */
export async function getDocumentDetail(documentId: string) {
  const doc = await getDocument(documentId);
  if (!doc) return null;

  const edits = await db
    .select()
    .from(documentEdits)
    .where(eq(documentEdits.documentId, documentId))
    .orderBy(asc(documentEdits.createdAt));

  const commitIds = [...new Set(edits.map((e) => e.lastCommitId).filter((x): x is string => !!x))];
  const blameRows = commitIds.length
    ? await db.select().from(commits).where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));

  const [owner] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, doc.userId));

  return {
    document: { ...doc, ownerName: owner?.name ?? null, ownerEmail: owner?.email ?? null },
    edits: edits.map((e) => ({
      ...e,
      blame: e.lastCommitId ? (blameById.get(e.lastCommitId) ?? null) : null,
    })),
  };
}

// A tracked change touched by an assistant turn, flat enough to render as a chat
// card (find/replace preview + Accept/Reject/View). `documentId` lets the card
// call the resolve API; no blame here (chat cards stay compact).
export type ChatEdit = {
  documentId: string;
  changeId: string;
  deletedText: string | null;
  insertedText: string | null;
  reason: string | null;
  status: "pending" | "accepted" | "rejected";
};

/**
 * Hydrate the edits referenced by an assistant turn into chat-card rows, in the
 * order they were first proposed/resolved (deduped). Used to surface tracked
 * changes inline in the conversation.
 */
export async function getEditsByRef(
  refs: Array<{ documentId: string; changeId: string }>
): Promise<ChatEdit[]> {
  if (!refs.length) return [];
  const changeIds = [...new Set(refs.map((r) => r.changeId))];
  const rows = await db
    .select()
    .from(documentEdits)
    .where(inArray(documentEdits.changeId, changeIds));
  const byChange = new Map(rows.map((r) => [r.changeId, r]));
  const seen = new Set<string>();
  const out: ChatEdit[] = [];
  for (const r of refs) {
    if (seen.has(r.changeId)) continue;
    const row = byChange.get(r.changeId);
    if (!row) continue;
    seen.add(r.changeId);
    out.push({
      documentId: row.documentId,
      changeId: row.changeId,
      deletedText: row.deletedText,
      insertedText: row.insertedText,
      reason: row.reason,
      status: row.status,
    });
  }
  return out;
}
