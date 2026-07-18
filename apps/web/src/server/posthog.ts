import { PostHog } from "posthog-node";

// Singleton PostHog client for server-side event capture.
// Reads credentials from env; no-ops if POSTHOG_API_KEY is unset.
const key = process.env.POSTHOG_API_KEY ?? "";
const host = process.env.POSTHOG_HOST ?? "https://us.i.posthog.com";

export const posthog = new PostHog(key, {
  host,
  enableExceptionAutocapture: true,
  // Flush at low thresholds so events are sent promptly from the long-running
  // server process. A single shared instance is fine here because the Hono
  // server is not a short-lived lambda — it stays up between requests.
  flushAt: 20,
  flushInterval: 10000,
});
