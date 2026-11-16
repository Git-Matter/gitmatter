import { ApiError } from "./api";

/** Cached private data may survive an outage, never an authoritative access/data failure. */
export function canRetainSnapshotAfterError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch network failure
  return (
    error instanceof ApiError &&
    (error.status >= 500 || error.status === 408 || error.status === 429)
  );
}

type SnapshotQuery<T> = {
  data: T | undefined;
  error: unknown;
  isFetching: boolean;
  isFetchedAfterMount?: boolean;
};

export function readableSnapshot<T>(query: SnapshotQuery<T>): T | undefined {
  return query.error && !canRetainSnapshotAfterError(query.error) ? undefined : query.data;
}

export function snapshotIsCurrent(query: SnapshotQuery<unknown>): boolean {
  // Verify a cached record on entry; routine polling must not interrupt editing.
  return (
    query.data !== undefined &&
    !query.error &&
    (!query.isFetching || query.isFetchedAfterMount === true)
  );
}
