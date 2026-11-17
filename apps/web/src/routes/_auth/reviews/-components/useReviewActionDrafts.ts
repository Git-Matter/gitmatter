import { useState } from "react";
import { useIsMutating } from "@tanstack/react-query";

export type ReviewActionDraft = {
  clauseId: string;
  clauseLabel: string;
  quote: string;
  anchor: string;
  rationale: string;
  requestId: string;
};

export const EMPTY_REVIEW_ACTION_DRAFT: ReviewActionDraft = {
  clauseId: "",
  clauseLabel: "",
  quote: "",
  anchor: "",
  rationale: "",
  requestId: "",
};

export type EarlierReviewDraft = { key: string; revisionId: string; draft: ReviewActionDraft };

function hasInput(draft: ReviewActionDraft): boolean {
  return !!(draft.rationale.trim() || draft.clauseId || draft.quote || draft.anchor.trim());
}

/** Local input belongs to the exact finding, including while another finding is inspected. */
export function useReviewActionDrafts(reviewId: string) {
  const [drafts, setDrafts] = useState<Record<string, ReviewActionDraft>>({});
  const saving = useIsMutating({ mutationKey: ["review-action", reviewId] }) > 0;
  const hasDrafts = Object.values(drafts).some(hasInput);
  return {
    guardProps: {
      isDirty: () => hasDrafts || saving,
      saving,
      title: "Keep your unfinished review work?",
      description:
        "Your decision rationale and proposed-change selections are still here. Keep editing, or discard this unfinished input. Saved audit history is retained.",
      onDiscard: () => setDrafts({}),
    },
    bind(documentId: string, revisionId: string | undefined, columnIndex: number) {
      const prefix = `${reviewId}:${documentId}:${columnIndex}:`;
      const key = `${prefix}${revisionId ?? "pending"}`;
      return {
        draft: drafts[key] ?? EMPTY_REVIEW_ACTION_DRAFT,
        earlierDrafts: Object.entries(drafts)
          .filter(
            ([candidate, draft]) =>
              candidate.startsWith(prefix) && candidate !== key && hasInput(draft)
          )
          .map(([candidate, draft]) => ({
            key: candidate,
            revisionId: candidate.slice(prefix.length),
            draft,
          })),
        recoveryBusy: saving,
        onDiscardEarlier(candidate: string) {
          setDrafts((current) => {
            const next = { ...current };
            delete next[candidate];
            return next;
          });
        },
        onDraftChange(update: (current: ReviewActionDraft) => ReviewActionDraft) {
          setDrafts((current) => ({
            ...current,
            [key]: update(current[key] ?? EMPTY_REVIEW_ACTION_DRAFT),
          }));
        },
      };
    },
  };
}
