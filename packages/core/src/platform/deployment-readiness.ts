import type { ReadinessReport } from "@workspace/contracts";

const SHA = /^[0-9a-f]{40}$/;
const MAX_READINESS_BYTES = 16 * 1024;
type Observation = {
  state:
    | "http_error"
    | "invalid_response"
    | "database_not_ready"
    | "release_unknown"
    | "release_mismatch"
    | "ready"
    | "request_timeout"
    | "request_failed";
  status?: number;
  release?: string;
};
export type DeploymentObservation = Observation & { attempt: number };

export class DeploymentVerificationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "DeploymentVerificationError";
  }
}

export function describeDeploymentObservation(observation: DeploymentObservation): string {
  return `attempt ${observation.attempt}: ${observation.state}${observation.status === undefined ? "" : ` (HTTP ${observation.status})`}${observation.release ? ` (release ${observation.release})` : ""}`;
}

function inspect(body: unknown, expectedRelease: string): Observation {
  if (!body || typeof body !== "object") return { state: "invalid_response" };
  const report = body as Partial<ReadinessReport>;
  if (typeof report.ok !== "boolean" || !report.checks || typeof report.checks !== "object")
    return { state: "invalid_response" };
  if (!report.ok || report.checks.db !== "up") return { state: "database_not_ready" };
  if (typeof report.release !== "string" || !SHA.test(report.release))
    return { state: "release_unknown" };
  return {
    state: report.release === expectedRelease ? "ready" : "release_mismatch",
    release: report.release,
  };
}

async function readBody(response: Response, signal: AbortSignal): Promise<unknown> {
  const reader = response.body?.getReader();
  if (!reader) throw new Error("Missing readiness body");
  const cancel = () => {
    void reader.cancel().catch(() => {});
  };
  signal.addEventListener("abort", cancel, { once: true });
  const decoder = new TextDecoder();
  let bytes = 0;
  let text = "";
  try {
    if (signal.aborted) throw new Error("Readiness request aborted");
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > MAX_READINESS_BYTES) throw new Error("Readiness response too large");
      text += decoder.decode(chunk.value, { stream: true });
    }
    return JSON.parse(text + decoder.decode());
  } finally {
    signal.removeEventListener("abort", cancel);
    cancel();
    reader.releaseLock();
  }
}

async function probe(
  url: string,
  expectedRelease: string,
  timeoutMs: number,
  fetcher: typeof fetch
): Promise<Observation> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<Observation>((resolve) => {
    timer = setTimeout(() => {
      resolve({ state: "request_timeout" });
      controller.abort();
    }, timeoutMs);
  });
  const request = (async (): Promise<Observation> => {
    try {
      const response = await fetcher(url, {
        signal: controller.signal,
        cache: "no-store",
        credentials: "omit",
        redirect: "error",
        headers: { Accept: "application/json", "Cache-Control": "no-cache" },
      });
      if (response.status !== 200) {
        void response.body?.cancel().catch(() => {});
        return { state: "http_error", status: response.status };
      }
      // The same request deadline includes body consumption and JSON parsing.
      // Only the selected status/release fields may leave this boundary.
      try {
        return inspect(await readBody(response, controller.signal), expectedRelease);
      } catch {
        return { state: "invalid_response" };
      }
    } catch {
      return { state: "request_failed" };
    }
  })();
  try {
    return await Promise.race([request, timeout]);
  } finally {
    clearTimeout(timer);
    controller.abort();
  }
}

/** Observe one web process release and its DB readiness; this makes no mutation
 * and does not establish docs, migration, image-digest or legal acceptance proof. */
export async function verifyWebDeployment(options: {
  url: string;
  expectedRelease: string;
  timeoutMs?: number;
  intervalMs?: number;
  requestTimeoutMs?: number;
  fetcher?: typeof fetch;
  onObservation?: (observation: DeploymentObservation) => void;
}) {
  const timeoutMs = options.timeoutMs ?? 300_000;
  const intervalMs = options.intervalMs ?? 10_000;
  const requestTimeoutMs = options.requestTimeoutMs ?? 10_000;
  if (
    !SHA.test(options.expectedRelease) ||
    ![timeoutMs, intervalMs, requestTimeoutMs].every((n) => Number.isSafeInteger(n) && n > 0) ||
    timeoutMs > 600_000
  )
    throw new DeploymentVerificationError("Invalid deployment verification configuration.");
  try {
    const url = new URL(options.url);
    if (
      !["http:", "https:"].includes(url.protocol) ||
      url.username ||
      url.password ||
      url.search ||
      url.hash
    )
      throw new Error();
  } catch {
    throw new DeploymentVerificationError(
      "Use a plain HTTP(S) readiness URL without credentials or query parameters."
    );
  }
  const deadline = performance.now() + timeoutMs;
  // An attempt bound also prevents accidental unbounded loops if a clock stalls.
  const maxAttempts = Math.min(60, Math.ceil(timeoutMs / intervalMs) + 1);
  let last: DeploymentObservation | undefined;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) break;
    const observation = await probe(
      options.url,
      options.expectedRelease,
      Math.min(requestTimeoutMs, remaining),
      options.fetcher ?? fetch
    );
    last = { ...observation, attempt };
    options.onObservation?.(last);
    if (performance.now() >= deadline) break;
    if (observation.state === "ready")
      return { release: options.expectedRelease, attempts: attempt };
    const delay = Math.min(intervalMs, deadline - performance.now());
    if (attempt < maxAttempts && delay > 0)
      await new Promise<void>((resolve) => setTimeout(resolve, delay));
  }
  throw new DeploymentVerificationError(
    `Web deployment was not verified before its deadline${last ? `; ${describeDeploymentObservation(last)}` : "."}`
  );
}
