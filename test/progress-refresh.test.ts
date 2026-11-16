import { expect, test } from "vite-plus/test";
import { ApiError } from "../apps/web/src/lib/data/api";
import { canRetainSnapshotAfterError } from "../apps/web/src/lib/data/snapshot-refresh";

test("cached progress survives only identifiable temporary failures", () => {
  for (const status of [408, 429, 500, 502, 503])
    expect(canRetainSnapshotAfterError(new ApiError("Temporary", status))).toBe(true);
  expect(canRetainSnapshotAfterError(new TypeError("Failed to fetch"))).toBe(true);
  for (const status of [400, 401, 403, 404, 410, 422])
    expect(canRetainSnapshotAfterError(new ApiError("Access or data failure", status))).toBe(false);
  expect(canRetainSnapshotAfterError(new Error("Unknown failure"))).toBe(false);
  expect(canRetainSnapshotAfterError(null)).toBe(false);
});
