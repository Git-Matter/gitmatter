/** Enforced v1 gate. Broader document/workflow/export gates are not exposed yet. */
export type ApprovalPolicy = {
  agentCells: "direct" | "editor" | "owner";
  escalationDecisions?: "editor" | "owner";
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
export type CellProposal = {
  id: string;
  matterId: string;
  kind: "cell";
  artifactId: string;
  revision: number;
  proposalCommitId: string;
  contentHash: string;
  policyRevision: number;
  requiredRole: "editor" | "owner";
  proposerId: string;
  agentLabel: string | null;
  payload: CellProposalPayload;
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
export type ProposalDecisionInput = {
  requestId: string;
  proposalId: string;
  revision: number;
  contentHash: string;
  policyRevision: number;
  decision: "approve" | "reject" | "withdraw";
  note?: string;
};
