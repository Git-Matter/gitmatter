import { afterEach, beforeEach, describe, expect, test, vi } from "vite-plus/test";
import {
  describeDeploymentObservation,
  verifyWebDeployment,
  type DeploymentObservation,
} from "../src/platform/deployment-readiness.js";

const release = "a".repeat(40);
const oldRelease = "b".repeat(40);
const invalidReleases = [
  "unknown",
  "latest",
  "A".repeat(40),
  `${release}\n`,
  "2026.11.17",
  "V2026.11.17",
  "v2026.1.17",
  "v2026.00.17",
  "v2026.13.17",
  "v2026.11.00",
  "v2026.11.32",
  "v2026.11.17.0",
  "v2026.11.17.01",
  "v2026.11.17.-1",
  "v2026.11.17.1.extra",
  "v2026.11.17-private",
  " v2026.11.17",
  "v2026.11.17\n",
];
const url = "https://staging.example.test/api/health/ready";
const ready = (revision: string | null = release) => ({
  ok: true,
  checks: { db: "up" },
  release: revision,
});
const options = {
  url,
  expectedRelease: release,
  timeoutMs: 35,
  intervalMs: 10,
  requestTimeoutMs: 20,
};

describe("bounded web deployment verification (no network)", () => {
  beforeEach(() => vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "performance"] }));
  afterEach(() => vi.useRealTimers());

  test("requires the exact healthy release and requests fresh unauthenticated data", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(Response.json(ready()));
    expect(await verifyWebDeployment({ ...options, fetcher })).toEqual({ release, attempts: 1 });
    expect(fetcher).toHaveBeenCalledOnce();
    expect(fetcher.mock.calls[0]).toEqual([
      url,
      expect.objectContaining({ cache: "no-store", credentials: "omit", redirect: "error" }),
    ]);
  });

  test.each(["v2026.11.17", "v2026.11.17.1", "v2026.11.17.12"])(
    "accepts the exact healthy production release %s",
    async (expectedRelease) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(Response.json(ready(expectedRelease)));
      expect(await verifyWebDeployment({ ...options, expectedRelease, fetcher })).toEqual({
        release: expectedRelease,
        attempts: 1,
      });
    }
  );

  test.each([
    { expectedRelease: "v2026.11.17.1", observedRelease: "v2026.11.17" },
    { expectedRelease: "v2026.11.17", observedRelease: "v2026.11.16" },
    { expectedRelease: "v2026.11.17", observedRelease: release },
    { expectedRelease: release, observedRelease: "v2026.11.17" },
  ])(
    "does not conflate valid release identifiers: $expectedRelease / $observedRelease",
    async ({ expectedRelease, observedRelease }) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json(ready(observedRelease)));
      const observations: DeploymentObservation[] = [];
      const outcome = verifyWebDeployment({
        ...options,
        expectedRelease,
        fetcher,
        onObservation: (observation) => observations.push(observation),
      }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(35);
      expect(((await outcome) as Error).message).toContain("release_mismatch");
      expect(observations[0]).toEqual({
        state: "release_mismatch",
        release: observedRelease,
        attempt: 1,
      });
    }
  );

  test.each(invalidReleases)(
    "rejects an unknown observed release %j without logging it",
    async (id) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () => Response.json(ready(id)));
      const observations: DeploymentObservation[] = [];
      const outcome = verifyWebDeployment({
        ...options,
        fetcher,
        onObservation: (observation) => observations.push(observation),
      }).catch((error: unknown) => error);
      await vi.advanceTimersByTimeAsync(35);
      expect(((await outcome) as Error).message).toContain("release_unknown");
      expect(observations[0]).toEqual({ state: "release_unknown", attempt: 1 });
    }
  );

  test("an old healthy process must become the expected release before succeeding", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(ready(oldRelease)))
      .mockResolvedValueOnce(Response.json(ready()));
    const observations: DeploymentObservation[] = [];
    const result = verifyWebDeployment({
      ...options,
      fetcher,
      onObservation: (o) => observations.push(o),
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toEqual({ release, attempts: 2 });
    expect(observations.map((o) => o.state)).toEqual(["release_mismatch", "ready"]);
  });

  test("an old healthy process cannot keep deployment green or retry beyond the deadline", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(async () => Response.json(ready(oldRelease)));
    const outcome = verifyWebDeployment({ ...options, fetcher }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(100);
    const error = await outcome;
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("release_mismatch");
    expect(fetcher).toHaveBeenCalledTimes(4);
    expect(vi.getTimerCount()).toBe(0);
  });

  test("HTTP errors cannot authorize a deployment even with matching healthy JSON", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(Response.json(ready(), { status: 503 }))
      .mockResolvedValueOnce(Response.json(ready()));
    const observations: DeploymentObservation[] = [];
    const result = verifyWebDeployment({
      ...options,
      fetcher,
      onObservation: (o) => observations.push(o),
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toEqual({ release, attempts: 2 });
    expect(observations[0]).toMatchObject({ state: "http_error", status: 503 });
  });

  test.each([
    { body: { ...ready(), ok: false }, state: "database_not_ready" },
    { body: { ...ready(), checks: { db: "down" } }, state: "database_not_ready" },
    { body: { ...ready(), checks: {} }, state: "database_not_ready" },
    { body: ready(null), state: "release_unknown" },
    { body: { ok: true, checks: { db: "up" } }, state: "release_unknown" },
  ])("rejects incomplete/unhealthy readiness: $state", async ({ body, state }) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => Response.json(body));
    const outcome = verifyWebDeployment({ ...options, fetcher }).catch((error: unknown) => error);
    await vi.advanceTimersByTimeAsync(35);
    expect(((await outcome) as Error).message).toContain(state);
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  test("network and malformed-body faults retry without retaining their content", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockRejectedValueOnce(new Error("Synthetic private URL and payload"))
      .mockResolvedValueOnce(new Response("Synthetic private HTML"))
      .mockResolvedValueOnce(Response.json(ready()));
    const observations: DeploymentObservation[] = [];
    const result = verifyWebDeployment({
      ...options,
      fetcher,
      onObservation: (o) => observations.push(o),
    });
    await vi.advanceTimersByTimeAsync(20);
    expect(await result).toEqual({ release, attempts: 3 });
    expect(observations.map((o) => o.state)).toEqual([
      "request_failed",
      "invalid_response",
      "ready",
    ]);
    const output = observations.map(describeDeploymentObservation).join("\n");
    expect(output).not.toContain("private");
    expect(output).not.toContain(url);
  });

  test("oversized readiness cannot authorize a release even when its fields match", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        new Response(JSON.stringify({ ...ready(), padding: "x".repeat(16 * 1024) }))
      )
      .mockResolvedValueOnce(Response.json(ready()));
    const observations: DeploymentObservation[] = [];
    const result = verifyWebDeployment({
      ...options,
      fetcher,
      onObservation: (o) => observations.push(o),
    });
    await vi.advanceTimersByTimeAsync(10);
    expect(await result).toEqual({ release, attempts: 2 });
    expect(observations[0]!.state).toBe("invalid_response");
  });

  test.each(["headers", "body"] as const)(
    "a stalled %s request cannot outlive the total deadline",
    async (phase) => {
      let bodyController: ReadableStreamDefaultController<Uint8Array> | undefined;
      const response = new Response(
        new ReadableStream<Uint8Array>({
          start(controller) {
            bodyController = controller;
          },
        })
      );
      const fetcher = vi
        .fn<typeof fetch>()
        .mockImplementation(async () =>
          phase === "headers" ? new Promise<Response>(() => {}) : response
        );
      const outcome = verifyWebDeployment({ ...options, requestTimeoutMs: 1000, fetcher }).catch(
        (error: unknown) => error
      );
      await vi.advanceTimersByTimeAsync(35);
      expect(((await outcome) as Error).message).toContain("request_timeout");
      expect(fetcher).toHaveBeenCalledOnce();
      expect(fetcher.mock.calls[0]![1]!.signal!.aborted).toBe(true);
      expect(vi.getTimerCount()).toBe(0);
      if (phase === "headers") bodyController?.close();
    }
  );

  test.each(invalidReleases)(
    "invalid release configuration %j fails before any request",
    async (id) => {
      const fetcher = vi.fn<typeof fetch>();
      await expect(
        verifyWebDeployment({ ...options, expectedRelease: id, fetcher })
      ).rejects.toThrow("Invalid deployment verification configuration");
      expect(fetcher).not.toHaveBeenCalled();
    }
  );
});
