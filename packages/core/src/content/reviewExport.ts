import { db, type Tx } from "@workspace/db/client";
import {
  approvalProposals,
  documents,
  documentVersions,
  matters,
  tabularReviews,
} from "@workspace/db/schema";
import type { ExportProposalPayload } from "@workspace/contracts";
import { z } from "zod";
import { and, eq, isNull, sql } from "drizzle-orm";
import { getReviewCompletion } from "../ai/tabular/contract-review.js";
import { canReadDocument, hasMatterAccessInTransaction } from "../core/access.js";
import { type Actor, recordCommitInTransaction } from "../core/commit.js";
import { ApprovalError, approvalHash, getProposal } from "../core/approval.js";
import { assertApprovedDocumentBaseline } from "../core/document-approval.js";

async function captureReviewExport(tx: Tx, actor: Actor, reviewId: string, documentId: string) {
  const [review] = await tx
    .select({ matterId: tabularReviews.matterId })
    .from(tabularReviews)
    .where(eq(tabularReviews.id, reviewId));
  if (!review) throw new ApprovalError("access_denied", "access_denied");
  const locks = [
    `document:${documentId}`,
    `tabular_review:${reviewId}`,
    `matter:${review.matterId}`,
  ].sort();
  for (const key of locks) await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${key}))`);
  if (
    !(await hasMatterAccessInTransaction(tx, actor, review.matterId, "viewer")) ||
    !(await canReadDocument(actor, documentId, tx))
  )
    throw new ApprovalError("access_denied", "access_denied");
  const completion = await getReviewCompletion(actor, reviewId, tx);
  const readiness = completion?.documents.find((item) => item.documentId === documentId);
  const [doc] = await tx
    .select()
    .from(documents)
    .where(and(eq(documents.id, documentId), isNull(documents.deletedAt)))
    .for("share");
  if (
    !doc ||
    doc.fileType !== "docx" ||
    !readiness?.cleanReady ||
    readiness.currentVersionId !== doc.currentVersionId ||
    readiness.currentHeadCommitId !== doc.headCommitId
  )
    throw new Error("input_not_ready");
  await assertApprovedDocumentBaseline(tx, doc);
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
        .for("share")
    : [];
  if (!version?.storagePath || !doc.currentVersionId) throw new Error("input_not_ready");
  const [capturedReview] = await tx
    .select({ headCommitId: tabularReviews.headCommitId })
    .from(tabularReviews)
    .where(eq(tabularReviews.id, reviewId));
  const [matter] = await tx
    .select()
    .from(matters)
    .where(eq(matters.id, review.matterId))
    .for("share");
  if (!matter) throw new ApprovalError("access_denied", "access_denied");
  // This supported output renders exactly one stored DOCX and makes no model call.
  // The cost ceiling covers incremental model-provider cost, not hosting/storage fees.
  const approvalRequired = matter.approvalPolicy.cleanExports?.approvalAboveDocuments === 0;
  return {
    doc,
    storagePath: version.storagePath,
    reviewId,
    versionId: doc.currentVersionId,
    documentCommitId: doc.headCommitId,
    reviewCommitId: capturedReview?.headCommitId ?? null,
    matter,
    approvalRequired,
  };
}
function exportManifest(snapshot: Awaited<ReturnType<typeof captureReviewExport>>) {
  return {
    reviewId: snapshot.reviewId,
    documentId: snapshot.doc.id,
    versionId: snapshot.versionId,
    documentCommitId: snapshot.documentCommitId,
    reviewCommitId: snapshot.reviewCommitId,
    output: "clean" as const,
    documentCount: 1 as const,
    providerCostMicros: 0 as const,
  };
}

/** Capture readiness and immutable bytes under artifact locks, and require an exact
 * current authorization when policy gates this output. Storage I/O happens later. */
export async function prepareReviewExport(
  actor: Actor,
  reviewId: string,
  documentId: string,
  input: { proposalId?: string } = {}
) {
  return db.transaction(async (tx) => {
    const snapshot = await captureReviewExport(tx, actor, reviewId, documentId);
    if (input.proposalId || snapshot.approvalRequired) {
      if (!input.proposalId)
        throw new ApprovalError(
          "approval_required",
          "Request human approval for this exact clean export."
        );
      const proposal = await getProposal(actor, input.proposalId, tx);
      if (
        proposal.kind !== "export" ||
        proposal.proposerId !== actor.userId ||
        proposal.matterId !== snapshot.matter.id ||
        proposal.status !== "applied" ||
        proposal.policyChanged ||
        proposal.stale ||
        approvalHash(proposal.payload) !== proposal.contentHash ||
        approvalHash(exportManifest(snapshot)) !==
          approvalHash({ ...proposal.payload, requestFingerprint: undefined })
      )
        throw new ApprovalError(
          "stale_proposal",
          "Export approval no longer matches the current output; request it again."
        );
    }
    const { matter: _matter, approvalRequired: _approvalRequired, ...result } = snapshot;
    return result;
  });
}

/** Idempotent receipt for one exact clean-DOCX request. Approval never runs a model
 * or replaces source bytes, and cannot be reused for a different manifest. */
export async function requestCleanReviewExport(
  actor: Actor,
  input: { requestId: string; reviewId: string; documentId: string }
) {
  z.object({ requestId: z.uuid(), reviewId: z.uuid(), documentId: z.uuid() }).strict().parse(input);
  const requestFingerprint = approvalHash({
    actor,
    reviewId: input.reviewId,
    documentId: input.documentId,
    output: "clean",
  });
  return db.transaction(async (tx) => {
    await tx.execute(
      sql`select pg_advisory_xact_lock(hashtext(${`export-request:${actor.userId}:${input.requestId}`}))`
    );
    const [prior] = await tx
      .select()
      .from(approvalProposals)
      .where(eq(approvalProposals.id, input.requestId));
    if (prior) {
      if (
        prior.kind !== "export" ||
        prior.proposerId !== actor.userId ||
        (prior.payload as ExportProposalPayload).requestFingerprint !== requestFingerprint
      )
        throw new ApprovalError(
          "request_conflict",
          "Request id was used for different export inputs."
        );
      const proposal = await getProposal(actor, prior.id, tx);
      return { approvalRequired: true, proposal, replayed: true };
    }
    const snapshot = await captureReviewExport(tx, actor, input.reviewId, input.documentId);
    if (!snapshot.approvalRequired)
      return { approvalRequired: false, proposal: null, replayed: false };
    const payload: ExportProposalPayload = { requestFingerprint, ...exportManifest(snapshot) };
    await recordCommitInTransaction(tx, {
      artifactType: "matter",
      artifactId: snapshot.matter.id,
      actor,
      op: "request_export",
      message: "Requested approval for exact clean DOCX export",
      apply: async ({ commitId }) => {
        await tx.insert(approvalProposals).values({
          id: input.requestId,
          matterId: snapshot.matter.id,
          kind: "export",
          artifactId: input.documentId,
          proposalCommitId: commitId,
          contentHash: approvalHash(payload),
          policyRevision: snapshot.matter.approvalPolicyRevision,
          requiredRole: snapshot.matter.approvalPolicy.cleanExports!.requiredRole,
          proposerId: actor.userId,
          agentLabel: actor.type === "agent" ? actor.agentLabel : null,
          payload,
          lastCommitId: commitId,
        });
        return {
          changes: [
            {
              path: `proposal/${input.requestId}`,
              before: null,
              after: {
                kind: "export",
                status: "pending",
                payload,
                policyRevision: snapshot.matter.approvalPolicyRevision,
              },
            },
          ],
          summary: {
            outcome: "proposed",
            proposalId: input.requestId,
            manifest: exportManifest(snapshot),
          },
        };
      },
    });
    return {
      approvalRequired: true,
      proposal: await getProposal(actor, input.requestId, tx),
      replayed: false,
    };
  });
}
