import { beforeEach, describe, expect, test, vi } from "vite-plus/test";
import { readinessResponse } from "./health.js";

const query = vi.hoisted(() => vi.fn(async () => []));
vi.mock("@workspace/db/client", () => ({ sql: query }));

describe("public web readiness metadata", () => {
  beforeEach(() => query.mockReset().mockResolvedValue([]));

  test("a healthy response includes the observed release and forbids caching", async () => {
    const release = "a".repeat(40);
    const response = await readinessResponse(release);
    expect(response.status).toBe(200);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({ ok: true, checks: { db: "up" }, release });
  });

  test.each([undefined, "", "  "])(
    "an unlabelled local process reports unknown release (%s)",
    async (release) => {
      expect(await (await readinessResponse(release)).json()).toEqual({
        ok: true,
        checks: { db: "up" },
        release: null,
      });
    }
  );

  test("DB failure remains unready without exposing its error", async () => {
    query.mockRejectedValueOnce(new Error("Synthetic private connection detail"));
    const response = await readinessResponse("build-label");
    expect(response.status).toBe(503);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(await response.json()).toEqual({
      ok: false,
      checks: { db: "down" },
      release: "build-label",
    });
  });
});
