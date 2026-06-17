// Shared fetch with a hard timeout. External calls (CourtListener, docling,
// model catalogs) must not hang the request that triggered them.

export interface TimeoutFetchInit extends RequestInit {
  /** Abort after this many ms. Default 30s. */
  timeoutMs?: number;
}

export async function fetchWithTimeout(
  url: string,
  init: TimeoutFetchInit = {}
): Promise<Response> {
  const { timeoutMs = 30_000, signal, ...rest } = init;
  const timeout = AbortSignal.timeout(timeoutMs);
  // Honor any caller-provided signal alongside the timeout.
  const merged = signal ? AbortSignal.any([signal, timeout]) : timeout;
  try {
    return await fetch(url, { ...rest, signal: merged });
  } catch (err) {
    if (err instanceof DOMException && err.name === "TimeoutError") {
      throw new Error(`Request to ${new URL(url).host} timed out after ${timeoutMs}ms`);
    }
    throw err;
  }
}
