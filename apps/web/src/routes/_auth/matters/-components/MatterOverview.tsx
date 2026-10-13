import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "@/lib/data/api";
import { formatShortDate } from "@/lib/format/format";

export function MatterOverview({
  matterId,
  canEdit,
  onOpenApprovals,
  onOpenUsage,
  onOpenDocuments,
}: {
  matterId: string;
  canEdit: boolean;
  onOpenApprovals: () => void;
  onOpenUsage: () => void;
  onOpenDocuments: () => void;
}) {
  const qc = useQueryClient();
  const [eventCursor, setEventCursor] = useState<string>();
  const events = useQuery({
    queryKey: ["matter-job-events", matterId, eventCursor],
    queryFn: () => api.getMatterJobEvents(matterId, eventCursor),
    refetchInterval: eventCursor ? false : 10000,
  });
  const markRead = useMutation({
    mutationFn: (id: string) => api.markJobEventRead(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matter-job-events", matterId] });
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Update could not be marked read"),
  });
  const reviews = useQuery({ queryKey: ["reviews"], queryFn: () => api.listReviews() });
  const recent = (reviews.data ?? [])
    .filter((review) => review.matterId === matterId)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 5);
  const completions = useQueries({
    queries: recent.map((review) => ({
      queryKey: ["review-completion", review.id],
      queryFn: () => api.getReviewCompletion(review.id),
      refetchInterval: 10000,
    })),
  });
  const jobs = useQuery({
    queryKey: ["matter-jobs", matterId],
    queryFn: () => api.getMatterJobs(matterId),
    refetchInterval: (query) =>
      query.state.data &&
      (query.state.data.counts.queued > 0 || query.state.data.counts.running > 0)
        ? 3000
        : 10000,
  });
  const proposals = useQuery({
    queryKey: ["matter-pending-proposals", matterId],
    queryFn: () => api.getMatterPendingProposals(matterId),
    refetchInterval: 10000,
  });
  const usage = useQuery({
    queryKey: ["matter-usage", matterId],
    queryFn: () => api.getMatterUsage(matterId),
  });
  const retry = useMutation({
    mutationFn: (id: string) => api.retryJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matter-jobs", matterId] });
      toast.success("Job queued for retry");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Retry failed"),
  });
  const cancel = useMutation({
    mutationFn: (id: string) => api.cancelJob(id),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["matter-jobs", matterId] });
      toast.success("Cancellation requested");
    },
    onError: (error) => toast.error(error instanceof Error ? error.message : "Cancellation failed"),
  });
  const escalations = completions.flatMap(
    (query) =>
      query.data?.documents.flatMap((document) =>
        document.findings
          .filter((finding) => finding.disposition === "escalated")
          .map((finding) => ({ reviewId: query.data!.reviewId, document: document.title, finding }))
      ) ?? []
  );
  const failures = jobs.data?.jobs.filter((job) => job.state === "failed") ?? [];
  const active =
    jobs.data?.jobs.filter((job) => job.state === "running" || job.state === "queued") ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-8 overflow-y-auto pb-6">
      <section className="space-y-3" aria-label="Work needing attention">
        <h2 className="font-serif text-xl">Needs attention</h2>
        {proposals.isPending || jobs.isPending ? <Skeleton className="h-16 w-full" /> : null}
        {proposals.error && (
          <p role="alert" className="text-sm text-destructive">
            Approval status could not be loaded. Open Agent activity to retry.
          </p>
        )}
        {jobs.error && (
          <p role="alert" className="text-sm text-destructive">
            Job status could not be loaded.{" "}
            <button className="underline underline-offset-4" onClick={() => void jobs.refetch()}>
              Retry loading
            </button>
          </p>
        )}
        {!!proposals.data?.items.length && (
          <div className="flex flex-wrap items-center justify-between gap-3 py-2">
            <p className="text-sm">
              {proposals.data.items.length}
              {proposals.data.nextCursor ? "+" : ""} agent proposals await a human decision.
            </p>
            <Button size="sm" variant="outline" onClick={onOpenApprovals}>
              Review proposals
            </Button>
          </div>
        )}
        {failures.slice(0, 5).map((job) => (
          <div
            key={job.id}
            className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {job.kind === "document_extraction" ? "Document extraction" : "Review rule"} failed
              </p>
              <p className="text-xs text-muted-foreground">
                {job.errorCode?.replaceAll("_", " ") ?? "Job failed"} · attempt {job.attempts} of{" "}
                {job.maxAttempts}
                {job.usage?.uncertainAttempts
                  ? " · provider outcome uncertain; estimated spend remains held"
                  : ""}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="ghost"
                onClick={job.kind === "document_extraction" ? onOpenDocuments : undefined}
                render={
                  job.kind === "review_cell" ? (
                    <Link to="/reviews/$id" params={{ id: job.artifactId }} />
                  ) : undefined
                }
              >
                Open work
              </Button>
              {canEdit &&
                job.attempts < job.maxAttempts &&
                job.errorCode !== "provider_outcome_unknown" &&
                job.errorCode !== "stale_source" && (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={retry.isPending}
                    onClick={() => retry.mutate(job.id)}
                  >
                    Retry job
                  </Button>
                )}
            </div>
          </div>
        ))}
        {escalations.map(({ reviewId, document, finding }) => (
          <Link
            key={`${reviewId}:${finding.cellId}`}
            to="/reviews/$id"
            params={{ id: reviewId }}
            search={{ finding: finding.cellId ?? undefined }}
            className="block rounded-md py-2 text-sm hover:bg-muted focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring"
          >
            <span className="font-medium">{finding.name}</span> · escalated
            <span className="mt-1 block text-xs text-muted-foreground">
              {document}
              {finding.rationale ? ` · ${finding.rationale}` : ""}
            </span>
          </Link>
        ))}
        {!escalations.length && completions.some((query) => query.error) && (
          <p className="text-sm text-muted-foreground">
            Some recent review decisions could not be loaded. Open a review to check its completion.
          </p>
        )}
        {!proposals.isPending &&
          !jobs.isPending &&
          !proposals.error &&
          !jobs.error &&
          !proposals.data?.items.length &&
          !completions.some((query) => query.isPending || query.error) &&
          !failures.length &&
          !escalations.length && (
            <p className="text-sm text-muted-foreground">
              No pending proposals, failed jobs, or escalations in the five most recent reviews.
            </p>
          )}
        {!!jobs.data?.counts.failed && jobs.data.counts.failed > Math.min(failures.length, 5) && (
          <p className="text-xs text-muted-foreground">
            {jobs.data.counts.failed} failed jobs in the returned matter history. The most recent
            jobs are shown here.
          </p>
        )}
        {jobs.data?.truncated && (
          <p className="text-xs text-muted-foreground">
            Job status covers the 1,000 most recent jobs. Older jobs are outside this overview.
          </p>
        )}
      </section>
      {events.error && (
        <p role="alert" className="text-sm text-destructive">
          Background updates could not be loaded.{" "}
          <button className="underline underline-offset-4" onClick={() => void events.refetch()}>
            Retry loading updates
          </button>
        </p>
      )}
      {!!events.data?.events.length && (
        <section className="space-y-3" aria-label="Background updates">
          <h2 className="font-serif text-xl">Background updates</h2>
          <ul className="space-y-2">
            {events.data.events.map((event) => (
              <li
                key={event.id}
                className="flex flex-wrap items-center justify-between gap-3 border-b border-border py-2"
              >
                <div className="min-w-0">
                  <p className={`text-sm ${event.read ? "text-muted-foreground" : "font-medium"}`}>
                    {event.job.kind === "document_extraction"
                      ? "Document extraction"
                      : "Review rule"}{" "}
                    · {event.job.state}
                    {!event.read ? " · unread" : ""}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {new Date(event.createdAt).toLocaleString()}
                    {event.job.errorCode ? ` · ${event.job.errorCode.replaceAll("_", " ")}` : ""}
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={event.job.kind === "document_extraction" ? onOpenDocuments : undefined}
                    render={
                      event.job.kind === "review_cell" ? (
                        <Link to="/reviews/$id" params={{ id: event.job.artifactId }} />
                      ) : undefined
                    }
                  >
                    Open work
                  </Button>
                  {!event.read && (
                    <Button
                      size="sm"
                      variant="ghost"
                      disabled={markRead.isPending}
                      onClick={() => markRead.mutate(event.id)}
                    >
                      Mark read
                    </Button>
                  )}
                </div>
              </li>
            ))}
          </ul>
          <div className="flex gap-3">
            {eventCursor && (
              <Button size="sm" variant="ghost" onClick={() => setEventCursor(undefined)}>
                Latest updates
              </Button>
            )}
            {events.data.nextCursor && (
              <Button
                size="sm"
                variant="ghost"
                onClick={() => setEventCursor(events.data!.nextCursor!)}
              >
                Older updates
              </Button>
            )}
          </div>
        </section>
      )}
      <section className="space-y-3" aria-label="Recent reviews">
        <h2 className="font-serif text-xl">Recent reviews</h2>
        {reviews.isPending && <Skeleton className="h-16 w-full" />}
        {reviews.error && (
          <p role="alert" className="text-sm text-destructive">
            Reviews could not be loaded.{" "}
            <button className="underline underline-offset-4" onClick={() => void reviews.refetch()}>
              Retry loading
            </button>
          </p>
        )}
        {recent.map((review, index) => (
          <Link
            key={review.id}
            to="/reviews/$id"
            params={{ id: review.id }}
            className="flex flex-wrap items-baseline justify-between gap-2 border-b border-border py-3 hover:text-bronze"
          >
            <span className="text-sm font-medium">{review.title}</span>
            <span className="text-xs text-muted-foreground">
              {completions[index]?.data
                ? completions[index].data!.cleanReady
                  ? "Ready for clean export"
                  : `${completions[index].data!.documents.reduce((total, doc) => total + doc.unresolved, 0)} findings open`
                : "Open to inspect"}{" "}
              · {formatShortDate(review.createdAt)}
            </span>
          </Link>
        ))}
        {!reviews.isPending && !reviews.error && !recent.length && (
          <p className="text-sm text-muted-foreground">
            No reviews yet. Choose Review contract to run an approved playbook on a matter document.
          </p>
        )}
      </section>
      {!!active.length && (
        <section className="space-y-3" aria-label="Background work">
          <h2 className="font-serif text-xl">Work in progress</h2>
          {active.slice(0, 5).map((job) => (
            <div key={job.id} className="flex flex-wrap items-center justify-between gap-3 py-2">
              <p className="text-sm">
                {job.kind === "document_extraction" ? "Extracting document" : "Reviewing rule"} ·{" "}
                {job.state} · {job.completed}/{job.total} units
              </p>
              {canEdit && (
                <Button
                  size="sm"
                  variant="ghost"
                  disabled={cancel.isPending || !!job.cancellationRequestedAt}
                  onClick={() => cancel.mutate(job.id)}
                >
                  {job.cancellationRequestedAt ? "Cancellation requested" : "Cancel job"}
                </Button>
              )}
            </div>
          ))}
        </section>
      )}
      <section className="space-y-2" aria-label="Matter spend">
        <h2 className="font-serif text-xl">Recorded AI usage</h2>
        {usage.data ? (
          <p className="max-w-prose text-sm text-muted-foreground">
            {usage.data.totals.llmCalls.toLocaleString()} recorded completions ·{" "}
            {(usage.data.totals.inputTokens + usage.data.totals.outputTokens).toLocaleString()}{" "}
            tokens
            {usage.data.totals.costUsd === null
              ? " · model price unavailable"
              : ` · estimated $${usage.data.totals.costUsd.toFixed(2)} USD`}
            . Estimates use list prices and do not represent provider invoices.
          </p>
        ) : (
          <p className="text-sm text-muted-foreground">
            {usage.error ? "Usage could not be loaded." : "Loading recorded usage…"}
          </p>
        )}
        {jobs.data && (jobs.data.spend.heldTokens > 0 || jobs.data.spend.unpricedAttempts > 0) && (
          <p className="max-w-prose text-xs text-muted-foreground">
            Durable review reservations: {jobs.data.spend.heldTokens.toLocaleString()} held token
            estimate · estimated ${jobs.data.spend.heldEstimatedUsd.toFixed(2)} USD held
            {jobs.data.spend.unpricedAttempts > 0
              ? ` · ${jobs.data.spend.unpricedAttempts} attempts without a known price`
              : ""}
            . Uncertain provider outcomes remain held.
          </p>
        )}
        <Button size="sm" variant="ghost" onClick={onOpenUsage}>
          View usage breakdown
        </Button>
      </section>
    </div>
  );
}
