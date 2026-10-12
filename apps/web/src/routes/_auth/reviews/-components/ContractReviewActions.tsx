import { useRef, useState } from "react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { api, type Cell, type ReviewCompletion } from "@/lib/data/api";

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
}: {
  reviewId: string;
  document: ReviewDocument;
  finding: ReviewFinding;
  cell?: Cell;
  canDecide: boolean;
  canEscalate: boolean;
  policyRevision: number;
}) {
  const qc = useQueryClient();
  const [clauseId, setClauseId] = useState("");
  const [quote, setQuote] = useState("");
  const [anchor, setAnchor] = useState("");
  const [rationale, setRationale] = useState("");
  const requestId = useRef(crypto.randomUUID());
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: ["review", reviewId] });
    void qc.invalidateQueries({ queryKey: ["review-completion", reviewId] });
    void qc.invalidateQueries({ queryKey: ["review-history", reviewId] });
    void qc.invalidateQueries({ queryKey: ["document", document.documentId] });
  };
  const decide = useMutation({
    mutationFn: (status: "left_unchanged" | "escalated") =>
      api.setFindingDisposition(reviewId, {
        documentId: document.documentId,
        columnIndex: finding.columnIndex,
        revisionId: finding.finding!.revisionId,
        status,
        rationale,
        policyRevision,
      }),
    onSuccess: refresh,
  });
  const propose = useMutation({
    mutationFn: () =>
      api.proposeFindingRedline(reviewId, {
        requestId: requestId.current,
        documentId: document.documentId,
        columnIndex: finding.columnIndex,
        revisionId: finding.finding!.revisionId,
        expectedHeadCommitId: document.currentHeadCommitId,
        clauseId,
        find: quote,
        contextBefore: anchor || undefined,
      }),
    onSuccess: refresh,
  });
  const clause = finding.clauses.find((c) => c.id === clauseId);
  const busy = decide.isPending || propose.isPending;
  if (!finding.finding)
    return (
      <p className="text-sm text-muted-foreground">
        A cited result is needed before a decision can be recorded.
      </p>
    );
  return (
    <div className="space-y-5">
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
        <section className="space-y-3">
          <h3 className="text-sm font-medium">Propose tracked change</h3>
          {!finding.clauses.length ? (
            <p className="text-sm text-muted-foreground">
              This rule has no linked approved clause. Approve a Library clause and start a review
              using it.
            </p>
          ) : (
            <>
              <label className="block space-y-1 text-sm">
                <span>Approved clause</span>
                <select
                  className="h-9 w-full rounded-md border border-input bg-background px-2"
                  value={clauseId}
                  disabled={busy}
                  onChange={(e) => {
                    setClauseId(e.target.value);
                    requestId.current = crypto.randomUUID();
                  }}
                >
                  <option value="">Choose standard or fallback</option>
                  {finding.clauses.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.title}
                    </option>
                  ))}
                </select>
              </label>
              {finding.finding.outcome !== "not_found" && (
                <label className="block space-y-1 text-sm">
                  <span>Original quoted language</span>
                  <select
                    className="h-9 w-full rounded-md border border-input bg-background px-2"
                    value={quote}
                    disabled={busy}
                    onChange={(e) => {
                      setQuote(e.target.value);
                      requestId.current = crypto.randomUUID();
                    }}
                  >
                    <option value="">Choose verified quotation</option>
                    {cell?.citations?.map((citation, i) => (
                      <option key={i} value={citation.quote}>
                        {citation.quote}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <label className="block space-y-1 text-sm">
                <span>
                  {finding.finding.outcome === "not_found"
                    ? "Insert after this exact source text"
                    : "Text immediately before the quote (if ambiguous)"}
                </span>
                <Textarea
                  value={anchor}
                  disabled={busy}
                  onChange={(e) => {
                    setAnchor(e.target.value);
                    requestId.current = crypto.randomUUID();
                  }}
                  placeholder="Copy the exact source text to select the location"
                />
              </label>
              {clause && (
                <div className="space-y-2">
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
                  document.sourceChanged ||
                  !clauseId ||
                  (finding.finding.outcome === "not_found" ? !anchor.trim() : !quote)
                }
                onClick={() => propose.mutate()}
              >
                {propose.isPending ? "Proposing…" : "Propose redline"}
              </Button>
              <p className="text-xs text-muted-foreground">
                The edit remains pending until a person accepts or rejects it in the document.
              </p>
            </>
          )}
        </section>
      )}
      {canEscalate && (
        <section className="space-y-3">
          <label className="block space-y-1 text-sm">
            <span className="font-medium">Decision rationale</span>
            <Textarea
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
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

export function ContractReviewCompletion({ completion }: { completion: ReviewCompletion }) {
  return (
    <section className="mb-6 space-y-3" aria-label="Review completion">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="font-serif text-xl">Review completion</h2>
        <p className="text-sm text-muted-foreground">
          {completion.cleanReady ? "Ready for clean export" : "Decisions remain open"}
        </p>
      </div>
      {completion.documents.map((doc) => (
        <div
          key={doc.documentId}
          className="flex flex-wrap items-center justify-between gap-3 py-2"
        >
          <div className="min-w-0">
            <p className="truncate text-sm font-medium">{doc.title}</p>
            <p className="text-xs text-muted-foreground">
              {doc.unfinished} rules unfinished · {doc.unresolved} findings open ·{" "}
              {doc.pendingEdits} pending edits · {doc.pendingApprovals} pending approvals
              {doc.sourceChanged ? " · source changed" : ""}
            </p>
          </div>
          <div className="flex flex-wrap gap-3 text-sm">
            <a
              className="underline underline-offset-4"
              href={`${api.documentDownloadUrl(doc.documentId)}?reviewId=${completion.reviewId}&output=draft`}
            >
              Draft redline
            </a>
            {doc.cleanReady ? (
              <a
                className="underline underline-offset-4"
                href={`${api.documentDownloadUrl(doc.documentId)}?reviewId=${completion.reviewId}&output=clean`}
              >
                Clean DOCX
              </a>
            ) : (
              <span className="text-muted-foreground">Clean export blocked</span>
            )}
          </div>
        </div>
      ))}
    </section>
  );
}
