import { randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { Tx } from "@workspace/db/client";
import {
  documentEditDecisions,
  documentEdits,
  documents,
  matters,
  matterDocuments,
  type Document,
  type DocumentEdit,
} from "@workspace/db/schema";
import type { DocumentApprovalContext, DocumentResolutionInput } from "@workspace/contracts";
import { hasMatterAccessInTransaction, canAccessArtifact } from "./access.js";
import type { Actor } from "./commit.js";
import { canonicalFingerprint } from "./fingerprint.js";
import { ApprovalError } from "./approval.js";

/** Capture every current/captured governed context, without leaking hidden matter names.
 * Document artifact advisory locks must be held by the caller. */
export async function captureDocumentApprovalContext(
  tx: Tx,
  actor: Actor,
  doc: Document,
  captured: DocumentApprovalContext = [],
  deciding = false
): Promise<DocumentApprovalContext> {
  if (!(await canAccessArtifact(actor, "document", doc.id, "editor", tx)))
    throw new ApprovalError("access_denied", "Document edit access required.");
  const links = await tx
    .select({ matterId: matterDocuments.matterId })
    .from(matterDocuments)
    .where(eq(matterDocuments.documentId, doc.id))
    .for("share");
  const ids = [
    ...new Set([
      ...links.map((l) => l.matterId),
      ...captured.map((c) => c.matterId),
      ...(doc.matterId ? [doc.matterId] : []),
    ]),
  ].sort();
  const contexts: DocumentApprovalContext = [];
  for (const id of ids) {
    const [matter] = await tx.select().from(matters).where(eq(matters.id, id)).for("share");
    const requiredRole =
      matter?.approvalPolicy.documentEdits === "owner" ||
      captured.some((c) => c.matterId === id && c.requiredRole === "owner")
        ? "owner"
        : "editor";
    if (
      !matter ||
      matter.tenantId !== doc.tenantId ||
      !(await hasMatterAccessInTransaction(tx, actor, id, deciding ? requiredRole : "editor"))
    )
      throw new ApprovalError("access_denied", "Additional document policy authority is required.");
    contexts.push({ matterId: id, policyRevision: matter.approvalPolicyRevision, requiredRole });
  }
  // One decision cannot stand in for decisions in distinct owner-governed matters.
  if (contexts.length > 1 && contexts.some((c) => c.requiredRole === "owner"))
    throw new ApprovalError(
      "access_denied",
      "This shared document needs an independent copy before review."
    );
  return contexts;
}

export async function guardDocumentResolution(
  tx: Tx,
  actor: Actor,
  expected: Document,
  edits: DocumentEdit[],
  input: DocumentResolutionInput = {}
) {
  if (actor.type !== "user")
    throw new ApprovalError("access_denied", "A person must decide document changes.");
  const [doc] = await tx
    .select()
    .from(documents)
    .where(eq(documents.id, expected.id))
    .for("update");
  if (
    !doc ||
    doc.deletedAt ||
    doc.currentVersionId !== expected.currentVersionId ||
    doc.headCommitId !== expected.headCommitId ||
    doc.markdown !== expected.markdown
  )
    throw new ApprovalError(
      "stale_proposal",
      "Document changed; review its current draft before deciding."
    );
  const live = await tx
    .select()
    .from(documentEdits)
    .where(
      and(
        eq(documentEdits.documentId, doc.id),
        inArray(
          documentEdits.id,
          edits.map((e) => e.id)
        )
      )
    )
    .for("update");
  if (
    live.length !== edits.length ||
    live.some(
      (e) =>
        e.status !== "pending" ||
        canonicalFingerprint(e) !== canonicalFingerprint(edits.find((old) => old.id === e.id))
    )
  )
    throw new ApprovalError("stale_proposal", "A tracked change was already decided or changed.");
  const captured = live.flatMap((e) => e.approvalContext ?? []);
  const policyContext = await captureDocumentApprovalContext(tx, actor, doc, captured, true);
  if (input.expectedHeadCommitId !== undefined && input.expectedHeadCommitId !== doc.headCommitId)
    throw new ApprovalError(
      "stale_proposal",
      "The displayed document changed; reload before deciding."
    );
  const policyDrift = captured.some(
    (c) =>
      !policyContext.some(
        (now) => now.matterId === c.matterId && now.policyRevision === c.policyRevision
      )
  );
  if (
    policyContext.some((c) => c.requiredRole === "owner") ||
    policyDrift ||
    input.approvalContext !== undefined
  ) {
    if (
      input.expectedHeadCommitId === undefined ||
      canonicalFingerprint(input.approvalContext ?? null) !== canonicalFingerprint(policyContext)
    )
      throw new ApprovalError(
        "policy_changed",
        "Review the current document and approval policy before deciding in the document workspace."
      );
  }
  return { doc, edits: live, policyContext };
}

export async function recordDocumentEditDecisions(
  tx: Tx,
  actor: Actor,
  input: {
    doc: Document;
    edits: DocumentEdit[];
    policyContext: DocumentApprovalContext;
    commitId: string;
    decision: "accept" | "reject";
  }
) {
  const evidence = input.edits.map((edit) => ({
    id: randomUUID(),
    editId: edit.id,
    documentId: input.doc.id,
    proposedVersionId: edit.versionId,
    reviewedVersionId: input.doc.currentVersionId,
    contentHash: canonicalFingerprint({
      changeId: edit.changeId,
      deletedText: edit.deletedText,
      insertedText: edit.insertedText,
      reason: edit.reason,
      findingProvenance: edit.findingProvenance,
    }),
    policyContext: input.policyContext,
    legacy: edit.approvalContext === null,
    actorId: actor.userId,
    decision: input.decision,
    applicationCommitId: input.commitId,
  }));
  await tx.insert(documentEditDecisions).values(evidence);
  return evidence.map((decision) => ({
    path: `approval/${decision.id}`,
    before: null,
    after: decision,
  }));
}

/** A clean output must be exactly the accepted baseline and contain no pending text. */
export async function assertApprovedDocumentBaseline(tx: Tx, doc: Document) {
  const [pending] = await tx
    .select({ id: documentEdits.id })
    .from(documentEdits)
    .where(and(eq(documentEdits.documentId, doc.id), eq(documentEdits.status, "pending")))
    .limit(1);
  if (
    pending ||
    (doc.currentVersionId
      ? doc.approvedVersionId !== doc.currentVersionId
      : doc.approvedMarkdown !== doc.markdown)
  )
    throw new ApprovalError(
      "stale_proposal",
      "Resolve the current document draft before requesting clean output."
    );
}

/** A first tracked draft pins its original source. Legacy drafts remain unbound until
 * their remaining changes have been explicitly resolved by a person. */
export async function pinDocumentBaseline(tx: Tx, doc: Document) {
  const [pending] = await tx
    .select({ id: documentEdits.id })
    .from(documentEdits)
    .where(and(eq(documentEdits.documentId, doc.id), eq(documentEdits.status, "pending")))
    .limit(1);
  if (pending) return [];
  await tx
    .update(documents)
    .set({ approvedVersionId: doc.currentVersionId, approvedMarkdown: doc.markdown })
    .where(eq(documents.id, doc.id));
  return [
    {
      path: "approvedBaseline",
      before: { versionId: doc.approvedVersionId, markdown: doc.approvedMarkdown },
      after: { versionId: doc.currentVersionId, markdown: doc.markdown },
    },
  ];
}
