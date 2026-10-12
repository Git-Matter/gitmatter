import { db } from "@workspace/db/client";
import { documents, documentVersions, tabularReviews } from "@workspace/db/schema";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getReviewCompletion } from "../ai/tabular/contract-review.js";
import { canReadDocument } from "../core/access.js";
import type { Actor } from "../core/commit.js";

/** Capture readiness and immutable bytes reference under artifact locks. Storage I/O
 * happens after this transaction, so a slow download never holds the audit spine. */
export async function prepareReviewExport(actor: Actor, reviewId: string, documentId: string) {
  if (!(await canReadDocument(actor, documentId))) throw new Error("access_denied");
  const [review] = await db
    .select({ matterId: tabularReviews.matterId })
    .from(tabularReviews)
    .where(eq(tabularReviews.id, reviewId));
  if (!review) throw new Error("access_denied");
  return db.transaction(async (tx) => {
    const locks = [
      `document:${documentId}`,
      `tabular_review:${reviewId}`,
      `matter:${review.matterId}`,
    ].sort();
    for (const key of locks) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
    if (!(await canReadDocument(actor, documentId, tx))) throw new Error("access_denied");
    const completion = await getReviewCompletion(actor, reviewId, tx);
    const readiness = completion?.documents.find((item) => item.documentId === documentId);
    const [doc] = await tx
      .select()
      .from(documents)
      .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)));
    if (
      !doc ||
      doc.fileType !== "docx" ||
      !readiness?.cleanReady ||
      readiness.currentVersionId !== doc.currentVersionId ||
      readiness.currentHeadCommitId !== doc.headCommitId
    ) {
      throw new Error("input_not_ready");
    }
    const [version] = doc.currentVersionId
      ? await tx
          .select({ storagePath: documentVersions.storagePath })
          .from(documentVersions)
          .where(
            and(
              eq(documentVersions.id, doc.currentVersionId),
              eq(documentVersions.documentId, doc.id),
              isNull(documentVersions.deletedAt)
            )
          )
      : [];
    const storagePath = version?.storagePath;
    if (!storagePath) throw new Error("input_not_ready");
    const [capturedReview] = await tx
      .select({ headCommitId: tabularReviews.headCommitId })
      .from(tabularReviews)
      .where(eq(tabularReviews.id, reviewId));
    return {
      doc,
      storagePath,
      reviewId,
      versionId: doc.currentVersionId,
      documentCommitId: doc.headCommitId,
      reviewCommitId: capturedReview?.headCommitId ?? null,
    };
  });
}
