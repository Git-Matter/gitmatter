import { normalizeEvidenceText } from "./finding.js";
import { guardFindingDisposition } from "../../core/approval.js";
import { canReadApprovedLibrary } from "../../core/library-access.js";
import { createHash } from "node:crypto";
import type { CellProposalPayload, FindingEditProvenance } from "@workspace/contracts";
import { and, eq, gt, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  approvalProposals,
  commits,
  clauses,
  fieldChanges,
  documents,
  documentEdits,
  documentVersions,
  tabularCells,
  tabularReviews,
  matters,
} from "@workspace/db/schema";
import { z } from "zod";
import { canAccessArtifact, hasMatterAccess, type AccessReader } from "../../core/access.js";
import { type Actor, recordCommit } from "../../core/commit.js";
import { proposeEditDetail } from "../../content/documents.js";

export const findingDispositionSchema = z.object({
  documentId: z.uuid(),
  columnIndex: z.number().int().nonnegative(),
  revisionId: z.uuid(),
  status: z.enum(["left_unchanged", "escalated"]),
  rationale: z.string().trim().min(1).max(4000),
  policyRevision: z.number().int().nonnegative().optional(),
});
export const findingRedlineSchema = z.object({
  requestId: z.uuid(),
  documentId: z.uuid(),
  columnIndex: z.number().int().nonnegative(),
  revisionId: z.uuid(),
  expectedHeadCommitId: z.uuid().nullable(),
  clauseId: z.uuid(),
  find: z.string().max(20000),
  contextBefore: z.string().max(2000).optional(),
  contextAfter: z.string().max(2000).optional(),
});

export async function setFindingDisposition(
  actor: Actor,
  reviewId: string,
  input: z.infer<typeof findingDispositionSchema>
) {
  const params = findingDispositionSchema.parse(input);
  if (
    actor.type !== "user" ||
    !(await canAccessArtifact(actor, "tabular_review", reviewId, "editor"))
  )
    throw new Error("access_denied");
  return recordCommit({
    artifactType: "tabular_review",
    artifactId: reviewId,
    actor,
    op: "finding_disposition",
    message:
      params.status === "escalated"
        ? "Escalated review finding"
        : "Recorded decision to leave language unchanged",
    apply: async ({ tx, commitId }) => {
      const [cell] = await tx
        .select()
        .from(tabularCells)
        .where(
          and(
            eq(tabularCells.reviewId, reviewId),
            eq(tabularCells.documentId, params.documentId),
            eq(tabularCells.columnIndex, params.columnIndex)
          )
        );
      if (!cell?.finding || cell.finding.revisionId !== params.revisionId)
        throw new Error("stale_proposal");
      const decisionPolicy = await guardFindingDisposition(tx, actor, { reviewId, ...params });
      const disposition = {
        ...decisionPolicy,
        revisionId: params.revisionId,
        status: params.status,
        rationale: params.rationale,
        actorId: actor.userId,
        commitId,
      };
      await tx.update(tabularCells).set({ disposition }).where(eq(tabularCells.id, cell.id));
      return {
        changes: [
          {
            path: `finding/${params.documentId}/${params.columnIndex}/disposition`,
            before: cell.disposition,
            after: disposition,
          },
        ],
      };
    },
  });
}

/** Native tracked proposals from this run may advance a draft, but arbitrary edits cannot. */
async function sourceCompatible(
  reviewId: string,
  documentId: string,
  sourceVersionId: string | null,
  currentVersionId: string | null,
  sourceText: string,
  currentText: string | null,
  reader: AccessReader = db
) {
  if (sourceVersionId === currentVersionId) return sourceText === currentText;
  if (!sourceVersionId || !currentVersionId) return false;
  const [source] = await reader
    .select()
    .from(documentVersions)
    .where(eq(documentVersions.id, sourceVersionId));
  if (!source) return false;
  const later = await reader
    .select()
    .from(documentVersions)
    .where(
      and(
        eq(documentVersions.documentId, documentId),
        gt(documentVersions.versionNumber, source.versionNumber)
      )
    );
  const edits = await reader
    .select()
    .from(documentEdits)
    .where(eq(documentEdits.documentId, documentId));
  if (!later.length) return false;
  const changes = await reader
    .select()
    .from(fieldChanges)
    .where(
      inArray(
        fieldChanges.commitId,
        later.flatMap((v) => (v.lastCommitId ? [v.lastCommitId] : []))
      )
    );
  return later.every((v) => {
    const ownEdit = (id: string) =>
      edits.some((e) => e.changeId === id && e.findingProvenance?.reviewId === reviewId);
    if (v.source === "user_accept" || v.source === "user_reject") {
      const resolutions = changes.filter(
        (c) =>
          c.commitId === v.lastCommitId && c.path.startsWith("edit/") && c.path.endsWith("/status")
      );
      return resolutions.length > 0 && resolutions.every((c) => ownEdit(c.path.split("/")[1]!));
    }
    const proposed = edits.filter((e) => e.versionId === v.id);
    return (
      (v.source === "assistant_edit" || v.source === "user_edit") &&
      proposed.length > 0 &&
      proposed.every((e) => e.findingProvenance?.reviewId === reviewId)
    );
  });
}

export async function proposeFindingRedline(
  actor: Actor,
  reviewId: string,
  input: z.infer<typeof findingRedlineSchema>
) {
  const params = findingRedlineSchema.parse(input);
  if (
    !(await canAccessArtifact(actor, "tabular_review", reviewId, "editor")) ||
    !(await canAccessArtifact(actor, "document", params.documentId, "editor"))
  )
    throw new Error("access_denied");
  const inputFingerprint = createHash("sha256")
    .update(JSON.stringify({ actor, reviewId, ...params }))
    .digest("hex");
  const replay = async () => {
    const priorEdits = await db
      .select()
      .from(documentEdits)
      .where(eq(documentEdits.documentId, params.documentId));
    const prior = priorEdits.filter(
      (e) => e.findingProvenance?.requestId === params.requestId && e.createdBy === actor.userId
    );
    if (!prior.length) return null;
    if (prior.some((e) => e.findingProvenance?.inputFingerprint !== inputFingerprint))
      throw new Error("request_conflict");
    return {
      changeIds: prior.map((e) => e.changeId),
      requested: 1,
      applied: prior.length,
      failed: 0,
      errors: [],
    };
  };
  const replayed = await replay();
  if (replayed) return replayed;
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
  const [doc] = await db.select().from(documents).where(eq(documents.id, params.documentId));
  const [cell] = await db
    .select()
    .from(tabularCells)
    .where(
      and(
        eq(tabularCells.reviewId, reviewId),
        eq(tabularCells.documentId, params.documentId),
        eq(tabularCells.columnIndex, params.columnIndex)
      )
    );
  if (
    !review?.inputSnapshot ||
    !doc ||
    !cell?.finding ||
    cell.finding.revisionId !== params.revisionId
  )
    throw new Error("stale_proposal");
  if (cell.finding.outcome === "not_found" && !params.find) {
    const source = review.inputSnapshot.documents.find((d) => d.id === doc.id);
    const anchors = [params.contextBefore, params.contextAfter].filter(
      (text): text is string => !!text?.trim()
    );
    if (
      !anchors.length ||
      !source ||
      anchors.some(
        (text) => !normalizeEvidenceText(source.text).includes(normalizeEvidenceText(text))
      )
    )
      throw new Error("Select an explicit source insertion anchor");
  } else if (
    !cell.finding.citationsValid ||
    !params.find ||
    !cell.citations?.some((c) => c.quote === params.find)
  )
    throw new Error("Select an exact verified source quotation");
  if (
    !(await sourceCompatible(
      reviewId,
      doc.id,
      cell.finding.sourceVersionId,
      doc.currentVersionId,
      review.inputSnapshot.documents.find((d) => d.id === doc.id)?.text ?? "",
      doc.markdown
    ))
  )
    throw new Error("stale_source");
  const rule = review.inputSnapshot.rules.find((r) => r.columnIndex === params.columnIndex);
  const clause = rule?.clauses.find((c) => c.id === params.clauseId);
  if (!clause || !(await canReadApprovedLibrary(actor, "clause", clause.id, review.matterId)))
    throw new Error("Approved clause unavailable");
  const [liveClause] = await db.select().from(clauses).where(eq(clauses.id, clause.id));
  if (
    !liveClause ||
    liveClause.status !== "approved" ||
    (liveClause.headCommitId ??
      `seed:${liveClause.id}:${createHash("sha256").update(liveClause.body).digest("hex")}`) !==
      clause.revision
  )
    throw new Error("Approved clause changed; start a review with the current revision");
  const provenance: FindingEditProvenance = {
    requestId: params.requestId,
    inputFingerprint,
    reviewId,
    documentId: doc.id,
    columnIndex: params.columnIndex,
    findingCommitId: params.revisionId,
    sourceVersionId: cell.finding.sourceVersionId,
    clauseId: clause.id,
    clauseRevision: clause.revision,
  };
  try {
    return await proposeEditDetail(
      actor,
      doc.id,
      [
        {
          find: params.find,
          replace: clause.body,
          contextBefore: params.contextBefore,
          contextAfter: params.contextAfter,
          reason: `Review finding ${params.revisionId}; approved clause ${clause.id} revision ${clause.revision}`,
        },
      ],
      { expectedHeadCommitId: params.expectedHeadCommitId, provenance }
    );
  } catch (error) {
    const replayedAfterRace = await replay();
    if (replayedAfterRace) return replayedAfterRace;
    throw error;
  }
}

export async function getReviewCompletion(
  actor: Actor,
  reviewId: string,
  reader: AccessReader = db
) {
  if (!(await canAccessArtifact(actor, "tabular_review", reviewId, "viewer", reader)))
    throw new Error("access_denied");
  const [review] = await reader
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, reviewId));
  if (!review?.inputSnapshot) return null;
  const cells = await reader.select().from(tabularCells).where(eq(tabularCells.reviewId, reviewId));
  const docs = await reader
    .select()
    .from(documents)
    .where(inArray(documents.id, review.documentIds));
  const edits = await reader
    .select()
    .from(documentEdits)
    .where(inArray(documentEdits.documentId, review.documentIds));
  const pendingProposals = await reader
    .select()
    .from(approvalProposals)
    .where(
      and(eq(approvalProposals.artifactId, review.id), eq(approvalProposals.status, "pending"))
    );
  const decisionAndEditCommitIds = [
    ...new Set([
      ...cells.flatMap((cell) => (cell.disposition?.commitId ? [cell.disposition.commitId] : [])),
      ...edits.flatMap((edit) => (edit.lastCommitId ? [edit.lastCommitId] : [])),
    ]),
  ];
  const decisionAndEditCommits = decisionAndEditCommitIds.length
    ? await reader
        .select({ id: commits.id, createdAt: commits.createdAt })
        .from(commits)
        .where(inArray(commits.id, decisionAndEditCommitIds))
    : [];
  const committedAt = new Map(
    decisionAndEditCommits.map((commit) => [commit.id, commit.createdAt.getTime()])
  );
  const [matter] = await reader.select().from(matters).where(eq(matters.id, review.matterId));
  const policyRevision = matter?.approvalPolicyRevision ?? 0;
  const requiredFindingRole = matter?.approvalPolicy.escalationDecisions ?? "editor";
  const canEscalate =
    actor.type === "user" &&
    (await canAccessArtifact(actor, "tabular_review", reviewId, "editor", reader));
  const canDecide =
    canEscalate &&
    (requiredFindingRole !== "owner" ||
      (await hasMatterAccess(actor, review.matterId, "owner", reader)));
  const results = [];
  for (const source of review.inputSnapshot.documents) {
    const doc = docs.find((d) => d.id === source.id);
    const findings = review.inputSnapshot.rules.map((rule) => {
      const cell = cells.find(
        (c) => c.documentId === source.id && c.columnIndex === rule.columnIndex
      );
      const linked = edits.filter(
        (e) =>
          e.findingProvenance?.reviewId === review.id &&
          e.findingProvenance.columnIndex === rule.columnIndex &&
          e.findingProvenance.findingCommitId === cell?.finding?.revisionId
      );
      // Compare durable commit times, not UI timestamps or per-artifact sequence numbers.
      // A rejection supersedes an earlier "leave unchanged" decision; it needs a new decision.
      const decisionTime = cell?.disposition
        ? committedAt.get(cell.disposition.commitId)
        : undefined;
      const freshUnchanged =
        cell?.disposition?.status === "left_unchanged" &&
        decisionTime !== undefined &&
        linked.every((edit) => {
          const editTime = edit.lastCommitId ? committedAt.get(edit.lastCommitId) : undefined;
          return editTime !== undefined && decisionTime > editTime;
        });
      const disposition =
        cell?.disposition?.status === "escalated"
          ? "escalated"
          : linked.some((edit) => edit.status === "pending")
            ? "redline_proposed"
            : linked.length > 0 && linked.every((edit) => edit.status === "accepted")
              ? "resolved"
              : freshUnchanged
                ? "left_unchanged"
                : "needs_attention";
      const addressed =
        disposition !== "escalated" &&
        (disposition === "left_unchanged" ||
          disposition === "resolved" ||
          (linked.length === 0 && cell?.finding?.outcome === "conforms"));
      return {
        columnIndex: rule.columnIndex,
        cellId: cell?.id ?? null,
        ruleId: rule.id,
        name: rule.name,
        severity: rule.severity,
        standardPosition: rule.standardPosition,
        finding: cell?.finding ?? null,
        disposition,
        rationale: cell?.disposition?.rationale ?? null,
        addressed,
        clauses: rule.clauses,
      };
    });
    const pendingEdits = edits.filter(
      (e) => e.documentId === source.id && e.status === "pending"
    ).length;
    const sourceChanged =
      !doc ||
      doc.deletedAt !== null ||
      !(await sourceCompatible(
        reviewId,
        source.id,
        source.versionId,
        doc.currentVersionId,
        source.text,
        doc.markdown,
        reader
      ));
    const pendingApprovals = pendingProposals.filter(
      (p) => p.kind === "cell" && (p.payload as CellProposalPayload).documentId === source.id
    ).length;
    const unfinished = cells.filter(
      (c) => c.documentId === source.id && c.status !== "done"
    ).length;
    const unresolved = findings.filter((f) => !f.addressed).length;
    const approvedBaselineReady =
      !!doc &&
      (doc.currentVersionId
        ? doc.approvedVersionId === doc.currentVersionId
        : doc.approvedMarkdown === doc.markdown);
    const decisionsComplete =
      !sourceChanged &&
      unfinished === 0 &&
      unresolved === 0 &&
      pendingEdits === 0 &&
      pendingApprovals === 0;
    const canPropose =
      (await canAccessArtifact(actor, "tabular_review", reviewId, "editor", reader)) &&
      (await canAccessArtifact(actor, "document", source.id, "editor", reader));
    results.push({
      canPropose,
      reviewedText: source.text,
      documentId: source.id,
      title: source.title,
      editableDocx: doc?.fileType === "docx",
      reviewedVersionId: source.versionId,
      currentVersionId: doc?.currentVersionId ?? null,
      approvedVersionId: doc?.approvedVersionId ?? null,
      approvedBaselineReady,
      currentHeadCommitId: doc?.headCommitId ?? null,
      sourceChanged,
      unfinished,
      unresolved,
      pendingEdits,
      pendingApprovals,
      findings,
      decisionsComplete,
      cleanReady: doc?.fileType === "docx" && approvedBaselineReady && decisionsComplete,
    });
  }
  return {
    canDecide,
    canEscalate,
    policyRevision,
    requiredFindingRole,
    reviewId,
    matterId: review.matterId,
    reviewCommitId: review.headCommitId,
    playbookId: review.inputSnapshot.playbookId,
    capturedAt: review.inputSnapshot.createdAt,
    playbookRevision: review.inputSnapshot.playbookRevision,
    documents: results,
    cleanReady: results.every((d) => d.cleanReady),
    decisionsComplete: results.every((d) => d.decisionsComplete),
  };
}
