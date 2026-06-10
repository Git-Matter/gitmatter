import { and, desc, eq, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { documents, type Document } from "@workspace/db/schema";
import { recordCommit } from "../core/commit.js";
import { extractMarkdown, type SupportedFileType } from "./extract.js";
import { getObject, putObject } from "../core/storage.js";

const MAX_ATTEMPTS = 3;

export function listDocuments(userId: string) {
  return db
    .select()
    .from(documents)
    .where(eq(documents.userId, userId))
    .orderBy(desc(documents.createdAt));
}

export async function createDocument(
  userId: string,
  input: { title: string; markdown: string; fileType?: string }
) {
  // Pasted text needs no extraction — born ready.
  const [doc] = await db
    .insert(documents)
    .values({
      userId,
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
 * Upload a PDF/DOCX: persist the raw bytes to object storage and insert a
 * `pending` row, then return immediately. Markdown extraction (DOCX via mammoth,
 * PDF via the markitdown sidecar) runs in the background worker, which records a
 * system-authored commit when it completes.
 */
export async function uploadDocument(
  userId: string,
  input: { title: string; fileType: SupportedFileType; bytes: Buffer }
) {
  const [row] = await db
    .insert(documents)
    .values({
      userId,
      title: input.title,
      fileType: input.fileType,
      sizeBytes: input.bytes.length,
      status: "pending",
    })
    .returning();
  const storagePath = `documents/${row!.id}.${input.fileType}`;
  await putObject(storagePath, input.bytes);
  const [updated] = await db
    .update(documents)
    .set({ storagePath })
    .where(eq(documents.id, row!.id))
    .returning();
  return updated;
}

export function deleteDocument(userId: string, id: string) {
  return db.delete(documents).where(and(eq(documents.id, id), eq(documents.userId, userId)));
}

/** Re-queue a failed document for another extraction attempt. */
export async function retryDocument(userId: string, id: string) {
  const [row] = await db
    .update(documents)
    .set({ status: "pending", extractionError: null, attempts: 0, claimedAt: null })
    .where(and(eq(documents.id, id), eq(documents.userId, userId), eq(documents.status, "failed")))
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
  if (!doc.storagePath) {
    await db
      .update(documents)
      .set({ status: "failed", extractionError: "no stored file to extract" })
      .where(eq(documents.id, doc.id));
    return;
  }
  try {
    const bytes = Buffer.from(await getObject(doc.storagePath));
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
