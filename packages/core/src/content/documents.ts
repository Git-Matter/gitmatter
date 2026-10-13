import {
  canAccessArtifact,
  hasMatterAccess,
  hasMatterAccessInTransaction,
  sameTenant,
  type AccessReader,
} from "../core/access.js";
import {
  captureDocumentApprovalContext,
  guardDocumentResolution,
  pinDocumentBaseline,
  recordDocumentEditDecisions,
} from "../core/document-approval.js";
import { validateFindingProposal } from "../ai/tabular/finding.js";
import {
  wordInspectionSchema,
  type DocumentResolutionInput,
  type FindingEditProvenance,
  type DocumentWordInspection,
} from "@workspace/contracts";
import { recordFunnel } from "../core/funnel.js";
import { randomUUID } from "node:crypto";
import {
  and,
  asc,
  count,
  desc,
  eq,
  getTableColumns,
  ilike,
  inArray,
  isNull,
  or,
  sql,
} from "drizzle-orm";
import { db } from "@workspace/db/client";
import { acceptExtractionJob } from "../core/jobs.js";
import { putStagedObject, attachStagedObject } from "../core/staged-objects.js";
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
import { recordAudit } from "../platform/audit.js";
import { assertStorageWithinQuota } from "../platform/usage.js";
import { accessCountSql, accessSummaryByArtifact, sharedArtifactIds } from "../platform/shares.js";
import { type Actor, recordCommit, recordCommitInTransaction } from "../core/commit.js";
import { logEvent } from "../core/log.js";
import { extractMarkdown, type SupportedFileType } from "./extract.js";
import { generateDocx, type DocxSpec } from "./docx/generate.js";
import {
  applyTrackedEdits,
  extractDocxBodyText,
  extractTrackedChangeIds,
  resolveTrackedChange,
  type EditError,
} from "./docx/trackedChanges.js";
import { buildStoragePath, deleteObject, getObject, isAlreadyDeleted } from "../core/storage.js";
import {
  inspectDocx,
  inspectVersionWordBytes,
  WordInspectionMismatchError,
  assertWordInspectionSafe,
  wordInspectionSafety,
} from "./docx/inspection.js";

/**
 * Delete a stored object, tolerating "already gone" (idempotent purge) but
 * recording any genuine failure to the audit log instead of silently dropping it.
 */
async function deleteObjectAudited(tenantId: string, storagePath: string): Promise<void> {
  try {
    await deleteObject(tenantId, storagePath);
  } catch (err) {
    if (isAlreadyDeleted(err)) return;
    void recordAudit({
      eventType: "storage.delete_failed",
      target: storagePath,
      metadata: { error: err instanceof Error ? err.message : String(err) },
    });
  }
}

/** List filter: exclude staged (uncommitted chat) uploads from every library view. */
function notStaged() {
  return eq(documents.staged, false);
}

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DocumentListSort =
  | "title"
  | "fileType"
  | "status"
  | "createdAt"
  | "matter"
  | "version"
  | "shared";

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
  matterId: documents.matterId,
  title: documents.title,
  fileType: documents.fileType,
  status: documents.status,
  extractionError: documents.extractionError,
  ocrSuggested: documents.ocrSuggested,
  sizeBytes: documents.sizeBytes,
  folderId: documents.folderId,
  currentVersionId: documents.currentVersionId,
  approvedVersionId: documents.approvedVersionId,
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
    .where(and(eq(documents.userId, userId), isNull(documents.deletedAt), notStaged()))
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
    .where(
      and(
        eq(matterDocuments.matterId, matterId),
        folderCond,
        isNull(documents.deletedAt),
        notStaged()
      )
    )
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
    notStaged(),
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
    matter: matters.name,
    version: documentVersions.versionNumber,
    shared: accessCountSql({
      artifactType: "document",
      ownerId: documents.userId,
      matterId: documents.matterId,
      artifactId: documents.id,
    }),
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

  // Attach "people with access": owner + matter members + direct shares.
  const access = await accessSummaryByArtifact(
    "document",
    rows.map((r) => ({ id: r.id, matterId: r.matterId, ownerId: r.ownerId }))
  );
  const withShares = rows.map(({ ownerId, ...r }) => {
    const a = access.get(r.id);
    return {
      ...r,
      isOwner: ownerId === userId,
      shareCount: a?.count ?? 1,
      sharedNames: a?.names ?? [],
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
  // Publish text, matter link and the first audit head atomically.
  const docId = randomUUID();
  await recordCommit({
    artifactType: "document",
    artifactId: docId,
    actor: { type: "user", userId },
    op: "create",
    message: `Created ${input.title}`,
    apply: async ({ tx }) => {
      const actor: Actor = { type: "user", userId };
      if (!(await hasMatterAccessInTransaction(tx, actor, input.matterId, "editor")))
        throw new Error("access_denied");
      const [matter] = await tx
        .select({ tenantId: matters.tenantId })
        .from(matters)
        .where(eq(matters.id, input.matterId));
      if (!matter) throw new Error("access_denied");
      await tx.insert(documents).values({
        id: docId,
        userId,
        tenantId: matter.tenantId,
        matterId: input.matterId,
        folderId: input.folderId ?? null,
        title: input.title,
        fileType: input.fileType ?? "text/markdown",
        markdown: input.markdown,
        approvedMarkdown: input.markdown,
        sizeBytes: input.markdown.length,
        status: "ready",
      });
      await tx
        .insert(matterDocuments)
        .values({ matterId: input.matterId, documentId: docId, folderId: input.folderId ?? null });
      return {
        changes: [
          { path: "markdown", before: null, after: input.markdown },
          { path: "matterId", before: null, after: input.matterId },
          {
            path: "approvedBaseline",
            before: null,
            after: { versionId: null, markdown: input.markdown },
          },
        ],
      };
    },
  });
  return (await getDocument(docId))!;
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
  if (!(await hasMatterAccess(actor, input.matterId, "editor"))) throw new Error("access_denied");
  const bytes = Buffer.from(await generateDocx(input.spec));
  const wordInspection = await inspectDocx(bytes);
  const { markdown, pageCount } = await extractMarkdown(bytes, "docx");
  const tenantId = await matterTenant(input.matterId);
  const docId = randomUUID(),
    versionId = randomUUID();
  const storagePath = buildStoragePath({
    tenantId,
    userId: actor.userId,
    artifactId: docId,
    ext: "docx",
  });
  await putStagedObject(tenantId, storagePath, bytes, DOCX_MIME);
  await recordCommit({
    artifactType: "document",
    artifactId: docId,
    actor,
    op: "create",
    message: `Generated ${input.spec.title}`,
    apply: async ({ tx, commitId }) => {
      if (!(await hasMatterAccessInTransaction(tx, actor, input.matterId, "editor")))
        throw new Error("access_denied");
      const [matter] = await tx
        .select({ tenantId: matters.tenantId })
        .from(matters)
        .where(eq(matters.id, input.matterId));
      if (matter?.tenantId !== tenantId) throw new Error("access_denied");
      await tx.insert(documents).values({
        id: docId,
        userId: actor.userId,
        tenantId,
        matterId: input.matterId,
        title: input.spec.title,
        fileType: "docx",
        sizeBytes: bytes.length,
        status: "ready",
        currentVersionId: versionId,
        approvedVersionId: versionId,
        approvedMarkdown: markdown,
        markdown,
        pageCount,
      });
      await tx.insert(documentVersions).values({
        id: versionId,
        documentId: docId,
        versionNumber: 1,
        storagePath,
        source: "generated",
        sizeBytes: bytes.length,
        fileType: "docx",
        wordInspection,
        lastCommitId: commitId,
      });
      await attachStagedObject(tx, tenantId, storagePath);
      await tx.insert(matterDocuments).values({ matterId: input.matterId, documentId: docId });
      return {
        changes: [
          { path: "file", before: null, after: storagePath },
          { path: "markdown", before: null, after: markdown },
          { path: "matterId", before: null, after: input.matterId },
          { path: "approvedBaseline", before: null, after: { versionId, markdown } },
        ],
      };
    },
  });
  return (await getDocument(docId))!;
}

/**
 * Upload a PDF/DOCX: persist the raw bytes to object storage and insert a
 * `pending` row, then return immediately. The caller kicks extraction via the
 * per-user queue (`enqueueExtraction`); markdown extraction (DOCX via mammoth,
 * PDF via pdf.js) records a system-authored commit when it completes.
 */
export async function uploadDocument(
  userId: string,
  input: {
    title: string;
    fileType: SupportedFileType;
    bytes: Buffer;
    // Null = unfiled: a library document that belongs to no matter. The tenant
    // can't be derived from a matter then, so the caller must pass tenantId.
    matterId: string | null;
    tenantId?: string;
    folderId?: string | null;
    // Chat-composer upload: insert hidden from the library until the user commits
    // it (sends the message) or discards it (removes the chip). See commitStagedDocuments
    // / discardStagedDocument. Defaults to a normal, immediately-visible upload.
    staged?: boolean;
  }
) {
  recordFunnel("upload_started", { actorType: "user", matterId: input.matterId ?? undefined });
  try {
    // Store the file BEFORE the row is visible to the extraction worker.
    // Inserting as `pending` first lets a worker claim it in the gap before the
    // object exists, which fails the doc with "no stored file to extract". So we
    // pre-generate the id, write the object, then insert the row already complete.
    const tenantId = input.matterId ? await matterTenant(input.matterId) : input.tenantId;
    if (!tenantId) throw new Error("uploadDocument: tenantId is required when matterId is null");
    const actor: Actor = { type: "user", userId };
    if (
      !(await sameTenant(userId, tenantId)) ||
      (input.matterId && !(await hasMatterAccess(actor, input.matterId, "editor")))
    )
      throw new Error("access_denied");
    // Folders live inside a matter; an unfiled document can't sit in one.
    const folderId = input.matterId ? (input.folderId ?? null) : null;
    await assertStorageWithinQuota(tenantId, input.bytes.length);
    const wordInspection = input.fileType === "docx" ? await inspectDocx(input.bytes) : null;
    const id = randomUUID();
    const versionId = randomUUID();
    const storagePath = buildStoragePath({
      tenantId,
      userId,
      artifactId: id,
      ext: input.fileType,
    });
    await putStagedObject(tenantId, storagePath, input.bytes);
    const row = await db.transaction(async (tx) => {
      // Storage may have taken seconds or minutes. Hold the current account and
      // matter authority stable through all publication rows and their audit head.
      const [account] = await tx
        .select({ tenantId: user.tenantId })
        .from(user)
        .where(eq(user.id, userId))
        .for("share");
      if (
        account?.tenantId !== tenantId ||
        (input.matterId &&
          !(await hasMatterAccessInTransaction(tx, actor, input.matterId, "editor")))
      )
        throw new Error("access_denied");
      const [created] = await tx
        .insert(documents)
        .values({
          id,
          userId,
          tenantId,
          matterId: input.matterId,
          folderId,
          title: input.title,
          fileType: input.fileType,
          sizeBytes: input.bytes.length,
          currentVersionId: versionId,
          approvedVersionId: versionId,
          status: "pending",
          staged: input.staged ?? false,
        })
        .returning();
      await recordCommitInTransaction(tx, {
        artifactType: "document",
        artifactId: id,
        actor,
        op: "upload",
        message: `Uploaded ${input.title}`,
        apply: async ({ tx: commitTx, commitId }) => {
          await commitTx.insert(documentVersions).values({
            id: versionId,
            documentId: id,
            versionNumber: 1,
            storagePath,
            source: "upload",
            sizeBytes: input.bytes.length,
            fileType: input.fileType,
            wordInspection,
            lastCommitId: commitId,
          });
          await attachStagedObject(commitTx, tenantId, storagePath);
          if (input.matterId)
            await commitTx.insert(matterDocuments).values({
              matterId: input.matterId,
              documentId: id,
              folderId,
            });
          await acceptExtractionJob(commitTx, {
            actor,
            tenantId,
            matterId: input.matterId,
            documentId: id,
            versionId,
          });
          return {
            changes: [
              { path: "version", before: null, after: 1 },
              { path: "matterId", before: null, after: input.matterId },
              { path: "status", before: null, after: "pending" },
              { path: "approvedBaseline", before: null, after: { versionId, markdown: null } },
            ],
          };
        },
      });
      return created!;
    });
    return row;
  } catch (error) {
    recordFunnel("upload_failed", {
      actorType: "user",
      matterId: input.matterId ?? undefined,
      outcome: "failed",
      failureCategory: "storage",
    });
    throw error;
  }
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
  const actor: Actor = { type: "user", userId };
  if (!(await hasMatterAccess(actor, matterId, "editor"))) throw new Error("access_denied");
  let inserted = 0;
  for (const documentId of [...new Set(documentIds)].sort()) {
    const result = await recordCommit({
      artifactType: "document",
      artifactId: documentId,
      actor,
      op: "link_matter",
      message: "Linked document to matter",
      skipIfNoChanges: true,
      apply: async ({ tx }) => {
        if (!(await hasMatterAccessInTransaction(tx, actor, matterId, "editor")))
          throw new Error("access_denied");
        const [doc] = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, documentId))
          .for("update");
        const [matter] = await tx
          .select()
          .from(matters)
          .where(eq(matters.id, matterId))
          .for("share");
        if (!doc || doc.deletedAt || doc.userId !== userId || doc.tenantId !== matter?.tenantId)
          throw new Error("access_denied");
        const [existing] = await tx
          .select()
          .from(matterDocuments)
          .where(
            and(eq(matterDocuments.documentId, documentId), eq(matterDocuments.matterId, matterId))
          );
        if (existing) return { changes: [] };
        await tx.insert(matterDocuments).values({ documentId, matterId, folderId: null });
        await captureDocumentApprovalContext(tx, actor, doc);
        return { changes: [{ path: `matterLink/${matterId}`, before: null, after: { matterId } }] };
      },
    });
    if (result.commit) inserted++;
  }
  return inserted;
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
// How long a staged chat upload may sit uncommitted before the orphan sweep
// reclaims it (user closed the tab without sending or removing it).
const STAGED_ABANDON_HOURS = 24;

/** Free a document's S3 bytes (every version) then hard-delete the row (cascades). */
async function hardDelete(id: string): Promise<void> {
  const [doc] = await db
    .select({ tenantId: documents.tenantId })
    .from(documents)
    .where(eq(documents.id, id));
  if (!doc) return;
  const versions = await db
    .select({ storagePath: documentVersions.storagePath })
    .from(documentVersions)
    .where(eq(documentVersions.documentId, id));
  for (const v of versions) {
    if (v.storagePath) await deleteObjectAudited(doc.tenantId, v.storagePath);
  }
  await db.delete(documents).where(eq(documents.id, id));
}

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
  for (const { id } of expired) await hardDelete(id);
  return expired.length;
}

/**
 * Commit staged chat uploads into the library (flip off the staged flag). Called
 * when the user sends a chat turn carrying these attachments. Scoped to the user's
 * own staged rows, so it can't touch another user's or an already-committed doc.
 */
export async function commitStagedDocuments(userId: string, ids: string[]): Promise<void> {
  if (!ids.length) return;
  await db
    .update(documents)
    .set({ staged: false })
    .where(
      and(inArray(documents.id, ids), eq(documents.userId, userId), eq(documents.staged, true))
    );
}

/**
 * Discard a staged chat upload: free its S3 bytes and hard-delete the row. Guarded
 * to staged rows only, so it can never hard-delete a committed library document
 * (those take the soft-delete path). No-op when the id isn't a staged doc. Records
 * an audit entry for attribution (staged rows aren't on the commit spine yet).
 */
export async function discardStagedDocument(actor: Actor, id: string): Promise<void> {
  const [doc] = await db
    .select({ id: documents.id, title: documents.title })
    .from(documents)
    .where(and(eq(documents.id, id), eq(documents.staged, true)));
  if (!doc) return;
  await hardDelete(id);
  void recordAudit({
    eventType: "document.discard_staged",
    actorId: actor.userId,
    target: id,
    metadata: { title: doc.title },
  });
}

/**
 * Backstop for staged uploads the user neither sent nor removed (e.g. closed the
 * tab): hard-delete staged rows older than the abandon window, freeing S3 bytes.
 * Idempotent; safe to call opportunistically.
 */
export async function purgeAbandonedStaged(): Promise<number> {
  const abandoned = await db
    .select({ id: documents.id })
    .from(documents)
    .where(
      and(
        eq(documents.staged, true),
        sql`${documents.createdAt} < now() - interval '${sql.raw(String(STAGED_ABANDON_HOURS))} hours'`
      )
    );
  for (const { id } of abandoned) await hardDelete(id);
  return abandoned.length;
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
  await assertStorageWithinQuota(doc.tenantId, input.bytes.length);
  const wordInspection = input.fileType === "docx" ? await inspectDocx(input.bytes) : null;
  const latest = await latestVersion(documentId);
  const versionNumber = (latest?.versionNumber ?? 0) + 1;
  const versionId = randomUUID();
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: actor.userId,
    artifactId: versionId,
    ext: input.fileType,
  });
  await putStagedObject(doc.tenantId, storagePath, input.bytes);
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "replace",
    message: latest
      ? `Replaced active file with version ${versionNumber} (superseded version ${latest.versionNumber})`
      : `Uploaded version ${versionNumber}`,
    apply: async ({ tx, commitId }) => {
      const [current] = await tx.select().from(documents).where(eq(documents.id, documentId));
      if (
        current?.headCommitId !== doc.headCommitId ||
        current?.currentVersionId !== doc.currentVersionId
      )
        throw new Error("stale_source");
      if (actor.type !== "user")
        throw new Error("A person must replace the accepted document source.");
      await captureDocumentApprovalContext(tx, actor, current, [], true);
      const [pending] = await tx
        .select({ id: documentEdits.id })
        .from(documentEdits)
        .where(and(eq(documentEdits.documentId, documentId), eq(documentEdits.status, "pending")))
        .limit(1);
      if (pending) throw new Error("Resolve pending document changes before replacing the source.");
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          id: versionId,
          documentId,
          versionNumber,
          storagePath,
          source: "replace",
          fileType: input.fileType,
          wordInspection,
          sizeBytes: input.bytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await attachStagedObject(tx, doc.tenantId, storagePath);
      await tx
        .update(documents)
        .set({
          fileType: input.fileType,
          sizeBytes: input.bytes.length,
          currentVersionId: nv!.id,
          approvedVersionId: nv!.id,
          approvedMarkdown: null,
          markdown: null,
          pageCount: null,
          status: "pending",
          extractionError: null,
          attempts: 0,
          claimedAt: null,
        })
        .where(eq(documents.id, documentId));
      await acceptExtractionJob(tx, {
        actor,
        tenantId: doc.tenantId,
        matterId: doc.matterId,
        documentId,
        versionId,
      });
      return {
        changes: [
          { path: "version", before: latest?.versionNumber ?? null, after: versionNumber },
          { path: "markdown", before: current.markdown, after: null },
          {
            path: "approvedBaseline",
            before: { versionId: current.approvedVersionId, markdown: current.approvedMarkdown },
            after: { versionId: nv!.id, markdown: null },
          },
        ],
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
  if (doc.approvedVersionId === versionId)
    throw new Error("Cannot delete the accepted document baseline");
  const [v] = await db
    .select()
    .from(documentVersions)
    .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)));
  if (!v) throw new Error("Version not found");
  if (v.deletedAt) throw new Error("Version already deleted");
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "delete_version",
    message: `Deleted version ${v.versionNumber}`,
    apply: async ({ tx, commitId }) => {
      const [current] = await tx
        .select()
        .from(documents)
        .where(eq(documents.id, documentId))
        .for("update");
      if (
        !current ||
        current.currentVersionId === versionId ||
        current.approvedVersionId === versionId ||
        !(await canAccessArtifact(actor, "document", documentId, "editor", tx))
      )
        throw new Error("Cannot delete an active or accepted document baseline");
      const [liveVersion] = await tx
        .select()
        .from(documentVersions)
        .where(and(eq(documentVersions.id, versionId), eq(documentVersions.documentId, documentId)))
        .for("update");
      if (!liveVersion || liveVersion.deletedAt || liveVersion.storagePath !== v.storagePath)
        throw new Error("stale_source");
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
  if (v.storagePath) await deleteObjectAudited(doc.tenantId, v.storagePath);
}

/**
 * Re-queue a document for extraction: a `failed` one, or a `processing` one
 * whose run was lost (claimed > 5 min ago, e.g. a server restart). Returns the
 * reset row so the caller can re-enqueue it; null if the doc isn't retryable.
 */
export async function retryDocument(id: string, actor?: Actor) {
  const { JobError, listDocumentJobs, retryJob, authorizeJobInTransaction } =
    await import("../core/jobs.js");
  if (!actor) throw new Error("access_denied");
  if (!(await canAccessArtifact(actor, "document", id, "editor")))
    throw new JobError("access_denied");
  const currentJobs = await listDocumentJobs(actor, id);
  const latest = currentJobs[0];
  if (!latest) {
    // A deploy can inherit a failed/pending source from the old volatile queue.
    // Only an explicit current human request establishes new durable authority.
    if (actor.type !== "user") throw new JobError("access_denied");
    const doc = await getDocument(id);
    if (!doc || !doc.currentVersionId || doc.status === "ready") return null;
    if (doc.status === "processing") {
      const [age] = await db
        .select({ stale: sql<boolean>`${documents.claimedAt} < now() - interval '5 minutes'` })
        .from(documents)
        .where(eq(documents.id, id));
      if (!age?.stale) return null;
    }
    const [version] = await db
      .select()
      .from(documentVersions)
      .where(
        and(eq(documentVersions.id, doc.currentVersionId), eq(documentVersions.documentId, id))
      );
    if (!version?.storagePath || version.deletedAt) throw new JobError("input_not_ready");
    try {
      await getObject(doc.tenantId, version.storagePath);
    } catch {
      throw new JobError("input_not_ready");
    }
    await recordCommit({
      actor,
      artifactType: "document",
      artifactId: id,
      op: "extraction_retried",
      message: "Accepted legacy source extraction for durable retry",
      apply: async ({ tx }) => {
        const [current] = await tx.select().from(documents).where(eq(documents.id, id));
        if (
          !current ||
          current.deletedAt ||
          current.currentVersionId !== doc.currentVersionId ||
          current.headCommitId !== doc.headCommitId
        )
          throw new JobError("stale_source");
        if (!(await canAccessArtifact(actor, "document", id, "editor", tx)))
          throw new JobError("access_denied");
        if (current.status === "ready") throw new JobError("input_not_ready");
        if (current.status === "processing") {
          const [age] = await tx
            .select({ stale: sql<boolean>`${documents.claimedAt} < now() - interval '5 minutes'` })
            .from(documents)
            .where(eq(documents.id, id));
          if (!age?.stale) throw new JobError("input_not_ready");
        }
        const [currentVersion] = await tx
          .select()
          .from(documentVersions)
          .where(eq(documentVersions.id, version.id))
          .for("share");
        if (
          !currentVersion?.storagePath ||
          currentVersion.deletedAt ||
          currentVersion.storagePath !== version.storagePath
        )
          throw new JobError("input_not_ready");
        const job = await acceptExtractionJob(tx, {
          actor,
          tenantId: doc.tenantId,
          matterId: doc.matterId,
          documentId: id,
          versionId: doc.currentVersionId!,
          requestId: `legacy-extract:${id}:${doc.currentVersionId}`,
        });
        await authorizeJobInTransaction(tx, job);
        await tx
          .update(documents)
          .set({ status: "pending", extractionError: null, claimedAt: null })
          .where(eq(documents.id, id));
        return {
          changes: [{ path: "status", before: current.status, after: "pending" }],
          summary: { jobId: job.id, compatibility: "explicit_human_retry" },
        };
      },
    });
    return getDocument(id);
  }
  if (latest.state !== "failed") return null;
  await retryJob(actor, latest.id);
  return getDocument(id);
}

/** Synchronous acceptance-test adapter over the same durable extraction worker. */
export async function processDocument(doc: Document): Promise<void> {
  const { runExtractionOnce } = await import("./extractionQueue.js");
  await runExtractionOnce(doc.id);
}

/** Read a stored export only after caller access checks; preview is not a funnel conversion. */
export async function downloadDocumentBytes(
  doc: Document,
  storagePath: string,
  actor: Actor,
  preview = false,
  clean = false
) {
  const started = performance.now();
  const funnel = { actorType: actor.type, documentId: doc.id, matterId: doc.matterId ?? undefined };
  try {
    const bytes = await getObject(doc.tenantId, storagePath);
    if (clean) {
      if (doc.fileType !== "docx") throw new Error("Clean Word output requires a DOCX source.");
      const [version] = await db
        .select()
        .from(documentVersions)
        .where(
          and(
            eq(documentVersions.documentId, doc.id),
            eq(documentVersions.storagePath, storagePath),
            isNull(documentVersions.deletedAt)
          )
        );
      if (!version) throw new Error("Clean Word source version is unavailable.");
      assertWordInspectionSafe(
        await inspectVersionWordBytes(Buffer.from(bytes), version.wordInspection),
        [],
        true
      );
    }
    if (!preview)
      recordFunnel("document_exported", {
        ...funnel,
        durationMs: performance.now() - started,
        outcome: "succeeded",
      });
    return bytes;
  } catch (error) {
    if (!preview)
      recordFunnel("document_export_failed", {
        ...funnel,
        durationMs: performance.now() - started,
        outcome: "failed",
        failureCategory: "storage",
      });
    throw error;
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

async function loadDocxBytes(
  tenantId: string,
  storagePath: string,
  reader: AccessReader = db
): Promise<Buffer> {
  return Buffer.from(await getObject(tenantId, storagePath, reader));
}

async function isRegisteredWordSource(
  version: typeof documentVersions.$inferSelect,
  reader: AccessReader = db
): Promise<boolean> {
  if (
    !version.lastCommitId ||
    !["assistant_edit", "user_edit", "user_accept", "user_reject"].includes(version.source)
  )
    return false;
  const [receipt] = await reader
    .select({ op: commits.op })
    .from(commits)
    .where(
      and(
        eq(commits.id, version.lastCommitId),
        eq(commits.artifactType, "document"),
        eq(commits.artifactId, version.documentId)
      )
    );
  return (
    receipt?.op ===
    (version.source === "user_accept" || version.source === "user_reject"
      ? "resolve_edit"
      : "propose_edit")
  );
}

/** A readonly inspection of one exact version. Legacy metadata is obtained from
 * storage on demand, never backfilled by an unaudited GET. Access is the caller's
 * responsibility, as with the internal document row readers. */
export async function getDocumentWordInspection(
  doc: Document,
  versionId = doc.currentVersionId,
  pendingEdits?: Array<typeof documentEdits.$inferSelect>,
  reader: AccessReader = db,
  verifyBytes = false
): Promise<DocumentWordInspection | null> {
  if (doc.fileType !== "docx" || !versionId) return null;
  const [version] = await reader
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.id, versionId),
        eq(documentVersions.documentId, doc.id),
        isNull(documentVersions.deletedAt)
      )
    );
  const parsed = wordInspectionSchema.safeParse(version?.wordInspection);
  let inspection = parsed.success ? parsed.data : null;
  if (!inspection || verifyBytes) {
    try {
      if (!version?.storagePath) throw new Error("missing_source");
      inspection = await inspectVersionWordBytes(
        await loadDocxBytes(doc.tenantId, version.storagePath, reader),
        version.wordInspection
      );
    } catch (error) {
      inspection = await inspectDocx(Buffer.alloc(0));
      inspection.reasons = [
        error instanceof WordInspectionMismatchError
          ? "inspection_mismatch"
          : "storage_unavailable",
      ];
    }
  }
  const edits =
    pendingEdits ??
    (await reader
      .select()
      .from(documentEdits)
      .where(and(eq(documentEdits.documentId, doc.id), eq(documentEdits.status, "pending"))));
  const safety = wordInspectionSafety(inspection, edits);
  if (edits.length && (!version || !(await isRegisteredWordSource(version, reader))))
    safety.safeToEdit = false;
  const { bodyBindings: _bindings, ...metadata } = inspection;
  return { versionId, inspection: metadata, ...safety };
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

export type ProposeEditResult = {
  changeIds: string[];
  requested: number;
  applied: number;
  failed: number;
  errors: EditError[];
};

// Provenance stamped on the version a redline mutation produces.
type VersionSource = "assistant_edit" | "user_edit" | "user_accept" | "user_reject";

class RedlineApplyError extends Error {
  constructor(
    message: string,
    readonly errors: EditError[]
  ) {
    super(message);
  }
}

function actorSource(actor: Actor) {
  return actor.type === "agent" ? actor.agentLabel : actor.type;
}

function safeEditErrors(errors: EditError[]): EditError[] {
  return errors.map((error) => ({
    index: error.index,
    reason: error.reason.replace(/find="[^"]*"/g, "find text"),
  }));
}

// All of a turn's proposed edits land in ONE new version + ONE commit, with one
// document_edits row per change that actually anchored.
async function proposeDocxEdit(
  actor: Actor,
  doc: Document,
  edits: EditSpec[],
  source: VersionSource,
  options: { expectedHeadCommitId?: string | null; provenance?: FindingEditProvenance } = {}
): Promise<ProposeEditResult> {
  const v = await latestVersion(doc.id);
  if (!v?.storagePath) throw new Error("Document has no stored version");
  if (v.id !== doc.currentVersionId) throw new Error("stale_source");
  const pending = await db
    .select()
    .from(documentEdits)
    .where(and(eq(documentEdits.documentId, doc.id), eq(documentEdits.status, "pending")));
  if (pending.length && !(await isRegisteredWordSource(v)))
    throw new Error("Word revision provenance is not bound to this source version.");
  const sourceBytes = await loadDocxBytes(doc.tenantId, v.storagePath);
  assertWordInspectionSafe(await inspectVersionWordBytes(sourceBytes, v.wordInspection), pending);
  const result = await applyTrackedEdits(
    sourceBytes,
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
  const errors = safeEditErrors(result.errors);
  if (!applied.length)
    throw new RedlineApplyError(
      errors[0]?.reason ?? "no edits could be applied to the document",
      errors
    );
  const wordInspection = await inspectDocx(result.bytes);
  // The matcher must never silently collapse another pending insertion when a
  // subsequent proposal overlaps it. Every existing binding must survive.
  assertWordInspectionSafe(wordInspection, [
    ...pending,
    ...applied.map((edit) => ({
      delWId: edit.delId ?? null,
      insWId: edit.insId ?? null,
      deletedText: edit.deletedText,
      insertedText: edit.insertedText,
    })),
  ]);

  const versionNumber = v.versionNumber + 1;
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: doc.userId,
    artifactId: `${doc.id}/staged-${randomUUID()}`,
    ext: "docx",
    version: versionNumber,
  });
  await putStagedObject(doc.tenantId, storagePath, result.bytes, DOCX_MIME);
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
      if (!(await canAccessArtifact(actor, "document", doc.id, "editor", tx)))
        throw new Error("access_denied");
      const [current] = await tx.select().from(documents).where(eq(documents.id, doc.id));
      if (
        !current ||
        current.deletedAt ||
        current.headCommitId !==
          (options.expectedHeadCommitId === undefined
            ? doc.headCommitId
            : options.expectedHeadCommitId)
      )
        throw new Error("stale_source");
      if (options.provenance) await validateFindingProposal(tx, actor, options.provenance);
      const approvalContext = await captureDocumentApprovalContext(tx, actor, current);
      const baselineChanges = await pinDocumentBaseline(tx, current);
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          documentId: doc.id,
          versionNumber,
          storagePath,
          source,
          fileType: "docx",
          wordInspection,
          sizeBytes: result.bytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await attachStagedObject(tx, doc.tenantId, storagePath);
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
          findingProvenance: options.provenance ?? null,
          approvalContext,
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
          ...baselineChanges,
          ...applied.map((a) => ({
            path: `edit/${a.id}`,
            before: null,
            after: {
              find: a.deletedText,
              replace: a.insertedText,
              reason: a.reason ?? null,
              status: "pending",
              ...(options.provenance ? { findingProvenance: options.provenance } : {}),
            },
          })),
          { path: "version", before: v.versionNumber, after: versionNumber },
        ],
      };
    },
  });
  return {
    changeIds: applied.map((a) => a.id),
    requested: edits.length,
    applied: applied.length,
    failed: errors.length,
    errors,
  };
}

// Accept or reject a batch of pending changes in ONE new version + ONE commit.
async function resolveDocxEdits(
  actor: Actor,
  doc: Document,
  edits: Array<typeof documentEdits.$inferSelect>,
  decision: "accept" | "reject",
  input: DocumentResolutionInput = {}
) {
  const v = await latestVersion(doc.id);
  if (!v?.storagePath) throw new Error("Document has no stored version");
  if (v.id !== doc.currentVersionId) throw new Error("stale_source");
  const wIds = edits.flatMap((e) => [e.delWId, e.insWId]).filter((x): x is string => !!x);
  const sourceBytes = await loadDocxBytes(doc.tenantId, v.storagePath);
  const pending = await db
    .select()
    .from(documentEdits)
    .where(and(eq(documentEdits.documentId, doc.id), eq(documentEdits.status, "pending")));
  if (!(await isRegisteredWordSource(v)))
    throw new Error("Word revision provenance is not bound to this source version.");
  assertWordInspectionSafe(await inspectVersionWordBytes(sourceBytes, v.wordInspection), pending);
  const knownChanges = new Set(
    (await extractTrackedChangeIds(sourceBytes)).map((change) => change.w_id)
  );
  if (!wIds.length || wIds.some((id) => !knownChanges.has(id)))
    throw new Error(
      "Tracked change binding is missing from the current DOCX; review a revised proposal."
    );
  const { bytes: newBytes } = await resolveTrackedChange(sourceBytes, wIds, decision);
  const wordInspection = await inspectDocx(newBytes);
  assertWordInspectionSafe(
    wordInspection,
    pending.filter((edit) => !edits.some((resolved) => resolved.id === edit.id))
  );
  const versionNumber = v.versionNumber + 1;
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: doc.userId,
    artifactId: `${doc.id}/staged-${randomUUID()}`,
    ext: "docx",
    version: versionNumber,
  });
  await putStagedObject(doc.tenantId, storagePath, newBytes, DOCX_MIME);
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
      const context = await guardDocumentResolution(tx, actor, doc, edits, input);
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          documentId: doc.id,
          versionNumber,
          storagePath,
          source,
          fileType: "docx",
          wordInspection,
          sizeBytes: newBytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await attachStagedObject(tx, doc.tenantId, storagePath);
      await tx
        .update(documentEdits)
        .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), lastCommitId: commitId })
        .where(inArray(documentEdits.id, editIds));
      await tx
        .update(documents)
        .set({ markdown: newMarkdown, currentVersionId: nv!.id })
        .where(eq(documents.id, doc.id));
      const baselineChanges = await pinDocumentBaseline(tx, {
        ...doc,
        markdown: newMarkdown,
        currentVersionId: nv!.id,
      });
      const decisionChanges = await recordDocumentEditDecisions(tx, actor, {
        ...context,
        commitId,
        decision,
      });
      return {
        changes: [
          ...baselineChanges,
          ...decisionChanges,
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
export async function proposeEditDetail(
  actor: Actor,
  documentId: string,
  edits: EditSpec[],
  options: { expectedHeadCommitId?: string | null; provenance?: FindingEditProvenance } = {}
): Promise<ProposeEditResult> {
  if (!edits.length) throw new Error("No edits to propose");
  if (!(await canAccessArtifact(actor, "document", documentId, "editor")))
    throw new Error("access_denied");
  const started = performance.now();
  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");
  if (
    options.expectedHeadCommitId !== undefined &&
    doc.headCommitId !== options.expectedHeadCommitId
  )
    throw new Error("stale_source");
  if (options.provenance && !isDocxMode(doc))
    throw new Error("Finding redlines require editable DOCX");
  const source: VersionSource = actor.type === "agent" ? "assistant_edit" : "user_edit";
  const mode = isDocxMode(doc) ? "docx" : "markdown";
  const base = {
    documentId,
    actor: actorSource(actor),
    userId: actor.userId,
    fileType: doc.fileType,
    mode,
    requested: edits.length,
  };
  logEvent("info", "redline.propose.start", base);
  try {
    if (isDocxMode(doc)) {
      const result = await proposeDocxEdit(actor, doc, edits, source, options);
      if (result.failed > 0)
        logEvent("warn", "redline.propose.partial", {
          ...base,
          applied: result.applied,
          failed: result.failed,
          errors: result.errors,
        });
      logEvent("info", "redline.propose.finish", {
        ...base,
        applied: result.applied,
        failed: result.failed,
        ms: Math.round(performance.now() - started),
      });
      recordFunnel("redline_proposed", {
        actorType: actor.type,
        documentId,
        matterId: doc.matterId ?? undefined,
        durationMs: performance.now() - started,
        failedCount: result.failed,
        outcome: result.failed ? "partial" : "succeeded",
      });
      return result;
    }
    if (doc.markdown === null) throw new Error("Document has no text to edit yet");
    for (const e of edits)
      if (!doc.markdown.includes(e.find))
        throw new Error("`find` text not present in the document");

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
        const [current] = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, documentId))
          .for("update");
        if (
          !current ||
          current.headCommitId !== doc.headCommitId ||
          current.markdown !== doc.markdown
        )
          throw new Error("stale_source");
        const approvalContext = await captureDocumentApprovalContext(tx, actor, current);
        const baselineChanges = await pinDocumentBaseline(tx, current);
        await tx.insert(documentEdits).values(
          edits.map((e, i) => ({
            documentId,
            changeId: changeIds[i]!,
            deletedText: e.find,
            insertedText: e.replace,
            contextBefore: e.contextBefore ?? null,
            contextAfter: e.contextAfter ?? null,
            reason: e.reason ?? null,
            approvalContext,
            status: "pending" as const,
            createdBy: actor.userId,
            lastCommitId: commitId,
          }))
        );
        return {
          changes: [
            ...baselineChanges,
            ...edits.map((e, i) => ({
              path: `edit/${changeIds[i]}`,
              before: null,
              after: {
                find: e.find,
                replace: e.replace,
                reason: e.reason ?? null,
                status: "pending",
              },
            })),
          ],
        };
      },
    });
    const result = {
      changeIds,
      requested: edits.length,
      applied: edits.length,
      failed: 0,
      errors: [],
    };
    logEvent("info", "redline.propose.finish", {
      ...base,
      applied: result.applied,
      failed: result.failed,
      ms: Math.round(performance.now() - started),
    });
    recordFunnel("redline_proposed", {
      actorType: actor.type,
      documentId,
      matterId: doc.matterId ?? undefined,
      durationMs: performance.now() - started,
      outcome: "succeeded",
    });
    return result;
  } catch (e) {
    recordFunnel("redline_failed", {
      actorType: actor.type,
      documentId,
      durationMs: performance.now() - started,
      outcome: "failed",
      failureCategory: "validation",
    });
    logEvent("warn", "redline.propose.failed", {
      ...base,
      applied: e instanceof RedlineApplyError ? 0 : undefined,
      failed: e instanceof RedlineApplyError ? e.errors.length : undefined,
      errors: e instanceof RedlineApplyError ? e.errors : undefined,
      error: e instanceof Error ? e.message : "failed",
      ms: Math.round(performance.now() - started),
    });
    throw e;
  }
}

export async function proposeEdit(
  actor: Actor,
  documentId: string,
  edits: EditSpec[]
): Promise<string[]> {
  return (await proposeEditDetail(actor, documentId, edits)).changeIds;
}

/**
 * Accept or reject one or more pending changes in ONE new version + ONE commit.
 * Every requested change must still be pending; a mixed or stale batch applies none.
 */
export async function resolveEdits(
  actor: Actor,
  documentId: string,
  changeIds: string[],
  decision: "accept" | "reject",
  input: DocumentResolutionInput = {}
) {
  if (actor.type !== "user") {
    throw new Error("A person must accept or reject document changes in the document review UI.");
  }
  if (!changeIds.length) throw new Error("No edits to resolve");
  if (new Set(changeIds).size !== changeIds.length)
    throw new Error("Choose distinct pending document changes.");
  if (!(await canAccessArtifact(actor, "document", documentId, "editor")))
    throw new Error("access_denied");
  const started = performance.now();
  const base = {
    documentId,
    actor: actorSource(actor),
    userId: actor.userId,
    requested: changeIds.length,
    decision,
  };
  logEvent("info", "redline.resolve.start", base);
  try {
    const edits = await db
      .select()
      .from(documentEdits)
      .where(
        and(eq(documentEdits.documentId, documentId), inArray(documentEdits.changeId, changeIds))
      );
    const pending = edits.filter((e) => e.status === "pending");
    if (pending.length !== changeIds.length)
      throw new Error(
        "Every requested document change must still be pending; reload before deciding."
      );

    const doc = await getDocument(documentId);
    if (!doc) throw new Error("Document not found");

    const result = isDocxMode(doc)
      ? await resolveDocxEdits(actor, doc, pending, decision, input)
      : await (async () => {
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
              const context = await guardDocumentResolution(tx, actor, doc, pending, input);
              await tx
                .update(documentEdits)
                .set({
                  status,
                  resolvedBy: actor.userId,
                  resolvedAt: new Date(),
                  lastCommitId: commitId,
                })
                .where(inArray(documentEdits.id, editIds));

              const changes: Array<{ path: string; before: unknown; after: unknown }> = pending.map(
                (e) => ({
                  path: `edit/${e.changeId}/status`,
                  before: "pending",
                  after: status,
                })
              );

              let resolvedMarkdown = doc.markdown;
              if (decision === "accept" && doc.markdown !== null) {
                let md = doc.markdown;
                for (const e of pending)
                  if (e.deletedText !== null) md = md.replace(e.deletedText, e.insertedText ?? "");
                if (md !== doc.markdown) {
                  resolvedMarkdown = md;
                  await tx
                    .update(documents)
                    .set({ markdown: md })
                    .where(eq(documents.id, documentId));
                  changes.push({ path: "markdown", before: doc.markdown, after: md });
                }
              }
              changes.push(
                ...(await pinDocumentBaseline(tx, { ...doc, markdown: resolvedMarkdown }))
              );
              changes.push(
                ...(await recordDocumentEditDecisions(tx, actor, {
                  ...context,
                  commitId,
                  decision,
                }))
              );
              return { changes };
            },
          });
        })();
    logEvent("info", "redline.resolve.finish", {
      ...base,
      mode: isDocxMode(doc) ? "docx" : "markdown",
      matched: edits.length,
      resolved: pending.length,
      committed: result.commit?.seq ?? null,
      ms: Math.round(performance.now() - started),
    });
    recordFunnel("redline_resolved", {
      actorType: actor.type,
      documentId,
      matterId: doc.matterId ?? undefined,
      durationMs: performance.now() - started,
      decision,
      outcome: "succeeded",
    });
    return result;
  } catch (e) {
    recordFunnel("redline_failed", {
      actorType: actor.type,
      documentId,
      durationMs: performance.now() - started,
      outcome: "failed",
      failureCategory: "validation",
    });
    logEvent("warn", "redline.resolve.failed", {
      ...base,
      error: e instanceof Error ? e.message : "failed",
      ms: Math.round(performance.now() - started),
    });
    throw e;
  }
}

/** Accept or reject a single tracked change (one version/commit). */
export async function resolveEdit(
  actor: Actor,
  documentId: string,
  changeId: string,
  decision: "accept" | "reject",
  input: DocumentResolutionInput = {}
) {
  return resolveEdits(actor, documentId, [changeId], decision, input);
}

/** Accept or reject EVERY pending change on a document in one version/commit. */
export async function resolveAllEdits(
  actor: Actor,
  documentId: string,
  decision: "accept" | "reject",
  input: DocumentResolutionInput = {}
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
    decision,
    input
  );
}

/** Document with its tracked edits and per-edit blame (commit that last touched each). */
export async function getDocumentDetail(documentId: string, actor?: Actor) {
  if (actor && !(await canAccessArtifact(actor, "document", documentId)))
    throw new Error("access_denied");
  const doc = await getDocument(documentId);
  if (!doc) return null;

  const edits = await db
    .select()
    .from(documentEdits)
    .where(eq(documentEdits.documentId, documentId))
    .orderBy(asc(documentEdits.createdAt));

  const commitIds = [...new Set(edits.map((e) => e.lastCommitId).filter((x): x is string => !!x))];
  const blameRows = commitIds.length
    ? await db
        .select({ ...getTableColumns(commits), actorName: user.name, actorEmail: user.email })
        .from(commits)
        .leftJoin(user, eq(user.id, commits.actorId))
        .where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));

  const [owner] = await db
    .select({ name: user.name, email: user.email })
    .from(user)
    .where(eq(user.id, doc.userId));
  let resolutionPolicy: {
    approvalContext: DocumentResolutionInput["approvalContext"] | null;
    mayResolve: boolean;
    mayPropose: boolean;
    requiredRole: "editor" | "owner" | null;
    blockedReason: string | null;
  } = {
    approvalContext: null,
    mayResolve: false,
    mayPropose: false,
    requiredRole: null,
    blockedReason: "Current document decision access is required.",
  };
  if (actor) {
    resolutionPolicy = await db.transaction(async (tx) => {
      try {
        const captured = edits
          .filter((e) => e.status === "pending")
          .flatMap((e) => e.approvalContext ?? []);
        const approvalContext = await captureDocumentApprovalContext(tx, actor, doc, captured);
        const requiredRole = approvalContext.some((c) => c.requiredRole === "owner")
          ? ("owner" as const)
          : ("editor" as const);
        let mayResolve = actor.type === "user";
        if (mayResolve) {
          try {
            await captureDocumentApprovalContext(tx, actor, doc, captured, true);
          } catch {
            mayResolve = false;
          }
        }
        return {
          approvalContext,
          mayResolve,
          mayPropose: true,
          requiredRole,
          blockedReason: mayResolve
            ? null
            : `A current human matter ${requiredRole} must decide these changes.`,
        };
      } catch {
        return resolutionPolicy;
      }
    });
  }

  const wordInspection = await getDocumentWordInspection(
    doc,
    doc.currentVersionId,
    edits.filter((edit) => edit.status === "pending")
  );
  if (wordInspection && !wordInspection.safeToEdit) {
    resolutionPolicy = {
      ...resolutionPolicy,
      mayPropose: false,
      mayResolve: false,
      blockedReason:
        "Incoming or unsupported Word revisions must be resolved in Word and uploaded as a new source before edits can be proposed or decided here.",
    };
  }

  return {
    document: { ...doc, ownerName: owner?.name ?? null, ownerEmail: owner?.email ?? null },
    edits: edits.map((e) => ({
      ...e,
      // Captured cross-matter context is server evidence; never expose hidden
      // matter identifiers through a document readable in another context.
      approvalContext: undefined,
      blame: e.lastCommitId ? (blameById.get(e.lastCommitId) ?? null) : null,
    })),
    resolutionPolicy,
    wordInspection,
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
