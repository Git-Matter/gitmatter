/** Immutable inputs and decision metadata for an audited contract review. */
export type ReviewClauseSnapshot = {
  id: string;
  revision: string;
  body: string;
  title: string;
};
export type ReviewRuleSnapshot = {
  id: string;
  columnIndex: number;
  name: string;
  severity: "red" | "yellow";
  standardPosition: string;
  clauses: ReviewClauseSnapshot[];
};
export type ContractReviewSnapshot = {
  revision: 1;
  createdAt: string;
  playbookId: string;
  playbookRevision: string;
  rules: ReviewRuleSnapshot[];
  documents: Array<{
    id: string;
    title: string;
    versionId: string | null;
    headCommitId: string | null;
    text: string;
  }>;
};
export type FindingOutcome = "conforms" | "deviates" | "not_found" | "inconclusive";
export type FindingProvenance = {
  revisionId: string;
  sourceVersionId: string | null;
  sourceHeadCommitId: string | null;
  ruleId: string;
  outcome: FindingOutcome;
  citationsValid: boolean;
};
export type FindingDisposition = {
  policyRevision?: number;
  requiredRole?: "editor" | "owner";
  revisionId: string;
  status: "left_unchanged" | "escalated";
  rationale: string;
  actorId: string;
  commitId: string;
};
export type FindingEditProvenance = {
  requestId: string;
  inputFingerprint: string;
  reviewId: string;
  documentId: string;
  columnIndex: number;
  findingCommitId: string;
  sourceVersionId: string | null;
  clauseId: string;
  clauseRevision: string;
};
