import type { ReactNode } from "react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";

type CollectionQuery = {
  data?: unknown;
  isPending: boolean;
  isFetching: boolean;
  isError: boolean;
  isPlaceholderData?: boolean;
  error: unknown;
  refetch: () => unknown;
};
export function collectionBlocked(query: CollectionQuery) {
  return query.isPending || query.isError || !!query.isPlaceholderData;
}
export function CollectionPanel({
  query,
  label,
  children,
}: {
  query: CollectionQuery;
  label: string;
  children: ReactNode;
}) {
  const status =
    query.error && typeof query.error === "object" && "status" in query.error
      ? query.error.status
      : undefined;
  const denied = status === 401 || status === 403;
  if (query.isPending)
    return (
      <div
        role="status"
        aria-label={`Loading ${label}`}
        className="flex min-h-0 flex-1 flex-col gap-3"
      >
        <Skeleton className="h-9 w-full" />
        <Skeleton className="h-48 w-full" />
        <span className="sr-only">Loading {label}…</span>
      </div>
    );
  const notice = query.isError ? (
    <Alert variant="destructive" role="alert">
      <AlertTitle>
        {denied ? `${label} access unavailable` : `${label} could not be refreshed`}
      </AlertTitle>
      <AlertDescription>
        <p>
          {denied
            ? "Your access could not be confirmed. Private records are hidden. Retry or return to another workspace section."
            : query.data
              ? "Previously loaded records are shown for reference. Actions are paused until a successful refresh."
              : "The records could not be loaded. This does not mean the collection is empty."}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry {label}
        </Button>
      </AlertDescription>
    </Alert>
  ) : query.isFetching ? (
    <p role="status" className="text-sm text-muted-foreground">
      {query.isPlaceholderData
        ? "Updating results for this view… Previous results are shown; actions are paused."
        : `Refreshing ${label}…`}
    </p>
  ) : null;
  return (
    <section
      aria-label={`${label} results`}
      aria-busy={query.isFetching}
      className="flex min-h-0 flex-1 flex-col gap-3"
    >
      {notice}
      {!denied && (!query.isError || !!query.data) && (
        <div inert={collectionBlocked(query)} className="flex min-h-0 flex-1 flex-col gap-3">
          {children}
        </div>
      )}
    </section>
  );
}
