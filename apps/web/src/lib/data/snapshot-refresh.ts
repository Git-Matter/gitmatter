import { ApiError } from "./api";

/** Cached private data may survive an outage, never an authoritative access/data failure. */
export function canRetainSnapshotAfterError(error: unknown): boolean {
  if (error instanceof TypeError) return true; // fetch network failure
  return (
    error instanceof ApiError &&
    (error.status >= 500 || error.status === 408 || error.status === 429)
  );
}
