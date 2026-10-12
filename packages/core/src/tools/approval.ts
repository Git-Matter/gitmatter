import { z } from "zod";
import {
  ApprovalError,
  decideProposal,
  decideProposalBatch,
  getApprovalPolicy,
  getProposal,
  listProposals,
  proposalDecisionSchema,
} from "../core/approval.js";
import type { ToolContext, ToolSpec } from "./types.js";
async function safe(work: () => Promise<unknown>) {
  try {
    return await work();
  } catch (error) {
    return {
      error: error instanceof ApprovalError ? error.message : "Approval operation failed.",
      code: error instanceof ApprovalError ? error.code : "invalid_input",
    };
  }
}
export function buildApprovalTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: "get_approval_policy",
      description: "Read the matter's currently enforced agent-cell approval policy.",
      readOnly: true,
      schema: { matterId: z.uuid() },
      handler: ({ matterId }) => safe(() => getApprovalPolicy(actor, matterId as string)),
    },
    {
      name: "list_proposals",
      description:
        "Read authorized cell proposals in one matter. Pending inference results are not approved content.",
      readOnly: true,
      schema: {
        matterId: z.uuid(),
        status: z.enum(["pending", "applied", "rejected", "withdrawn"]).optional(),
        afterId: z.uuid().optional(),
        limit: z.number().int().min(1).max(50).optional(),
      },
      handler: ({ matterId, ...options }) =>
        safe(() =>
          listProposals(actor, matterId as string, options as Parameters<typeof listProposals>[2])
        ),
    },
    {
      name: "get_proposal",
      description:
        "Inspect exact proposed cell content, source binding, policy, and decision history.",
      readOnly: true,
      schema: { proposalId: z.uuid() },
      handler: ({ proposalId }) => safe(() => getProposal(actor, proposalId as string)),
    },
    {
      name: "decide_proposal",
      description:
        "Human-only apply or reject of an exact reviewed cell proposal. Agents cannot approve.",
      humanOnly: true,
      schema: proposalDecisionSchema.shape,
      handler: (input) => safe(() => decideProposal(actor, proposalDecisionSchema.parse(input))),
    },
    {
      name: "decide_proposal_batch",
      description:
        "Human-only atomic decision of up to 50 compatible cell proposals; one stale item applies none.",
      humanOnly: true,
      schema: { decisions: z.array(proposalDecisionSchema).min(1).max(50) },
      handler: ({ decisions }) =>
        safe(() =>
          decideProposalBatch(actor, decisions as Parameters<typeof decideProposalBatch>[1])
        ),
    },
    {
      name: "withdraw_proposal",
      description:
        "Withdraw your own authorized cell proposal, retaining an audited reason and unchanged accepted content.",
      schema: {
        requestId: z.uuid(),
        proposalId: z.uuid(),
        revision: z.number().int().positive(),
        contentHash: z.string(),
        policyRevision: z.number().int().nonnegative(),
        note: z.string().min(1).max(4000),
      },
      handler: (input) =>
        safe(() =>
          decideProposal(actor, proposalDecisionSchema.parse({ ...input, decision: "withdraw" }))
        ),
    },
  ];
}
