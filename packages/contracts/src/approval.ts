/** Independently enforced matter gates. Missing optional gates retain legacy defaults. */
export type ApprovalPolicy = {
  agentCells: "direct" | "editor" | "owner";
  escalationDecisions?: "editor" | "owner";
  documentEdits?: "editor" | "owner";
  agentWorkflows?: "direct" | "editor" | "owner";
  cleanExports?: {
    approvalAboveDocuments: 0 | 1;
    approvalAboveProviderCostMicros: number;
    requiredRole: "editor" | "owner";
  };
};
export type DocumentApprovalContext = Array<{
  matterId: string;
  policyRevision: number;
  requiredRole: "editor" | "owner";
}>;
export type DocumentResolutionInput = {
  expectedHeadCommitId?: string | null;
  approvalContext?: DocumentApprovalContext;
};
export type WorkflowProposalFields = {
  title: string;
  type: "assistant" | "tabular" | "playbook";
  promptMd: string;
  steps: Array<{ title?: string; promptMd: string }> | null;
  columnsConfig: Array<{
    index: number;
    name: string;
    prompt: string;
    format?: string;
    tags?: string[];
  }> | null;
  rules: Array<{
    id: string;
    clauseType: string;
    standardClauseId?: string;
    standardPosition: string;
    fallbacks?: Array<string | { clauseId: string }>;
    unacceptable?: string;
    guidance?: string;
    severity: "red" | "yellow";
  }> | null;
  status: "draft" | "approved" | "deprecated";
  practice: string | null;
};
export type WorkflowProposalPayload = {
  action: "create" | "update";
  workflowId: string;
  tenantId: string;
  before: WorkflowProposalFields | null;
  after: WorkflowProposalFields;
  baseContentHash: string | null;
};
export type ExportProposalPayload = {
  requestFingerprint: string;
  reviewId: string;
  documentId: string;
  versionId: string;
  documentCommitId: string | null;
  reviewCommitId: string | null;
  output: "clean";
  documentCount: 1;
  // No model call occurs in this renderer. This excludes hosting/storage fees.
  providerCostMicros: 0;
};
export type ProposalStatus = "pending" | "applied" | "rejected" | "withdrawn";
export type CellProposalPayload = {
  reviewId: string;
  documentId: string;
  columnIndex: number;
  content: { summary: string; flag: "green" | "grey" | "yellow" | "red"; reasoning: string };
  beforeContent: {
    summary: string;
    flag: "green" | "grey" | "yellow" | "red";
    reasoning: string;
  } | null;
  citations: Array<{ quote: string; page?: number }>;
  baseCellCommitId: string | null;
  sourceVersionId: string | null;
  sourceHash: string;
  columnHash: string;
};
type ProposalBase = {
  id: string;
  matterId: string;
  artifactId: string;
  revision: number;
  proposalCommitId: string;
  contentHash: string;
  policyRevision: number;
  requiredRole: "editor" | "owner";
  proposerId: string;
  agentLabel: string | null;
  status: ProposalStatus;
  lastCommitId: string;
  createdAt: string;
  policyChanged: boolean;
  stale: boolean;
  mayDecide: boolean;
  decisions: Array<{
    id: string;
    actorId: string;
    decision: "approve" | "reject" | "withdraw";
    note: string | null;
    applicationCommitId: string;
    createdAt: string;
  }>;
};
export type CellProposal = ProposalBase & { kind: "cell"; payload: CellProposalPayload };
export type WorkflowProposal = ProposalBase & {
  kind: "workflow";
  payload: WorkflowProposalPayload;
};
export type ExportProposal = ProposalBase & {
  kind: "export";
  payload: ExportProposalPayload;
  mayRetrieve: boolean;
};
export type ApprovalProposal = CellProposal | WorkflowProposal | ExportProposal;
export type ProposalDecisionInput = {
  requestId: string;
  proposalId: string;
  revision: number;
  contentHash: string;
  policyRevision: number;
  decision: "approve" | "reject" | "withdraw";
  note?: string;
};
