import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ActorBadge } from "@/components/ActorBadge";
import { api, type Cell, type ReviewCompletion } from "@/lib/data/api";
import { ContractReviewActions } from "./ContractReviewActions";
import { WordInspectionNotice } from "@/routes/_auth/documents/-components/WordInspectionNotice";

/** Keep legal text and the selected rule together, including on small screens. */
export function ContractReviewWorkspace({
  completion,
  cells,
  initialFindingId,
  onOpenDraft,
  onRetry,
  retrying,
  canRetry = true,
}: {
  completion: ReviewCompletion;
  cells: Cell[];
  initialFindingId?: string;
  onOpenDraft: (documentId: string) => void;
  onRetry: (acknowledgeUnknown: boolean) => void;
  retrying: boolean;
  canRetry?: boolean;
}) {
  const initial = cells.find((cell) => cell.id === initialFindingId);
  const [documentId, setDocumentId] = useState(initial?.documentId);
  const [columnIndex, setColumnIndex] = useState(initial?.columnIndex);
  const [mobilePane, setMobilePane] = useState<"document" | "findings">("findings");
  const [quote, setQuote] = useState("");
  useEffect(() => {
    if (initial) {
      setDocumentId(initial.documentId);
      setColumnIndex(initial.columnIndex);
      setMobilePane("findings");
    }
  }, [initialFindingId, initial?.documentId, initial?.columnIndex]);
  const [acknowledgeUnknown, setAcknowledgeUnknown] = useState(false);
  const jobs = useQuery({
    queryKey: ["review-jobs", completion.reviewId],
    queryFn: () => api.listReviewJobs(completion.reviewId),
    refetchInterval: 5000,
  });
  const unknownOutcome =
    jobs.data?.some(
      (job) => job.state === "failed" && job.errorCode === "provider_outcome_unknown"
    ) ?? false;
  const quoteRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (quote && mobilePane === "document")
      quoteRef.current?.scrollIntoView({ block: "center", behavior: "instant" });
  }, [quote, mobilePane]);
  const document =
    completion.documents.find((doc) => doc.documentId === documentId) ?? completion.documents[0];
  const selected =
    document?.findings.find((finding) => finding.columnIndex === columnIndex) ??
    document?.findings[0];
  const cell = cells.find(
    (item) => item.documentId === document?.documentId && item.columnIndex === selected?.columnIndex
  );
  if (!document)
    return <p className="py-6 text-sm text-muted-foreground">No review sources are available.</p>;
  const quoteIndex = quote ? document.reviewedText.indexOf(quote) : -1;
  const failed = cells.filter((item) => item.status === "error").length;
  function openQuote(nextQuote: string) {
    setQuote(nextQuote);
    setMobilePane("document");
  }
  return (
    <section className="space-y-4" aria-label="Contract review workspace">
      <details className="rounded-md border border-border p-3 text-sm">
        <summary className="cursor-pointer font-medium">Captured review instructions</summary>
        {completion.reviewInstructions ? (
          <dl className="mt-3 grid gap-2 sm:grid-cols-[auto_1fr]">
            <dt>Party we represent</dt>
            <dd className="break-words whitespace-pre-wrap">
              {completion.reviewInstructions.representedParty ?? "Unknown or not instructed"}
            </dd>
            <dt>Disclosure role</dt>
            <dd>{completion.reviewInstructions.disclosureRole}</dd>
            <dt>NDA structure</dt>
            <dd>{completion.reviewInstructions.ndaStructure}</dd>
            <dt>Business purpose</dt>
            <dd className="break-words whitespace-pre-wrap">
              {completion.reviewInstructions.businessPurpose ?? "Unknown or not instructed"}
            </dd>
            <dt>Governing law context</dt>
            <dd className="break-words whitespace-pre-wrap">
              {completion.reviewInstructions.governingLaw ?? "Unknown or not instructed"}
            </dd>
            {completion.reviewInstructions.additionalInstructions && (
              <>
                <dt>Additional instructions</dt>
                <dd className="break-words whitespace-pre-wrap">
                  {completion.reviewInstructions.additionalInstructions}
                </dd>
              </>
            )}
          </dl>
        ) : (
          <p className="mt-3 text-muted-foreground">
            No instructions were captured for this review. Party, role, structure, business purpose
            and governing law remain unknown.
          </p>
        )}
        <p className="mt-3 text-muted-foreground">
          These inputs are fixed for this review. Prepare a new review to change instructions;
          approved positions and permissions still apply.
        </p>
      </details>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <label className="flex min-w-0 items-center gap-2 text-sm">
          <span className="shrink-0 font-medium">Document</span>
          <select
            className="h-9 min-w-0 rounded-md border border-input bg-background px-2"
            value={document.documentId}
            onChange={(event) => {
              setDocumentId(event.target.value);
              setColumnIndex(undefined);
              setQuote("");
            }}
          >
            {completion.documents.map((doc) => (
              <option key={doc.documentId} value={doc.documentId}>
                {doc.title}
              </option>
            ))}
          </select>
        </label>
        {failed > 0 && completion.canEscalate && (
          <Button
            size="sm"
            variant="outline"
            disabled={
              !canRetry ||
              retrying ||
              jobs.isPending ||
              !!jobs.error ||
              (unknownOutcome && !acknowledgeUnknown)
            }
            onClick={() => onRetry(acknowledgeUnknown)}
          >
            {retrying ? "Queuing retry…" : `Retry ${failed} failed rule${failed === 1 ? "" : "s"}`}
          </Button>
        )}
      </div>
      {document.fileType === "docx" && (
        <div className="flex flex-col gap-2">
          {document.reviewedVersionId !== document.currentVersionId && (
            <p className="text-sm text-muted-foreground">
              This inspection describes the current draft. Findings and quotations remain bound to
              the version captured for this review.
            </p>
          )}
          <WordInspectionNotice inspection={document.wordInspection} />
        </div>
      )}
      {unknownOutcome && (
        <label className="flex max-w-prose items-start gap-2 text-sm">
          <input
            type="checkbox"
            className="mt-1 size-4 accent-primary"
            checked={acknowledgeUnknown}
            onChange={(event) => setAcknowledgeUnknown(event.target.checked)}
          />
          <span>
            A previous provider outcome is unknown. I understand that retrying may incur another
            charge and its earlier estimated spend remains held.
          </span>
        </label>
      )}
      {failed > 0 && jobs.error && (
        <p role="alert" className="text-sm text-destructive">
          Retry status could not be verified.{" "}
          <button className="underline underline-offset-4" onClick={() => void jobs.refetch()}>
            Reload job status
          </button>
        </p>
      )}
      <div className="flex gap-2 lg:hidden" aria-label="Review view">
        <Button
          size="sm"
          variant={mobilePane === "document" ? "secondary" : "ghost"}
          aria-pressed={mobilePane === "document"}
          onClick={() => setMobilePane("document")}
        >
          Document
        </Button>
        <Button
          size="sm"
          variant={mobilePane === "findings" ? "secondary" : "ghost"}
          aria-pressed={mobilePane === "findings"}
          onClick={() => setMobilePane("findings")}
        >
          Findings
        </Button>
      </div>
      <div className="grid min-w-0 gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(320px,0.85fr)]">
        <section
          className={`${mobilePane === "document" ? "block" : "hidden"} min-w-0 lg:block`}
          aria-label="Reviewed document"
        >
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="font-serif text-xl">Reviewed source</h2>
            <div className="flex flex-wrap gap-3 text-xs">
              {document.reviewedVersionId && (
                <a
                  className="underline underline-offset-4"
                  href={api.versionDownloadUrl(document.documentId, document.reviewedVersionId)}
                >
                  Download reviewed version
                </a>
              )}
              <button
                className="underline underline-offset-4"
                onClick={() => onOpenDraft(document.documentId)}
              >
                Preview current draft
              </button>
              {document.pendingEdits > 0 && (
                <Link
                  to="/documents/$id"
                  params={{ id: document.documentId }}
                  className="underline underline-offset-4"
                >
                  Resolve tracked changes
                </Link>
              )}
            </div>
          </div>
          {(document.sourceChanged || document.reviewedVersionId !== document.currentVersionId) && (
            <p role="status" className="mb-4 max-w-prose text-sm text-muted-foreground">
              This is the source captured when the review started. The current draft is a different
              version.
              {document.sourceChanged
                ? " Its changes require a new review before another proposal."
                : " Tracked changes are shown in the current draft."}
            </p>
          )}
          {quote && quoteIndex === -1 && (
            <p role="status" className="mb-3 text-sm text-muted-foreground">
              The quotation is shown in the finding. Its formatting differs from the captured text,
              so no exact location is highlighted.
            </p>
          )}
          <div
            className="max-h-[68vh] overflow-y-auto rounded-xl bg-card p-5 shadow-sm sm:p-7"
            tabIndex={0}
            aria-label="Captured source text"
          >
            <p className="max-w-[70ch] font-serif text-base leading-relaxed break-words whitespace-pre-wrap">
              {quoteIndex >= 0 ? (
                <>
                  {document.reviewedText.slice(0, quoteIndex)}
                  <mark ref={quoteRef} className="rounded-sm bg-bronze-tint text-foreground">
                    {document.reviewedText.slice(quoteIndex, quoteIndex + quote.length)}
                  </mark>
                  {document.reviewedText.slice(quoteIndex + quote.length)}
                </>
              ) : (
                document.reviewedText
              )}
            </p>
          </div>
        </section>
        <section
          className={`${mobilePane === "findings" ? "block" : "hidden"} min-w-0 space-y-5 lg:block`}
          aria-label="Findings and decisions"
        >
          <div>
            <h2 className="mb-3 font-serif text-xl">Findings</h2>
            <div className="flex max-h-52 flex-col overflow-y-auto">
              {document.findings.map((finding) => {
                const result = cells.find(
                  (item) =>
                    item.documentId === document.documentId &&
                    item.columnIndex === finding.columnIndex
                );
                return (
                  <button
                    key={finding.ruleId}
                    aria-pressed={selected?.columnIndex === finding.columnIndex}
                    className={`rounded-md px-3 py-2 text-left transition-colors hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring ${selected?.columnIndex === finding.columnIndex ? "bg-muted" : ""}`}
                    onClick={() => {
                      setColumnIndex(finding.columnIndex);
                      setQuote("");
                      void fetch(
                        `/api/tabular/reviews/${completion.reviewId}/findings/${document.documentId}/${finding.columnIndex}/opened`,
                        { method: "POST" }
                      ).catch(() => {});
                    }}
                  >
                    <span className="block text-sm font-medium">{finding.name}</span>
                    <span className="mt-0.5 block text-xs text-muted-foreground">
                      {finding.severity === "red" ? "High risk" : "Negotiable"} ·{" "}
                      {result?.status === "error"
                        ? "Rule failed"
                        : result?.status === "generating"
                          ? "Running"
                          : (finding.finding?.outcome.replaceAll("_", " ") ??
                            "Awaiting result")}{" "}
                      · {finding.disposition.replaceAll("_", " ")}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
          {selected && (
            <div className="space-y-5 border-t border-border pt-5">
              <h3 className="text-base font-semibold">{selected.name}</h3>
              <details className="text-sm">
                <summary className="cursor-pointer font-medium">Firm standard position</summary>
                <p className="mt-2 leading-relaxed whitespace-pre-wrap">
                  {selected.standardPosition}
                </p>
              </details>
              {cell?.status === "error" && (
                <p role="status" className="text-sm text-destructive">
                  This rule failed. Completed findings remain available. Retry failed rules to
                  continue from the same captured inputs.
                </p>
              )}
              {cell?.content && (
                <>
                  <p className="text-sm leading-relaxed whitespace-pre-wrap">
                    {cell.content.summary}
                  </p>
                  {cell.content.reasoning && (
                    <p className="text-sm leading-relaxed whitespace-pre-wrap text-muted-foreground">
                      {cell.content.reasoning}
                    </p>
                  )}
                </>
              )}
              {!!cell?.citations?.length && (
                <section className="space-y-2">
                  <h4 className="text-sm font-medium">
                    {selected.finding?.citationsValid === false
                      ? "Unverified quotations"
                      : "Source quotations"}
                  </h4>
                  {selected.finding?.citationsValid === false && (
                    <p className="text-sm text-destructive">
                      Citation validation failed. These quotations have not been verified against
                      the captured source.
                    </p>
                  )}
                  {cell.citations.map((citation, index) => (
                    <button
                      key={index}
                      className="block w-full rounded-md bg-muted px-3 py-3 text-left hover:bg-bronze-tint/40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
                      onClick={() => openQuote(citation.quote)}
                      disabled={selected.finding?.citationsValid === false}
                    >
                      <span className="block font-serif text-sm leading-relaxed">
                        “{citation.quote}”
                      </span>
                      <span className="mt-2 block text-xs text-muted-foreground">
                        {selected.finding?.citationsValid === false
                          ? "Unverified against reviewed source"
                          : "Locate in reviewed source"}
                      </span>
                    </button>
                  ))}
                </section>
              )}
              {selected.finding?.outcome === "not_found" && (
                <p className="text-sm text-muted-foreground">
                  This rule searched the captured source and found no matching provision. No
                  supporting quotation exists; an insertion requires an exact source anchor.
                </p>
              )}
              {cell?.blame && (
                <details className="text-xs">
                  <summary className="cursor-pointer font-medium">
                    Who produced this finding
                  </summary>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <ActorBadge
                      actorType={cell.blame.actorType}
                      agentLabel={cell.blame.agentLabel}
                      actorId={cell.blame.actorId}
                      actorName={cell.blame.actorName}
                    />
                    <span>
                      Commit {cell.blame.id} · {new Date(cell.blame.createdAt).toLocaleString()}
                    </span>
                  </div>
                </details>
              )}
              <ContractReviewActions
                key={`${document.documentId}:${selected.finding?.revisionId ?? selected.columnIndex}`}
                reviewId={completion.reviewId}
                document={document}
                finding={selected}
                cell={cell}
                canDecide={completion.canDecide}
                canEscalate={completion.canEscalate}
                policyRevision={completion.policyRevision}
              />
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
