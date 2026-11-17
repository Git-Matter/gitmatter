import { expect, test } from "vite-plus/test";
import { safeLoginNext } from "./redirect.js";
test("MFA preserves in-app return paths and rejects off-site redirects", () => {
  expect(safeLoginNext("/matters/example?tab=documents")).toBe("/matters/example?tab=documents");
  for (const next of [
    undefined,
    "https://example.com",
    "//example.com",
    "/\\example.com",
    "/\n/example.com",
    "javascript:alert(1)",
  ])
    expect(safeLoginNext(next)).toBe("/assistant");
});
