import { z } from "zod";
import {
  cancelJob,
  getJob,
  JobError,
  listDocumentJobs,
  listReviewJobs,
  listMatterJobs,
  listJobNotifications,
  markJobNotificationRead,
  retryJob,
} from "../core/jobs.js";
import { startExtractionWorker } from "../content/extractionQueue.js";
import type { ToolContext, ToolSpec } from "./types.js";

async function safely(work: () => Promise<unknown>) {
  try {
    const result = await work();
    return result ?? { error: "Not found", code: "access_denied" };
  } catch (error) {
    return {
      error: "The job operation could not be completed.",
      code: error instanceof JobError ? error.code : "job_unavailable",
    };
  }
}

/** Web and agent callers share the durable engine and its live scope checks. */
export function buildJobTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: "list_matter_jobs",
      description:
        "Read authorized recent matter work, retained failures and bounded spend totals. Inspect truncation before treating the result as a complete history.",
      readOnly: true,
      schema: { matterId: z.uuid() },
      handler: ({ matterId }) => safely(() => listMatterJobs(actor, matterId as string)),
    },
    {
      name: "read_job_events",
      description:
        "Replay durable authorized matter job events after reconnecting. Pass the returned cursor to continue; job success remains distinct from human approval.",
      readOnly: true,
      schema: { matterId: z.uuid(), cursor: z.uuid().optional() },
      handler: ({ matterId, cursor }) =>
        safely(() => listJobNotifications(actor, matterId as string, cursor as string | undefined)),
    },
    {
      name: "acknowledge_job_event",
      description:
        "Mark one authorized job event read for your account. Other team members retain their own unread state.",
      schema: { eventId: z.uuid() },
      handler: ({ eventId }) =>
        safely(async () =>
          (await markJobNotificationRead(actor, eventId as string)) ? { acknowledged: true } : null
        ),
    },
    {
      name: "get_job",
      description:
        "Read the current authorized durable job state, progress, safe failure code and usage uncertainty. A successful job is not a human approval.",
      readOnly: true,
      schema: { jobId: z.uuid() },
      handler: ({ jobId }) => safely(() => getJob(actor, jobId as string)),
    },
    {
      name: "list_document_jobs",
      description:
        "Read recent extraction jobs for an authorized document, including retained partial results.",
      readOnly: true,
      schema: { documentId: z.uuid() },
      handler: ({ documentId }) => safely(() => listDocumentJobs(actor, documentId as string)),
    },
    {
      name: "list_review_jobs",
      description:
        "Read persisted review work after reconnecting. Completed cells and failed units remain separate.",
      readOnly: true,
      schema: { reviewId: z.uuid() },
      handler: ({ reviewId }) => safely(() => listReviewJobs(actor, reviewId as string)),
    },
    {
      name: "cancel_job",
      description:
        "Request cancellation of an authorized job. Running work stops at a safe checkpoint; committed results and incurred provider charges remain.",
      schema: { jobId: z.uuid() },
      handler: ({ jobId }) => safely(() => cancelJob(actor, jobId as string)),
    },
    {
      name: "retry_job",
      description:
        "Retry an eligible failed job against its original source and within its lifetime attempt limit. A retry can incur another provider charge; inspect the current job and uncertainty first.",
      schema: { jobId: z.uuid(), requestId: z.uuid(), acknowledgeUnknown: z.boolean().optional() },
      handler: ({ jobId, requestId, acknowledgeUnknown }) =>
        safely(async () => {
          const result = await retryJob(actor, jobId as string, {
            requestId: requestId as string,
            acknowledgeUnknown: acknowledgeUnknown as boolean | undefined,
          });
          if (result) startExtractionWorker().wake();
          return result;
        }),
    },
  ];
}
