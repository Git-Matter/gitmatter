import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient, useIsMutating } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { api, ApiError, type Cell, type ReviewCompletion } from "@/lib/data/api";
import {
  EMPTY_REVIEW_ACTION_DRAFT,
  type ReviewActionDraft,
  type EarlierReviewDraft,
} from "./useReviewActionDrafts";

type ReviewDocument = ReviewCompletion["documents"][number];
type ReviewFinding = ReviewDocument["findings"][number];
export function ContractReviewActions({
  reviewId,
  document,
  finding,
  cell,
  canDecide,
  canEscalate,
  policyRevision,
  draft,
  onDraftChange,
  earlierDrafts,
  recoveryBusy,
  onDiscardEarlier,
}: {
  reviewId: string;
  document: ReviewDocument;
  finding: ReviewFinding;
  cell?: Cell;
  canDecide: boolean;
  canEscalate: boolean;
  policyRevision: number;
  draft: ReviewActionDraft;
  onDraftChange: (update: (current: ReviewActionDraft) => ReviewActionDraft) => void;
  earlierDrafts: EarlierReviewDraft[];
  recoveryBusy: boolean;
  onDiscardEarlier: (key: string) => void;
}) {
  const qc = useQueryClient();
  const { clauseId, quote, anchor, rationale } = draft;
  const mutationKey = ["review-action", reviewId, document.documentId, finding.finding?.revisionId];
  const pendingActions = useIsMutating({ mutationKey });
  const editProposal = (patch: Partial<ReviewActionDraft>) => {
    const requestId = crypto.randomUUID();
    onDraftChange((current) => ({ ...current, ...patch, requestId }));
  };
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["review", reviewId] });
    void qc.invalidateQueries({ queryKey: ["review-completion", reviewId] });
    void qc.invalidateQueries({ queryKey: ["review-history", reviewId] });
    void qc.invalidateQueries({ queryKey: ["document", document.documentId] });
  };
  const decide = useMutation({
    mutationKey,
    mutationFn: (status: "left_unchanged" | "escalated") =>
      api.setFindingDisposition(reviewId, {
        documentId: document.documentId,
        columnIndex: finding.columnIndex,
        revisionId: finding.finding!.revisionId,
        status,
        rationale,
        policyRevision,
      }),
    onSuccess: () => {
      onDraftChange((current) => ({ ...current, rationale: "" }));
      refresh();
    },
  });
  const propose = useMutation({
    mutationKey,
    mutationFn: () =>
      api.proposeFindingRedline(reviewId, {
        requestId: draft.requestId,
        documentId: document.documentId,
        columnIndex: finding.columnIndex,
        revisionId: finding.finding!.revisionId,
        expectedHeadCommitId: document.currentHeadCommitId,
        clauseId,
        find: quote,
        contextBefore: anchor || undefined,
      }),
    onSuccess: () => {
      onDraftChange((current) => ({
        ...EMPTY_REVIEW_ACTION_DRAFT,
        rationale: current.rationale,
      }));
      refresh();
    },
  });
  const clause = finding.clauses.find((c) => c.id === clauseId);
  const busy = pendingActions > 0;
  const recovery = earlierDrafts.length > 0 && (
    <details open className="space-y-3 rounded-md bg-muted p-3 text-sm">
      <summary className="cursor-pointer font-medium">
        Unfinished input from an earlier finding revision
      </summary>
      <p>
        The finding evidence has changed. Compare this earlier input with the current finding before
        entering a new decision. This input has not been recorded in the audit history.
      </p>
      {earlierDrafts.map(({ key, revisionId, draft: earlier }) => (
        <section
          key={key}
          className="space-y-2 border-t border-border pt-3"
          aria-label={`Earlier finding revision ${revisionId}`}
        >
          {earlier.rationale && (
            <Textarea aria-label="Earlier decision rationale" readOnly value={earlier.rationale} />
          )}
          {earlier.clauseLabel && (
            <p>
              Earlier clause selection: {earlier.clauseLabel}. Check the currently approved revision
              before selecting it again.
            </p>
          )}
          {earlier.quote && (
            <blockquote className="font-serif whitespace-pre-wrap">{earlier.quote}</blockquote>
          )}
          {earlier.anchor && (
            <p className="whitespace-pre-wrap">Earlier source context: {earlier.anchor}</p>
          )}
          <Button
            size="xs"
            variant="ghost"
            disabled={recoveryBusy}
            onClick={() => onDiscardEarlier(key)}
          >
            Discard this earlier input
          </Button>
        </section>
      ))}
    </details>
  );
  if (!finding.finding)
    return (
      <div className="space-y-5">
        {recovery}
        <p className="text-sm text-muted-foreground">
          A cited result is needed before a decision can be recorded.
        </p>
      </div>
    );
  return (
    <div className="space-y-5">
      {recovery}
      <section className="space-y-2">
        <h3 className="text-sm font-medium">Review decision</h3>
        <p className="text-sm capitalize">
          {finding.finding.outcome.replaceAll("_", " ")} ·{" "}
          {finding.disposition.replaceAll("_", " ")}
        </p>
        {finding.rationale && <p className="text-sm text-muted-foreground">{finding.rationale}</p>}
        {document.sourceChanged && (
          <p role="status" className="text-sm text-destructive">
            The source has changed outside this review. Start a review of the current version before
            proposing changes.
          </p>
        )}
      </section>
      <details className="text-sm">
        <summary className="cursor-pointer font-medium">Reviewed source and provenance</summary>
        <p className="mt-2 text-xs text-muted-foreground">
          Source version {document.reviewedVersionId ?? "text snapshot"} · finding{" "}
          {finding.finding.revisionId}. Quotations refer to this captured text.
        </p>
        <pre className="mt-3 max-h-72 overflow-auto font-serif text-sm leading-relaxed whitespace-pre-wrap">
          {document.reviewedText}
        </pre>
      </details>
      {document.canPropose && (
        <details className="space-y-3 border-t border-border pt-3">
          <summary className="cursor-pointer text-sm font-medium">Propose tracked change</summary>
          {!finding.finding.citationsValid && (
            <p role="status" className="text-sm text-destructive">
              The source evidence is inconclusive. A verified finding is required before proposing a
              redline.
            </p>
          )}
          {!document.editableDocx ? (
            <p className="text-sm text-muted-foreground">
              Tracked changes require an editable DOCX source. This format can be reviewed and
              included in a report.
            </p>
          ) : !finding.clauses.length ? (
            <p className="text-sm text-muted-foreground">
              This rule has no linked approved clause. Approve a Library clause and start a review
              using it.
            </p>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                <span>Approved clause</span>
                <NativeSelect
                  aria-label="Approved clause"
                  className="w-full"
                  value={clauseId}
                  disabled={busy}
                  onChange={(e) => {
                    editProposal({
                      clauseId: e.target.value,
                      clauseLabel: e.target.selectedOptions[0]?.textContent ?? "",
                    });
                  }}
                >
                  <NativeSelectOption value="">Choose standard or fallback</NativeSelectOption>
                  {finding.clauses.map((c) => (
                    <NativeSelectOption key={c.id} value={c.id}>
                      {c.title}
                    </NativeSelectOption>
                  ))}
                </NativeSelect>
              </label>
              {finding.finding.outcome !== "not_found" && (
                <label className="block space-y-1 text-sm">
                  <span>Original quoted language</span>
                  <NativeSelect
                    aria-label="Original quoted language"
                    className="w-full"
                    value={quote}
                    disabled={busy}
                    onChange={(e) => {
                      editProposal({ quote: e.target.value });
                    }}
                  >
                    <NativeSelectOption value="">Choose verified quotation</NativeSelectOption>
                    {cell?.citations?.map((citation, i) => (
                      <NativeSelectOption key={i} value={citation.quote}>
                        {citation.quote}
                      </NativeSelectOption>
                    ))}
                  </NativeSelect>
                </label>
              )}
              <label className="block space-y-1 text-sm">
                <span>
                  {finding.finding.outcome === "not_found"
                    ? "Insert after this exact source text"
                    : "Text immediately before the quote (if ambiguous)"}
                </span>
                <Textarea
                  aria-label={
                    finding.finding.outcome === "not_found"
                      ? "Insert after this exact source text"
                      : "Text immediately before the quote (if ambiguous)"
                  }
                  value={anchor}
                  disabled={busy}
                  onChange={(e) => {
                    editProposal({ anchor: e.target.value });
                  }}
                  placeholder="Copy the exact source text to select the location"
                />
              </label>
              {clause && (
                <div className="space-y-2">
                  {!!quote && (
                    <>
                      <p className="text-xs text-muted-foreground">Original quoted language</p>
                      <p className="font-serif text-sm leading-relaxed whitespace-pre-wrap">
                        {quote}
                      </p>
                    </>
                  )}
                  <p className="text-xs text-muted-foreground">
                    Replacement · approved revision {clause.revision}
                  </p>
                  <p className="font-serif text-sm leading-relaxed whitespace-pre-wrap">
                    {clause.body}
                  </p>
                </div>
              )}
              <Button
                size="sm"
                disabled={
                  busy ||
                  finding.disposition === "redline_proposed" ||
                  !finding.finding.citationsValid ||
                  document.sourceChanged ||
                  !clauseId ||
                  (finding.finding.outcome === "not_found" ? !anchor.trim() : !quote)
                }
                onClick={() => propose.mutate()}
              >
                {propose.isPending
                  ? "Proposing…"
                  : finding.disposition === "redline_proposed"
                    ? "Redline pending"
                    : "Propose redline"}
              </Button>
              <p className="text-xs text-muted-foreground">
                The edit remains pending until a person accepts or rejects it in the document.
              </p>
            </>
          )}
        </details>
      )}
      {canEscalate && (
        <section className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Decision rationale</span>
            <Textarea
              aria-label="Decision rationale"
              value={rationale}
              onChange={(e) => {
                const value = e.target.value;
                onDraftChange((current) => ({ ...current, rationale: value }));
              }}
              disabled={busy}
              placeholder="Explain leaving this language unchanged or the judgment needed"
              maxLength={4000}
            />
          </label>
          <div className="flex flex-wrap gap-2">
            <Button
              size="sm"
              variant="outline"
              disabled={busy || !rationale.trim() || !canDecide}
              onClick={() => decide.mutate("left_unchanged")}
            >
              Leave unchanged
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={busy || !rationale.trim()}
              onClick={() => decide.mutate("escalated")}
            >
              Escalate
            </Button>
          </div>
        </section>
      )}
      {(decide.error || propose.error) && (
        <p role="alert" className="text-sm text-destructive">
          {(decide.error ?? propose.error) instanceof Error
            ? (decide.error ?? propose.error)!.message
            : "Could not save this action"}
        </p>
      )}
      {(decide.isSuccess || propose.isSuccess) && (
        <p role="status" className="text-sm text-muted-foreground">
          Saved to the audit history.
        </p>
      )}
    </div>
  );
}

export function ContractReviewCompletion({
  completion,
  compact = false,
}: {
  completion: ReviewCompletion;
  compact?: boolean;
}) {
  const narrow = useMediaQuery("(max-width: 767px)");
  const [mobileOpen, setMobileOpen] = useState(false);
  const disclosure = narrow || compact;
  const content = (
    <>
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-sans text-sm font-semibold">Review completion</h2>
        <p className="text-sm text-muted-foreground">
          {completion.cleanReady
            ? "Ready for clean export"
            : completion.decisionsComplete
              ? "Review decisions complete"
              : "Decisions remain open"}
        </p>
        <a
          className="text-sm underline underline-offset-4"
          href={api.reviewReportUrl(completion.reviewId)}
        >
          Download review report
        </a>
      </div>
      <details className="text-xs text-muted-foreground">
        <summary className="cursor-pointer">Versions and export references</summary>
        <p className="mt-2 break-words">
          Playbook {completion.playbookId} · revision {completion.playbookRevision} · inputs
          captured {new Date(completion.capturedAt).toLocaleString()} · review commit{" "}
          {completion.reviewCommitId ?? "none"}. The report includes its own captured version
          manifest; a later document download captures its version separately.
        </p>
        <a
          className="mt-2 inline-block underline underline-offset-4"
          href={api.reviewReportManifestUrl(completion.reviewId)}
        >
          Open report data and manifest
        </a>
      </details>
      {completion.documents.map((doc) => (
        <div
          key={doc.documentId}
          className="flex flex-wrap items-center justify-between gap-3 py-1"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{doc.title}</p>
            <p className="text-xs text-muted-foreground">
              {doc.unfinished} rules unfinished · {doc.unresolved} findings open ·{" "}
              {doc.pendingEdits} pending edits · {doc.pendingApprovals} pending approvals
              {doc.sourceChanged ? " · source changed" : ""}
              {!doc.approvedBaselineReady ? " · accepted document baseline not current" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            {doc.editableDocx ? (
              <>
                <a
                  className="underline underline-offset-4"
                  href={`${api.documentDownloadUrl(doc.documentId)}?reviewId=${completion.reviewId}&output=tracked`}
                >
                  Draft redline
                </a>
                {doc.cleanReady ? (
                  <CleanReviewExport document={doc} completion={completion} />
                ) : (
                  <span className="text-muted-foreground">Clean export blocked</span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                {doc.fileType === "docx"
                  ? "Word output blocked by source inspection"
                  : "DOCX output requires a DOCX source"}
              </span>
            )}
          </div>
        </div>
      ))}
    </>
  );
  return (
    <section
      className="mb-4 shrink-0 space-y-2 border-b border-border pb-3"
      aria-label="Review completion"
    >
      <details
        open={!disclosure || mobileOpen}
        onToggle={(event) => {
          if (disclosure) setMobileOpen(event.currentTarget.open);
        }}
      >
        <summary className={disclosure ? "cursor-pointer text-xs text-muted-foreground" : "hidden"}>
          Review status and files ·{" "}
          {completion.cleanReady ? "Ready for clean export" : "Clean export blocked"}
        </summary>
        <div className={disclosure ? "mt-3 space-y-2" : "space-y-2"}>{content}</div>
      </details>
    </section>
  );
}

function CleanReviewExport({
  document,
  completion,
}: {
  document: ReviewDocument;
  completion: ReviewCompletion;
}) {
  const binding = JSON.stringify([
    document.documentId,
    document.currentVersionId,
    document.currentHeadCommitId,
    completion.reviewCommitId,
    completion.policyRevision,
  ]);
  const requestIds = useRef(new Map<string, string>());
  const [receipt, setReceipt] = useState<{
    binding: string;
    approvalRequired: boolean;
    proposalId: string | null;
  }>();
  const currentReceipt = receipt?.binding === binding ? receipt : undefined;
  const proposal = useQuery({
    queryKey: ["proposal", currentReceipt?.proposalId],
    enabled: !!currentReceipt?.proposalId,
    queryFn: () => api.getApprovalProposal(currentReceipt!.proposalId!),
    refetchInterval: (query) => (query.state.data?.status === "pending" ? 5000 : false),
  });
  const prepare = useMutation({
    mutationFn: () => {
      const requestId = requestIds.current.get(binding) ?? crypto.randomUUID();
      requestIds.current.set(binding, requestId);
      return api.requestCleanReviewExport(document.documentId, completion.reviewId, requestId);
    },
    onSuccess: (result) =>
      setReceipt({
        binding,
        approvalRequired: result.approvalRequired,
        proposalId: result.proposal?.id ?? null,
      }),
  });
  const permitted =
    currentReceipt &&
    (!currentReceipt.approvalRequired ||
      (proposal.data?.status === "applied" &&
        proposal.data.kind === "export" &&
        proposal.data.mayRetrieve &&
        !proposal.data.policyChanged &&
        !proposal.data.stale));
  const href = `${api.documentDownloadUrl(document.documentId)}?reviewId=${completion.reviewId}&output=clean${currentReceipt?.proposalId ? `&approvalId=${currentReceipt.proposalId}` : ""}`;
  return (
    <div className="space-y-2">
      {permitted ? (
        <a href={href} className="underline underline-offset-4">
          Download clean DOCX
        </a>
      ) : currentReceipt?.approvalRequired ? (
        <div className="space-y-1">
          <p className="text-xs text-muted-foreground">
            {proposal.data?.status === "pending"
              ? `Clean export awaits a human ${proposal.data.requiredRole} decision.`
              : proposal.data?.status === "applied"
                ? proposal.data.kind === "export" && !proposal.data.mayRetrieve
                  ? "This approval belongs to another requester. Prepare your own export request."
                  : "The approved export snapshot changed. Prepare a new request."
                : proposal.data
                  ? `Export request ${proposal.data.status}. Prepare a new request.`
                  : "Checking export approval…"}
          </p>
          <Link
            to="/matters/$id"
            params={{ id: completion.matterId }}
            search={{ tab: "activity" }}
            className="text-sm underline underline-offset-4"
          >
            Open export approval queue
          </Link>
          {proposal.data &&
            ((proposal.data.status !== "pending" && proposal.data.status !== "applied") ||
              proposal.data.policyChanged ||
              proposal.data.stale ||
              (proposal.data.kind === "export" && !proposal.data.mayRetrieve)) && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => {
                  requestIds.current.delete(binding);
                  setReceipt(undefined);
                  prepare.reset();
                }}
              >
                Prepare new request
              </Button>
            )}
        </div>
      ) : (
        <Button
          size="sm"
          variant="ghost"
          disabled={prepare.isPending}
          onClick={() => prepare.mutate()}
        >
          {prepare.isPending ? "Preparing…" : "Prepare clean DOCX"}
        </Button>
      )}
      {(prepare.error || proposal.error) && (
        <p role="alert" className="max-w-prose text-xs text-destructive">
          {(prepare.error ?? proposal.error) instanceof Error
            ? (prepare.error ?? proposal.error)!.message
            : "Export approval could not be checked."}
        </p>
      )}
      {prepare.error instanceof ApiError &&
        ["request_conflict", "stale_proposal", "policy_changed"].includes(
          prepare.error.code ?? ""
        ) && (
          <Button
            size="sm"
            variant="ghost"
            onClick={() => {
              requestIds.current.delete(binding);
              setReceipt(undefined);
              prepare.reset();
            }}
          >
            Prepare new request from current version
          </Button>
        )}
    </div>
  );
}
