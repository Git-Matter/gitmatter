import type { FirstReviewStatus } from "@workspace/contracts";

export const FIRST_REVIEW_TASKS = {
  1: "Check storage and processing",
  2: "Choose how the review runs",
  3: "Use an approved firm standard",
  4: "Upload one actual document",
  5: "Capture review instructions",
  6: "Review cited findings",
  7: "Make human decisions",
  8: "Prepare the Word output",
} as const;
export type FirstReviewTask = keyof typeof FIRST_REVIEW_TASKS;

/** Presentation guidance only. It cannot authorize, complete or run legal work. */
export function recommendFirstReviewTask(
  status: FirstReviewStatus,
  executionReady: boolean
): FirstReviewTask | null {
  if (!status.matter) return null;
  const review = status.review;
  // Readers inspect saved evidence rather than being invited to perform editor decisions.
  if (!status.matter.canEdit) return review ? 6 : null;
  if (review && !review.sourceChanged && review.instructionsCaptured) {
    if (
      review.totalFindings <= 0 ||
      review.completedFindings !== review.totalFindings ||
      review.failedFindings > 0
    )
      return 6;
    return review.decisionsComplete ? 8 : 7;
  }
  if (!status.organization.storageRegion) return 1;
  if (!executionReady) return 2;
  if (!status.playbooks.length) return 3;
  if (!status.documents.some((document) => document.uploaded && document.ready)) return 4;
  return 5;
}

/** No running label is inferred from the presence of a review record. */
export function reviewFindingStatus(review: FirstReviewStatus["review"]): string {
  if (!review) return "Needs review";
  if (review.sourceChanged) return "Earlier source";
  if (review.failedFindings > 0) return "Findings need attention";
  if (review.totalFindings > 0 && review.completedFindings === review.totalFindings)
    return "Findings prepared";
  return "Findings incomplete";
}
