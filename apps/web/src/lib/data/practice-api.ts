import type {
  DocumentReviewInput,
  DocumentReviewState,
  PracticeProfile,
  PracticeProfileResponse,
} from "@workspace/contracts";

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const headers = new Headers(options?.headers);
  headers.set("Content-Type", "application/json");
  const response = await fetch(path, {
    ...options,
    headers,
  });
  if (!response.ok) {
    const body = (await response.json().catch(() => null)) as { error?: string } | null;
    throw new Error(
      typeof body?.error === "string" ? body.error : "Check the form fields and try again."
    );
  }
  return response.json() as Promise<T>;
}

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
