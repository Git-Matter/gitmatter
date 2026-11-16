import type {
  DocumentReviewInput,
  DocumentReviewState,
  PracticeProfile,
  PracticeProfileResponse,
} from "@workspace/contracts";
import { apiRequest as request } from "./api";

export const practiceApi = {
  getProfile: () => request<PracticeProfileResponse>("/api/practice-profile"),
  saveProfile: (profile: PracticeProfile) =>
    request<PracticeProfileResponse>("/api/practice-profile", {
      method: "PUT",
      body: JSON.stringify(profile),
    }),
  getDocumentReview: (documentId: string) =>
    request<DocumentReviewState>(`/api/documents/${encodeURIComponent(documentId)}/review`),
  reviewDocument: (documentId: string, input: DocumentReviewInput) =>
    request<DocumentReviewState>(`/api/documents/${encodeURIComponent(documentId)}/review`, {
      method: "POST",
      body: JSON.stringify(input),
    }),
  exportReviewUrl: (documentId: string) =>
    `/api/documents/${encodeURIComponent(documentId)}/review/export`,
};
