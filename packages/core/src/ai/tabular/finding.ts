import { canReadApprovedLibrary } from "../../core/library-access.js";
import type { Actor } from "../../core/commit.js";
import { createHash } from "node:crypto";
import type {
  FindingOutcome,
  FindingProvenance,
  FindingEditProvenance,
} from "@workspace/contracts";
import { and, eq } from "drizzle-orm";
import {
  clauses,
  tabularReviews,
  tabularCells,
  type CellCitation,
  type CellContent,
  type TabularReview,
} from "@workspace/db/schema";
import type { Tx } from "@workspace/db/client";
import { quoteOnlyCitations } from "../../content/citations.js";

// CommonMark punctuation escapes are presentation syntax, not words in the source.
export const normalizeEvidenceText = (text: string) =>
  text
    .replace(/\\([!"#$%&'()*+,\-./:;<=>?@[\]^_`{|}~\\])/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
const normalized = normalizeEvidenceText;

/** Missing text is only an absence result when explicitly asserted against prepared input. */
export function validateFinding(source: string, content: CellContent, citations: CellCitation[]) {
  const citationsValid =
    (citations.length > 0 || content.outcome === "not_found") &&
    citations.every(
      (c) => normalized(c.quote).length > 0 && normalized(source).includes(normalized(c.quote))
    );
  const outcome: FindingOutcome =
    !citationsValid || content.outcome === "inconclusive"
      ? "inconclusive"
      : content.outcome === "not_found" && citations.length === 0
        ? "not_found"
        : !citations.length || content.flag === "grey"
          ? "inconclusive"
          : content.flag === "green"
            ? "conforms"
            : "deviates";
  return {
    outcome,
    citationsValid,
    content:
      outcome === "inconclusive"
        ? { ...content, flag: "grey" as const, outcome }
        : { ...content, outcome },
    citations: citationsValid ? quoteOnlyCitations(citations) : [],
  };
}

type CommitTx = Tx;

export async function recordFindingRevision(
  tx: CommitTx,
  params: {
    review: TabularReview;
    documentId: string;
    columnIndex: number;
    commitId: string;
    content: CellContent;
    citations: CellCitation[];
  }
) {
  const source = params.review.inputSnapshot?.documents.find((d) => d.id === params.documentId);
  const rule = params.review.inputSnapshot?.rules.find((r) => r.columnIndex === params.columnIndex);
  if (!source || !rule) return null;
  const validated = validateFinding(source.text, params.content, params.citations);
  const finding: FindingProvenance = {
    revisionId: params.commitId,
    sourceVersionId: source.versionId,
    sourceHeadCommitId: source.headCommitId,
    ruleId: rule.id,
    outcome: validated.outcome,
    citationsValid: validated.citationsValid,
  };
  await tx
    .update(tabularCells)
    .set({ finding, disposition: null, content: validated.content, citations: validated.citations })
    .where(
      and(
        eq(tabularCells.reviewId, params.review.id),
        eq(tabularCells.documentId, params.documentId),
        eq(tabularCells.columnIndex, params.columnIndex)
      )
    );
  return finding;
}

/** Revalidate revision while the document commit is locked, before bytes acquire references. */
export async function validateFindingProposal(
  tx: CommitTx,
  actor: Actor,
  provenance: FindingEditProvenance
) {
  const [cell] = await tx
    .select()
    .from(tabularCells)
    .where(
      and(
        eq(tabularCells.reviewId, provenance.reviewId),
        eq(tabularCells.documentId, provenance.documentId),
        eq(tabularCells.columnIndex, provenance.columnIndex)
      )
    )
    .for("share");
  if (!cell?.finding || cell.finding.revisionId !== provenance.findingCommitId)
    throw new Error("stale_proposal");
  const [review] = await tx
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, provenance.reviewId));
  if (
    !review ||
    !(await canReadApprovedLibrary(actor, "clause", provenance.clauseId, review.matterId, tx))
  )
    throw new Error("access_denied");
  const [clause] = await tx
    .select()
    .from(clauses)
    .where(eq(clauses.id, provenance.clauseId))
    .for("share");
  if (
    !clause ||
    clause.status !== "approved" ||
    (clause.headCommitId ??
      `seed:${clause.id}:${createHash("sha256").update(clause.body).digest("hex")}`) !==
      provenance.clauseRevision
  )
    throw new Error("Approved clause unavailable");
}

/** Diff paths include evidence and human-state resets, not only the displayed cell value. */
export function findingRevisionChanges(
  documentId: string,
  columnIndex: number,
  finding: FindingProvenance,
  content: CellContent,
  citations: CellCitation[],
  previousDisposition: unknown
) {
  return [
    {
      path: `finding/${documentId}/${columnIndex}/${finding.revisionId}`,
      before: null,
      after: { ...finding, content, citations },
    },
    ...(previousDisposition
      ? [
          {
            path: `finding/${documentId}/${columnIndex}/disposition`,
            before: previousDisposition,
            after: null,
          },
        ]
      : []),
  ];
}
