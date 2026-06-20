// Sentry error tracking for the server process. Errors-only: no performance
// tracing, no logs ingestion. Init is best-effort — when SENTRY_DSN is unset
// (local dev, CI), this is a no-op and the app runs unchanged.
//
// Data perimeter: gitmatter handles legal documents and encrypted LLM keys. We
// must never ship document content, keys, or PII to Sentry. The `beforeSend`
// scrubber below strips request bodies, auth headers, and cookies before any
// event leaves the process. Use the EU-region DSN so events stay in the EU.

import * as Sentry from "@sentry/bun";
import { getEnv, setErrorReporter } from "@workspace/core";

// Header names that can carry secrets/PII. Compared case-insensitively.
const SENSITIVE_HEADERS = new Set(["authorization", "cookie", "set-cookie", "mcp-session-id"]);

function scrub(event: Sentry.ErrorEvent): Sentry.ErrorEvent {
  const req = event.request;
  if (req) {
    // Drop any captured request/response body — it may contain document text,
    // prompts, or LLM responses.
    delete req.data;
    delete req.cookies;
    if (req.headers) {
      for (const key of Object.keys(req.headers)) {
        if (SENSITIVE_HEADERS.has(key.toLowerCase())) req.headers[key] = "[redacted]";
      }
    }
  }
  return event;
}

/**
 * Initialize Sentry once at server bootstrap. Safe to call when no DSN is set.
 * Also wires the core logger's error sink so `logEvent("error", ...)` calls are
 * forwarded as Sentry messages, catching handled errors that never throw.
 */
export function initSentry(): void {
  const dsn = getEnv("SENTRY_DSN");
  if (!dsn) return;

  Sentry.init({
    dsn,
    // Separate staging from prod in the Sentry UI. Both run NODE_ENV=production,
    // so a dedicated var is required — set SENTRY_ENVIRONMENT per Dokploy app
    // (staging vs production). Falls back to NODE_ENV for local dev.
    environment: getEnv("SENTRY_ENVIRONMENT") ?? getEnv("NODE_ENV") ?? "development",
    release: getEnv("SENTRY_RELEASE"),
    // Errors only — no tracing, no PII.
    sendDefaultPii: false,
    beforeSend: scrub,
  });

  // Forward error-level structured logs into Sentry. Unhandled exceptions are
  // captured at the Hono error boundary (app.onError) and by Sentry's global
  // process handlers; this covers errors that are logged but caught.
  setErrorReporter((msg, fields) => {
    Sentry.captureMessage(msg, { level: "error", extra: fields });
  });

  // Flush buffered events on shutdown so a final error isn't lost when Dokploy
  // sends SIGTERM on redeploy. close() drains the queue (≤2s), then exit. Guard
  // against double-registration under dev HMR.
  const REGISTERED = Symbol.for("gitmatter.sentryShutdown");
  const g = globalThis as Record<symbol, boolean>;
  if (!g[REGISTERED]) {
    g[REGISTERED] = true;
    for (const signal of ["SIGTERM", "SIGINT"] as const) {
      process.once(signal, () => {
        void Sentry.close(2000).then(() => process.exit(0));
      });
    }
  }
}

export { Sentry };
