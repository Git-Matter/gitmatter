import { Button } from "@/components/ui/button";
import { canRetainSnapshotAfterError } from "@/lib/data/snapshot-refresh";

type QueryState = {
  isPending: boolean;
  isError: boolean;
  error: unknown;
  refetch: () => unknown;
};

export function settingsSnapshotVisible(query: { data: unknown } & QueryState) {
  return query.data !== undefined && (!query.isError || canRetainSnapshotAfterError(query.error));
}

export function SettingsQueryNotice({ query, label }: { query: QueryState; label: string }) {
  if (!query.isPending && !query.isError) return null;
  return (
    <div role="status" className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
      <p>
        {query.isPending
          ? `Loading ${label}…`
          : `${label} could not be checked. Changes are unavailable until this check succeeds.`}
      </p>
      {query.isError && (
        <Button variant="outline" size="sm" onClick={() => void query.refetch()}>
          Retry {label}
        </Button>
      )}
    </div>
  );
}
