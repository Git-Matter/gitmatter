import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Skeleton } from "@/components/ui/skeleton";
import { Textarea } from "@/components/ui/textarea";
import { practiceApi } from "@/lib/data/practice-api";
import { UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";
import { notifySuccess } from "@/lib/feedback";

const formatDate = (value: string) =>
  new Intl.DateTimeFormat("en-AU", { dateStyle: "medium", timeStyle: "short" }).format(
    new Date(value)
  );

/** The document route owns these drafts so a denied refresh cannot discard unfinished input. */
export function usePractitionerReviewDrafts() {
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  return {
    drafts,
    setDrafts,
    setSaving,
    guard: (
      <UnsavedNavigationGuard
        isDirty={() => Object.values(drafts).some((value) => !!value.trim()) || saving}
        saving={saving}
        onDiscard={() => setDrafts({})}
        title="Keep your unfinished review record?"
        description="Your review scope is retained for its document version. Keep editing, or discard this unfinished input."
      />
    ),
  };
}

export function PractitionerReviewPanel({
  documentId,
  versionId,
  headCommitId,
  previewReady,
  draftState,
}: {
  documentId: string;
  versionId: string | null;
  headCommitId: string | null;
  previewReady: boolean;
  draftState: ReturnType<typeof usePractitionerReviewDrafts>;
}) {
  const qc = useQueryClient();
  const queryKey = ["document-review", documentId, versionId, headCommitId];
  const query = useQuery({ queryKey, queryFn: () => practiceApi.getDocumentReview(documentId) });
  const revision = `${documentId}:${versionId}:${headCommitId}`;
  const { drafts, setDrafts, setSaving } = draftState;
  const scope = drafts[revision] ?? "";
  const setScope = (text: string) => setDrafts((previous) => ({ ...previous, [revision]: text }));
  const [confirmedToken, setConfirmedToken] = useState<string | null>(null);
  const review = useMutation({
    mutationFn: (input: { expectedStateToken: string; scope: string; revision: string }) =>
      practiceApi.reviewDocument(documentId, {
        expectedStateToken: input.expectedStateToken,
        scope: input.scope,
      }),
    onSuccess: (state, input) => {
      qc.setQueryData(
        ["document-review", documentId, state.documentVersionId, state.documentHeadCommitId],
        state
      );
      setConfirmedToken(null);
      setDrafts((previous) => ({ ...previous, [input.revision]: "" }));
      notifySuccess("Practitioner review recorded");
      void qc.invalidateQueries({ queryKey: ["document-history", documentId] });
      void qc.invalidateQueries({ queryKey: ["document", documentId] });
    },
    onError: () => {
      setConfirmedToken(null);
      void query.refetch();
    },
    onSettled: () => setSaving(false),
  });
  const earlierDrafts = Object.entries(drafts).filter(
    ([key, value]) => key.startsWith(`${documentId}:`) && key !== revision && value.trim()
  );

  if (query.isPending)
    return (
      <>
        <Skeleton className="h-32 w-full" aria-label="Loading practitioner review" />
      </>
    );
  if (query.isError)
    return (
      <>
        <Alert variant="destructive">
          <AlertDescription>
            Could not load practitioner review.{" "}
            <button type="button" className="underline" onClick={() => void query.refetch()}>
              Try again
            </button>
            .
          </AlertDescription>
        </Alert>
      </>
    );

  const state = query.data;
  const displayedStateMatches =
    state.documentVersionId === versionId && state.documentHeadCommitId === headCommitId;
  const canReview = state.canReview && displayedStateMatches && previewReady;
  const confirmed = confirmedToken === state.stateToken;
  const latestReview = state.history[0];

  return (
    <>
      <Card variant="section">
        <CardHeader>
          <CardTitle>Practitioner review</CardTitle>
          <CardDescription>
            Your own verification of this document, recorded separately from AI actions.
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-stack">
          {earlierDrafts.length > 0 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Unfinished scopes from earlier document versions ({earlierDrafts.length})
              </summary>
              <p className="mt-2 text-sm text-muted-foreground">
                These drafts were not applied to this version. Inspect the current document before
                writing and confirming its review scope.
              </p>
              {earlierDrafts.map(([key, value]) => (
                <p key={key} className="mt-3 text-sm whitespace-pre-wrap">
                  {value}
                </p>
              ))}
            </details>
          )}
          {state.currentReview && displayedStateMatches ? (
            <div className="flex flex-col gap-2">
              <Badge variant="secondary" className="self-start">
                Reviewed version
              </Badge>
              <p className="text-sm">
                {state.currentReview.reviewerName} · {formatDate(state.currentReview.reviewedAt)}
              </p>
              <p className="text-sm whitespace-pre-wrap">{state.currentReview.scope}</p>
            </div>
          ) : latestReview ? (
            <Alert>
              <AlertDescription>
                The previous review by {latestReview.reviewerName} on{" "}
                {formatDate(latestReview.reviewedAt)} does not match a verified current document
                state. Check the document and any processing or inspection messages before recording
                a new review.
              </AlertDescription>
            </Alert>
          ) : (
            <p className="text-sm text-muted-foreground">
              No practitioner review has been recorded for this document.
            </p>
          )}
          {!displayedStateMatches ? (
            <Alert>
              <AlertDescription>
                The document has changed since you opened it.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    setConfirmedToken(null);
                    void qc.invalidateQueries({ queryKey: ["document", documentId] });
                    void query.refetch();
                  }}
                >
                  Reload the document
                </button>{" "}
                before recording your review.
              </AlertDescription>
            </Alert>
          ) : (
            state.blockedReason && (
              <p className="text-sm text-muted-foreground">{state.blockedReason}</p>
            )
          )}
          {!previewReady && (
            <p className="text-sm text-muted-foreground">
              Load and inspect the current document content successfully before recording your
              review.
            </p>
          )}
          <form
            className="flex flex-col gap-stack"
            onSubmit={(event) => {
              event.preventDefault();
              if (canReview && confirmed && scope.trim().length >= 10) {
                setSaving(true);
                review.mutate({
                  expectedStateToken: state.stateToken,
                  scope: scope.trim(),
                  revision,
                });
              }
            }}
          >
            <FieldGroup>
              <Field>
                <FieldLabel htmlFor={`review-scope-${documentId}`}>What did you check?</FieldLabel>
                <Textarea
                  id={`review-scope-${documentId}`}
                  value={scope}
                  maxLength={2000}
                  minLength={10}
                  required
                  rows={3}
                  disabled={!canReview || review.isPending}
                  onChange={(event) => {
                    setScope(event.target.value);
                    setConfirmedToken(null);
                  }}
                  placeholder="For example: checked the parties and dates against the source documents; reviewed the proposed wording."
                />
                <FieldDescription>
                  Describe the scope of your review. This record does not certify legal correctness
                  or confirm that a document was sent or filed.
                </FieldDescription>
              </Field>
              <Field orientation="horizontal">
                <Checkbox
                  id={`review-confirm-${documentId}`}
                  checked={confirmed}
                  disabled={!canReview || review.isPending}
                  onCheckedChange={(checked) =>
                    setConfirmedToken(checked ? state.stateToken : null)
                  }
                />
                <FieldLabel htmlFor={`review-confirm-${documentId}`}>
                  I personally checked the document shown here within the scope above.
                </FieldLabel>
              </Field>
            </FieldGroup>
            {review.isError && (
              <Alert variant="destructive">
                <AlertDescription>{review.error.message}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-center gap-3">
              <Button
                type="submit"
                disabled={!canReview || !confirmed || scope.trim().length < 10 || review.isPending}
              >
                {review.isPending ? "Recording…" : "Record my review"}
              </Button>
              {state.history.length > 0 && (
                <a
                  className="text-sm font-medium underline underline-offset-4"
                  href={practiceApi.exportReviewUrl(documentId)}
                >
                  Download review record (.docx)
                </a>
              )}
            </div>
          </form>
          {state.history.length > 1 && (
            <details>
              <summary className="cursor-pointer text-sm font-medium">
                Earlier reviews ({state.history.length - 1})
              </summary>
              <ul className="mt-3 flex flex-col gap-3 text-sm">
                {state.history.slice(1).map((entry) => (
                  <li key={entry.id}>
                    <p className="text-muted-foreground">
                      {entry.reviewerName} · {formatDate(entry.reviewedAt)} ·{" "}
                      {entry.current ? "Current" : "Earlier version"}
                    </p>
                    <p className="whitespace-pre-wrap">{entry.scope}</p>
                  </li>
                ))}
              </ul>
            </details>
          )}
        </CardContent>
      </Card>
    </>
  );
}
