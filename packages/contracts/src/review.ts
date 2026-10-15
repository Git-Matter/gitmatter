import { z } from "zod";

/** Null and "unknown" are explicit unknowns, never a guessed client or legal position. */
export const reviewInstructionsSchema = z.strictObject({
  representedParty: z
    .string()
    .trim()
    .min(1, "Enter the party name, or mark it unknown.")
    .max(300)
    .nullable(),
  disclosureRole: z.enum(["receiving", "disclosing", "both", "unknown"]),
  ndaStructure: z.enum(["mutual", "unilateral", "unknown"]),
  businessPurpose: z
    .string()
    .trim()
    .min(1, "Describe the purpose, or mark it unknown.")
    .max(2000)
    .nullable(),
  governingLaw: z
    .string()
    .trim()
    .min(1, "Enter the governing law context, or mark it unknown.")
    .max(500)
    .nullable(),
  additionalInstructions: z.string().trim().max(4000).optional(),
});
export type ReviewInstructions = z.infer<typeof reviewInstructionsSchema>;

/** Current captured review inputs have no trusted page map. A quote is the
 * supported citation location; legacy provider page numbers are not verified. */
export type QuoteCitation = { quote: string };

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
type ContractReviewSnapshotInputs = {
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
export type ContractReviewSnapshot = ContractReviewSnapshotInputs &
  ({ revision: 1 } | { revision: 2; reviewInstructions: ReviewInstructions });
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
