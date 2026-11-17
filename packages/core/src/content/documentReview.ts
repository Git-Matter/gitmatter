import { createHash, randomUUID } from "node:crypto";
import { and, asc, desc, eq, ne, sql } from "drizzle-orm";
import { db, type Tx } from "@workspace/db/client";
import {
  commits,
  documentEdits,
  documentReviews,
  documentVersions,
  documents,
  user,
} from "@workspace/db/schema";
import {
  documentReviewInputSchema,
  type DocumentReviewInput,
  type DocumentReviewState,
  type PractitionerReview,
} from "@workspace/contracts";
import {
  canAccessArtifact,
  canAccessDocumentInTransaction,
  canReadDocument,
} from "../core/access.js";
import { type Actor, recordCommit } from "../core/commit.js";
import { getObject } from "../core/storage.js";
import { generateDocx } from "./docx/generate.js";
import { inspectDocxRevisions } from "./docx/inspect.js";

export class DocumentReviewError extends Error {
  constructor(
    message: string,
    readonly status: 403 | 404 | 409
  ) {
    super(message);
  }
}

const REVIEW_OP = "practitioner_review";

type WordInspection = {
  versionId: string | null;
  digest: string | null;
  blockedReason: string | null;
} | null;

async function inspectStoredWord(documentId: string): Promise<WordInspection> {
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
  if (!doc || doc.fileType !== "docx") return null;
  const inspection: NonNullable<WordInspection> = {
    versionId: doc.currentVersionId,
    digest: null,
    blockedReason:
      "Word revision state could not be verified. Reload or ask your administrator to check document storage.",
  };
  if (!doc.currentVersionId || doc.status !== "ready") return inspection;
  const [version] = await db
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.id, doc.currentVersionId),
        eq(documentVersions.documentId, documentId)
      )
    );
  if (!version?.storagePath || version.deletedAt) return inspection;
  try {
    const bytes = await getObject(doc.tenantId, version.storagePath);
    const result = await inspectDocxRevisions(bytes, version.wordInspection);
    return {
      versionId: doc.currentVersionId,
      digest: createHash("sha256").update(bytes).digest("hex"),
      blockedReason: result.hasRevisions
        ? "This Word file contains unresolved revisions. Resolve them in Word and upload a clean version before recording practitioner review."
        : null,
    };
  } catch {
    return inspection;
  }
}

function reviewBlockedReason(
  doc: typeof documents.$inferSelect,
  edits: Array<{ status: string }>,
  inspection: WordInspection
): string | null {
  if (doc.status !== "ready") return "Wait until the document has finished processing.";
  if (!doc.markdown?.trim()) return "The document has no extracted text to review.";
  if (edits.some((edit) => edit.status === "pending"))
    return "Resolve pending tracked changes before recording practitioner review.";
  if (doc.fileType !== "docx") return null;
  if (!inspection || inspection.versionId !== doc.currentVersionId)
    return "The Word version changed while it was being checked. Reload the document.";
  return inspection.blockedReason;
}

// The content revision excludes review commits themselves, so recording review
// does not immediately invalidate it. Including the revision also prevents an
// edit followed by an exact reversal from reviving an old attestation.
async function snapshot(tx: Tx, documentId: string, inspection: WordInspection) {
  const [doc] = await tx.select().from(documents).where(eq(documents.id, documentId)).for("share");
  if (!doc || doc.deletedAt || doc.staged) throw new DocumentReviewError("Document not found", 404);
  const [revision] = await tx
    .select({ id: commits.id })
    .from(commits)
    .where(
      and(
        eq(commits.artifactType, "document"),
        eq(commits.artifactId, documentId),
        ne(commits.op, REVIEW_OP)
      )
    )
    .orderBy(desc(commits.seq))
    .limit(1);
  const edits = await tx
    .select({
      changeId: documentEdits.changeId,
      status: documentEdits.status,
      versionId: documentEdits.versionId,
      lastCommitId: documentEdits.lastCommitId,
    })
    .from(documentEdits)
    .where(eq(documentEdits.documentId, documentId))
    .orderBy(asc(documentEdits.changeId));
  const stateToken = `v1:${createHash("sha256")
    .update(
      JSON.stringify({
        documentId,
        versionId: doc.currentVersionId,
        markdown: doc.markdown,
        title: doc.title,
        jurisdiction: doc.jurisdiction,
        status: doc.status,
        revision: revision?.id ?? null,
        edits,
        wordDigest: inspection?.digest ?? null,
      })
    )
    .digest("hex")}`;
  return { doc, stateToken, blockedReason: reviewBlockedReason(doc, edits, inspection) };
}

async function lockDocument(tx: Tx, documentId: string) {
  // Same lock as recordCommit. Snapshot reads cannot observe half a mutation.
  await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`document:${documentId}`}))`);
}

export async function getDocumentReview(
  userId: string,
  documentId: string
): Promise<DocumentReviewState> {
  if (!(await canReadDocument(userId, documentId)))
    throw new DocumentReviewError("Document not found", 404);
  // Storage IO happens before locking. The locked snapshot verifies that the
  // immutable file version inspected is still the current one.
  const inspection = await inspectStoredWord(documentId);
  return db.transaction(async (tx) => {
    await lockDocument(tx, documentId);
    if (!(await canReadDocument(userId, documentId, tx)))
      throw new DocumentReviewError("Document not found", 404);
    const editable = await canAccessArtifact(userId, "document", documentId, "editor", tx);
    const { doc, stateToken, blockedReason } = await snapshot(tx, documentId, inspection);
    // Explicit tenant check supplements the artifact access path.
    const [account] = await tx
      .select({ tenantId: user.tenantId })
      .from(user)
      .where(eq(user.id, userId))
      .for("share");
    if (account?.tenantId !== doc.tenantId)
      throw new DocumentReviewError("Document not found", 404);
    const rows = await tx
      .select()
      .from(documentReviews)
      .where(
        and(eq(documentReviews.documentId, documentId), eq(documentReviews.tenantId, doc.tenantId))
      )
      .orderBy(desc(documentReviews.reviewedAt), desc(documentReviews.id));
    const history = rows.map((row) => ({
      id: row.id,
      reviewerName: row.reviewerName,
      reviewedAt: row.reviewedAt.toISOString(),
      scope: row.scope,
      documentVersionId: row.documentVersionId,
      stateToken: row.stateToken,
      commitId: row.commitId,
      current: row.stateToken === stateToken && !blockedReason,
    }));
    return {
      documentId,
      documentTitle: doc.title,
      documentVersionId: doc.currentVersionId,
      documentHeadCommitId: doc.headCommitId,
      stateToken,
      canReview: editable && !blockedReason,
      blockedReason:
        blockedReason ?? (!editable ? "Editor access is required to record a review." : null),
      currentReview: history.find((review) => review.current) ?? null,
      history,
    };
  });
}

export async function recordDocumentReview(
  actor: Actor,
  documentId: string,
  input: DocumentReviewInput
) {
  if (actor.type !== "user")
    throw new DocumentReviewError("Only a practitioner can record their own review", 403);
  const parsed = documentReviewInputSchema.parse(input);
  if (!(await canAccessArtifact(actor, "document", documentId, "editor")))
    throw new DocumentReviewError("Document not found", 404);
  const inspection = await inspectStoredWord(documentId);
  await recordCommit({
    artifactType: "document",
    artifactId: documentId,
    actor,
    op: REVIEW_OP,
    message: "Recorded practitioner review of the document state",
    skipIfNoChanges: true,
    apply: async ({ tx, commitId }) => {
      // recordCommit holds the artifact lock before this comparison and write.
      if (!(await canAccessDocumentInTransaction(tx, actor, documentId)))
        throw new DocumentReviewError("Document not found", 404);
      const { doc, stateToken, blockedReason } = await snapshot(tx, documentId, inspection);
      const [reviewer] = await tx.select().from(user).where(eq(user.id, actor.userId)).for("share");
      if (!reviewer || reviewer.tenantId !== doc.tenantId)
        throw new DocumentReviewError("Document not found", 404);
      if (blockedReason) throw new DocumentReviewError(blockedReason, 409);
      if (stateToken !== parsed.expectedStateToken)
        throw new DocumentReviewError(
          "The document has changed. Reload and review the current version.",
          409
        );
      const [existing] = await tx
        .select()
        .from(documentReviews)
        .where(
          and(
            eq(documentReviews.documentId, documentId),
            eq(documentReviews.reviewerId, actor.userId),
            eq(documentReviews.stateToken, stateToken),
            eq(documentReviews.scope, parsed.scope)
          )
        )
        .limit(1);
      if (existing) return { changes: [] };
      const review: PractitionerReview = {
        id: randomUUID(),
        reviewerName: reviewer.name,
        reviewedAt: new Date().toISOString(),
        scope: parsed.scope,
        documentVersionId: doc.currentVersionId,
        stateToken,
        commitId,
      };
      await tx.insert(documentReviews).values({
        ...review,
        documentId,
        tenantId: doc.tenantId,
        reviewerId: actor.userId,
        reviewedAt: new Date(review.reviewedAt),
      });
      return {
        changes: [{ path: `review/${review.id}`, before: null, after: review }],
        summary: { reviewId: review.id, documentVersionId: doc.currentVersionId },
      };
    },
  });
  return getDocumentReview(actor.userId, documentId);
}

export async function exportDocumentReview(userId: string, documentId: string) {
  const state = await getDocumentReview(userId, documentId);
  return generateDocx({
    title: `Practitioner review record — ${state.documentTitle}`,
    blocks: [
      {
        type: "paragraph",
        text: "This record states who recorded a review, its scope, and the exact document state. It does not certify legal correctness, court filing, or approval by another practitioner.",
      },
      {
        type: "paragraph",
        text: `Generated: ${new Date().toISOString()}. Current document state: ${state.stateToken}.`,
      },
      {
        type: "paragraph",
        text: state.currentReview
          ? "A practitioner review matches the document state at export."
          : "No practitioner review matches the document state at export.",
      },
      ...state.history.flatMap((review) => [
        {
          type: "heading" as const,
          text: `${review.current ? "Current" : "Historical — document state differs"} review`,
        },
        {
          type: "paragraph" as const,
          text: `Reviewer: ${review.reviewerName}. Recorded: ${review.reviewedAt}.`,
        },
        { type: "paragraph" as const, text: `Scope: ${review.scope}` },
        {
          type: "paragraph" as const,
          text: `Reviewed state: ${review.stateToken}. Version: ${review.documentVersionId ?? "Text document"}. Commit: ${review.commitId}.`,
        },
      ]),
    ],
  });
}
