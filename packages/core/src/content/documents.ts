import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  commits,
  documentEdits,
  documentVersions,
  documents,
  matters,
  type Document,
} from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";
import { extractMarkdown, type SupportedFileType } from "./extract.js";
import { generateDocx, type DocxSpec } from "./docx/generate.js";
import {
  applyTrackedEdits,
  extractDocxBodyText,
  resolveTrackedChange,
} from "./docx/trackedChanges.js";
import { buildStoragePath, getObject, putObject } from "../core/storage.js";

const MAX_ATTEMPTS = 3;

export const DOCX_MIME = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export type DocumentListSort = "title" | "fileType" | "status" | "createdAt";

export type DocumentListParams = {
  q?: string;
  status?: "pending" | "processing" | "ready" | "failed";
  page: number;
  pageSize: number;
  sort?: DocumentListSort;
  dir?: "asc" | "desc";
  matterId?: string;
  folderId?: string | null;
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
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

/** Documents in a matter, optionally scoped to a folder (null folderId = root). */
export function listMatterDocuments(matterId: string, folderId?: string | null) {
  const folderCond =
    folderId === undefined
      ? undefined
      : folderId === null
        ? isNull(documents.folderId)
        : eq(documents.folderId, folderId);
  return db
    .select(documentListFields)
    .from(documents)
    .where(
      folderCond
        ? and(eq(documents.matterId, matterId), folderCond)
        : eq(documents.matterId, matterId)
    )
    .orderBy(desc(documents.createdAt));
}

export async function listDocumentsPage(userId: string, params: DocumentListParams) {
  const q = params.q?.trim();
  const folderCond =
    params.folderId === undefined
      ? undefined
      : params.folderId === null
        ? isNull(documents.folderId)
        : eq(documents.folderId, params.folderId);
  const where = and(
    params.matterId ? eq(documents.matterId, params.matterId) : eq(documents.userId, userId),
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

  const [rows, countRows] = await Promise.all([
    db
      .select(documentListFields)
      .from(documents)
      .where(where)
      .orderBy(order)
      .limit(params.pageSize)
      .offset(offset),
    db.select({ count: count() }).from(documents).where(where),
  ]);

  return { rows, rowCount: Number(countRows[0]?.count ?? 0) };
}

export async function getDocument(id: string) {
  const [row] = await db.select().from(documents).where(eq(documents.id, id));
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
    matterId: input.matterId,
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
 * `pending` row, then return immediately. Markdown extraction (DOCX via mammoth,
 * PDF via the docling sidecar) runs in the background worker, which records a
 * system-authored commit when it completes.
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
    matterId: input.matterId,
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
  return row;
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
export function deleteDocument(id: string) {
  return db.delete(documents).where(eq(documents.id, id));
}

/** Re-queue a failed document for another extraction attempt. */
export async function retryDocument(id: string) {
  const [row] = await db
    .update(documents)
    .set({ status: "pending", extractionError: null, attempts: 0, claimedAt: null })
    .where(and(eq(documents.id, id), eq(documents.status, "failed")))
    .returning();
  return row ?? null;
}

/**
 * Atomically claim the next document needing extraction: a `pending` row, or a
 * `processing` row whose worker died (claimed > 5 min ago) and still has retries
 * left. `FOR UPDATE SKIP LOCKED` lets multiple workers/processes claim disjoint
 * rows without blocking. Bumps `attempts` on claim.
 */
export async function claimNextDocument(): Promise<Document | null> {
  const rows = (await db.execute(sql`
    update ${documents} set
      status = 'processing',
      claimed_at = now(),
      attempts = attempts + 1
    where id = (
      select id from ${documents}
      where (
        status = 'pending'
        or (status = 'processing' and claimed_at < now() - interval '5 minutes')
      ) and attempts < ${MAX_ATTEMPTS}
      order by created_at
      for update skip locked
      limit 1
    )
    returning *
  `)) as unknown as Document[];
  return rows[0] ?? null;
}

/**
 * Extract markdown for a claimed document and record the result as a
 * system-authored ("extractor" agent) commit on the document artifact. On
 * failure, re-queues until attempts are exhausted, then marks `failed`.
 */
export async function processDocument(doc: Document): Promise<void> {
  const storagePath = await activeStoragePath(doc);
  if (!storagePath) {
    await db
      .update(documents)
      .set({ status: "failed", extractionError: "no stored file to extract" })
      .where(eq(documents.id, doc.id));
    return;
  }
  try {
    const bytes = Buffer.from(await getObject(storagePath));
    const markdown = await extractMarkdown(bytes, doc.fileType as SupportedFileType);

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
          .set({ markdown, status: "ready", extractionError: null, claimedAt: null })
          .where(eq(documents.id, doc.id));
        return { changes: [{ path: "markdown", before: null, after: markdown }] };
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "extraction failed";
    // Re-queue while retries remain; otherwise mark failed for the UI.
    const exhausted = doc.attempts >= MAX_ATTEMPTS;
    await db
      .update(documents)
      .set({
        status: exhausted ? "failed" : "pending",
        extractionError: message,
        claimedAt: null,
      })
      .where(eq(documents.id, doc.id));
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

async function proposeDocxEdit(
  actor: Actor,
  doc: Document,
  input: { find: string; replace: string; reason?: string }
) {
  const v = await latestVersion(doc.id);
  if (!v?.storagePath) throw new Error("Document has no stored version");
  const result = await applyTrackedEdits(
    await loadDocxBytes(v.storagePath),
    [
      {
        find: input.find,
        replace: input.replace,
        context_before: "",
        context_after: "",
        reason: input.reason,
      },
    ],
    { author: actor.userId }
  );
  const applied = result.changes[0];
  if (!applied)
    throw new Error(result.errors[0]?.reason ?? "edit could not be applied to the document");

  const versionNumber = v.versionNumber + 1;
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: doc.userId,
    matterId: doc.matterId,
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
    message: `Proposed edit: "${input.find.slice(0, 40)}" → "${input.replace.slice(0, 40)}"`,
    apply: async ({ tx, commitId }) => {
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          documentId: doc.id,
          versionNumber,
          storagePath,
          source: "edit",
          fileType: "docx",
          sizeBytes: result.bytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await tx.insert(documentEdits).values({
        documentId: doc.id,
        versionId: nv!.id,
        changeId: applied.id,
        delWId: applied.delId ?? null,
        insWId: applied.insId ?? null,
        deletedText: applied.deletedText,
        insertedText: applied.insertedText,
        contextBefore: applied.contextBefore,
        contextAfter: applied.contextAfter,
        reason: input.reason ?? null,
        status: "pending",
        createdBy: actor.userId,
        lastCommitId: commitId,
      });
      await tx
        .update(documents)
        .set({ markdown: newMarkdown, currentVersionId: nv!.id })
        .where(eq(documents.id, doc.id));
      return {
        changes: [
          {
            path: `edit/${applied.id}`,
            before: null,
            after: {
              find: input.find,
              replace: input.replace,
              reason: input.reason ?? null,
              status: "pending",
            },
          },
          { path: "version", before: v.versionNumber, after: versionNumber },
        ],
      };
    },
  });
  return applied.id;
}

async function resolveDocxEdit(
  actor: Actor,
  doc: Document,
  edit: typeof documentEdits.$inferSelect,
  decision: "accept" | "reject"
) {
  const v = await latestVersion(doc.id);
  if (!v?.storagePath) throw new Error("Document has no stored version");
  const wIds = [edit.delWId, edit.insWId].filter((x): x is string => !!x);
  const { bytes: newBytes } = await resolveTrackedChange(
    await loadDocxBytes(v.storagePath),
    wIds,
    decision
  );
  const versionNumber = v.versionNumber + 1;
  const storagePath = buildStoragePath({
    tenantId: doc.tenantId,
    userId: doc.userId,
    matterId: doc.matterId,
    artifactId: doc.id,
    ext: "docx",
    version: versionNumber,
  });
  await putObject(storagePath, newBytes, DOCX_MIME);
  const newMarkdown = await extractDocxBodyText(newBytes);
  const status = decision === "accept" ? "accepted" : "rejected";

  return recordCommit({
    artifactType: "document",
    artifactId: doc.id,
    actor,
    op: "resolve_edit",
    message: `${status} edit ${edit.changeId.slice(0, 8)}`,
    apply: async ({ tx, commitId }) => {
      const [nv] = await tx
        .insert(documentVersions)
        .values({
          documentId: doc.id,
          versionNumber,
          storagePath,
          source: "edit",
          fileType: "docx",
          sizeBytes: newBytes.length,
          lastCommitId: commitId,
        })
        .returning();
      await tx
        .update(documentEdits)
        .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), lastCommitId: commitId })
        .where(eq(documentEdits.id, edit.id));
      await tx
        .update(documents)
        .set({ markdown: newMarkdown, currentVersionId: nv!.id })
        .where(eq(documents.id, doc.id));
      return {
        changes: [
          { path: `edit/${edit.changeId}/status`, before: "pending", after: status },
          { path: "markdown", before: doc.markdown, after: newMarkdown },
          { path: "version", before: v.versionNumber, after: versionNumber },
        ],
      };
    },
  });
}

/** Propose a tracked change (find -> replace). Stored as a pending edit. */
export async function proposeEdit(
  actor: Actor,
  documentId: string,
  input: { find: string; replace: string; reason?: string }
) {
  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");
  if (isDocxMode(doc)) return proposeDocxEdit(actor, doc, input);
  if (doc.markdown === null) throw new Error("Document has no text to edit yet");
  if (!doc.markdown.includes(input.find)) {
    throw new Error("`find` text not present in the document");
  }
  const changeId = randomUUID();
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "propose_edit",
    message: `Proposed edit: "${input.find.slice(0, 40)}" → "${input.replace.slice(0, 40)}"`,
    apply: async ({ tx, commitId }) => {
      await tx.insert(documentEdits).values({
        documentId,
        changeId,
        deletedText: input.find,
        insertedText: input.replace,
        reason: input.reason ?? null,
        status: "pending",
        createdBy: actor.userId,
        lastCommitId: commitId,
      });
      return {
        changes: [
          {
            path: `edit/${changeId}`,
            before: null,
            after: {
              find: input.find,
              replace: input.replace,
              reason: input.reason ?? null,
              status: "pending",
            },
          },
        ],
      };
    },
  });
  return changeId;
}

/** Accept (apply find->replace to markdown) or reject a tracked change. */
export async function resolveEdit(
  actor: Actor,
  documentId: string,
  changeId: string,
  decision: "accept" | "reject"
) {
  const [edit] = await db
    .select()
    .from(documentEdits)
    .where(and(eq(documentEdits.documentId, documentId), eq(documentEdits.changeId, changeId)));
  if (!edit) throw new Error("Edit not found");
  if (edit.status !== "pending") throw new Error("Edit already resolved");

  const doc = await getDocument(documentId);
  if (!doc) throw new Error("Document not found");

  if (isDocxMode(doc)) return resolveDocxEdit(actor, doc, edit, decision);

  const status = decision === "accept" ? "accepted" : "rejected";

  return recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: "resolve_edit",
    message: `${status} edit ${changeId.slice(0, 8)}`,
    apply: async ({ tx, commitId }) => {
      await tx
        .update(documentEdits)
        .set({ status, resolvedBy: actor.userId, resolvedAt: new Date(), lastCommitId: commitId })
        .where(eq(documentEdits.id, edit.id));

      const changes: Array<{ path: string; before: unknown; after: unknown }> = [
        { path: `edit/${changeId}/status`, before: "pending", after: status },
      ];

      if (decision === "accept" && edit.deletedText !== null && doc.markdown !== null) {
        const newMarkdown = doc.markdown.replace(edit.deletedText, edit.insertedText ?? "");
        await tx
          .update(documents)
          .set({ markdown: newMarkdown })
          .where(eq(documents.id, documentId));
        changes.push({ path: "markdown", before: doc.markdown, after: newMarkdown });
      }
      return { changes };
    },
  });
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

  return {
    document: doc,
    edits: edits.map((e) => ({
      ...e,
      blame: e.lastCommitId ? (blameById.get(e.lastCommitId) ?? null) : null,
    })),
  };
}
