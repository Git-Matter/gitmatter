import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { readableSnapshot, snapshotIsCurrent } from "@/lib/data/snapshot-refresh";

/** Detail pages retain readable outage snapshots while pausing dependent actions. */
export function SnapshotNotice({
  query,
  label,
}: {
  query: {
    data: unknown;
    error: unknown;
    isFetching: boolean;
    isFetchedAfterMount?: boolean;
    refetch: () => unknown;
  };
  label: string;
}) {
  if (!query.error)
    return query.isFetching && query.data !== undefined && !snapshotIsCurrent(query) ? (
      <p role="status" className="text-sm text-muted-foreground">
        Refreshing {label.toLowerCase()}… Actions are paused until the refresh completes.
      </p>
    ) : null;
  const retained = readableSnapshot(query) !== undefined;
  return (
    <Alert variant="destructive" role="alert">
      <AlertTitle>
        {label} {retained ? "could not be refreshed" : "unavailable"}
      </AlertTitle>
      <AlertDescription>
        <p>
          {retained
            ? "Previously loaded information and unfinished input are retained. Actions are paused until a successful refresh."
            : "This information could not be loaded or your access could not be confirmed. Private content is hidden."}
        </p>
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry {label.toLowerCase()}
        </Button>
      </AlertDescription>
    </Alert>
  );
}
