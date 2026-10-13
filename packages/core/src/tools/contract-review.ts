import { z } from "zod";
import {
  getReviewCompletion,
  setFindingDisposition,
  proposeFindingRedline,
  findingDispositionSchema,
  findingRedlineSchema,
} from "../ai/tabular/contract-review.js";
import type { ToolContext, ToolSpec } from "./types.js";
import { captureReviewReport } from "../content/reviewReport.js";
import { requestCleanReviewExport } from "../content/reviewExport.js";
export function buildContractReviewTools({ actor }: ToolContext): ToolSpec[] {
  const safe = (work: () => Promise<unknown>) =>
    work().catch((e) => ({ error: e instanceof Error ? e.message : "Operation failed" }));
  return [
    {
      name: "request_clean_review_export",
      description:
        "Request an exact clean DOCX export of one completed NDA review. Its current manifest pins source and audit cutoffs; when policy requires approval, an eligible person must approve this request before download. This operation makes no model call.",
      schema: { requestId: z.uuid(), reviewId: z.uuid(), documentId: z.uuid() },
      handler: (input) =>
        safe(() =>
          requestCleanReviewExport(actor, input as Parameters<typeof requestCleanReviewExport>[1])
        ),
    },
    {
      name: "get_review_report",
      readOnly: true,
      description:
        "Capture an authorized review report with exact source/playbook/policy revisions, finding decisions and commit provenance. Its manifest describes this report and does not certify a later DOCX download or legal quality.",
      schema: { reviewId: z.uuid() },
      handler: async ({ reviewId }) => safe(() => captureReviewReport(actor, reviewId as string)),
    },
    {
      name: "get_review_completion",
      readOnly: true,
      description:
        "Get version-bound finding decisions, approved clause snapshots and server-derived export readiness for a contract review.",
      schema: { reviewId: z.uuid() },
      handler: async ({ reviewId }) => safe(() => getReviewCompletion(actor, reviewId as string)),
    },
    {
      name: "propose_finding_redline",
      description:
        "Propose one tracked DOCX change using an exact verified finding quote and approved clause snapshot. Supply current document head from get_review_completion. Human acceptance is separate.",
      schema: { reviewId: z.uuid(), ...findingRedlineSchema.shape },
      handler: async ({ reviewId, ...input }) =>
        safe(() =>
          proposeFindingRedline(actor, reviewId as string, findingRedlineSchema.parse(input))
        ),
    },
    {
      name: "set_finding_disposition",
      humanOnly: true,
      description:
        "A human records a reasoned decision to leave a finding unchanged or escalate it. Does not approve an edit.",
      schema: { reviewId: z.uuid(), ...findingDispositionSchema.shape },
      handler: async ({ reviewId, ...input }) =>
        safe(() =>
          setFindingDisposition(actor, reviewId as string, findingDispositionSchema.parse(input))
        ),
    },
  ];
}
