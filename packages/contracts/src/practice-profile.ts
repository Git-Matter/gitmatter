import { z } from "zod";

export const AUSTRALIAN_JURISDICTIONS = [
  "AU",
  "AU-ACT",
  "AU-NSW",
  "AU-NT",
  "AU-QLD",
  "AU-SA",
  "AU-TAS",
  "AU-VIC",
  "AU-WA",
] as const;

export const practiceProfileSchema = z
  .object({
    displayName: z.string().trim().max(160),
    correspondenceHeader: z.string().trim().max(2000),
    signOff: z.string().trim().max(500),
    jurisdiction: z.enum(AUSTRALIAN_JURISDICTIONS),
    instructions: z.string().trim().max(3000),
  })
  .strict();

export type PracticeProfile = z.infer<typeof practiceProfileSchema>;
export type PracticeProfileResponse = { profile: PracticeProfile; canEdit: boolean };

export const documentReviewInputSchema = z
  .object({
    expectedStateToken: z.string().regex(/^v1:[a-f0-9]{64}$/),
    scope: z.string().trim().min(10).max(2000),
  })
  .strict();

export type DocumentReviewInput = z.infer<typeof documentReviewInputSchema>;
export type PractitionerReview = {
  id: string;
  reviewerName: string;
  reviewedAt: string;
  scope: string;
  documentVersionId: string | null;
  stateToken: string;
  commitId: string;
};
export type DocumentReviewState = {
  documentId: string;
  documentTitle: string;
  documentVersionId: string | null;
  documentHeadCommitId: string | null;
  stateToken: string;
  canReview: boolean;
  blockedReason: string | null;
  currentReview: PractitionerReview | null;
  history: Array<PractitionerReview & { current: boolean }>;
};
