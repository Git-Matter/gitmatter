import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";
import { getRequestUrl } from "@tanstack/react-start/server";

// Security headers applied to every response — SSR documents, server routes,
// and the /api/* Hono surface. Registered as global requestMiddleware below.
//
// CSP note: this is a pragmatic baseline. script-src/style-src allow
// 'unsafe-inline' because TanStack Start injects inline hydration scripts and
// we have no nonce pipeline yet. Dev additionally needs 'unsafe-eval' and a
// websocket connect-src for Vite HMR. Tighten to nonce-based CSP later.
// Cloudflare Turnstile loads its script and runs the widget in an iframe from
// this origin, and posts challenge results back to it — so it must be allowed
// in script-src, frame-src, and connect-src.
const TURNSTILE_ORIGIN = "https://challenges.cloudflare.com";
// PostHog uses regional API and asset hosts under i.posthog.com (for example,
// eu.i.posthog.com and eu-assets.i.posthog.com). Keep this scoped to PostHog's
// ingestion domain instead of allowing scripts and connections from all HTTPS origins.
const POSTHOG_INGESTION_ORIGIN = "https://*.i.posthog.com";

function buildCsp(): string {
  const dev = process.env.NODE_ENV !== "production";
  const scriptSrc = dev
    ? `'self' 'unsafe-inline' 'unsafe-eval' ${TURNSTILE_ORIGIN} ${POSTHOG_INGESTION_ORIGIN}`
    : `'self' 'unsafe-inline' ${TURNSTILE_ORIGIN} ${POSTHOG_INGESTION_ORIGIN}`;
  const connectSrc = dev
    ? `'self' ws: wss: ${TURNSTILE_ORIGIN} ${POSTHOG_INGESTION_ORIGIN}`
    : `'self' ${TURNSTILE_ORIGIN} ${POSTHOG_INGESTION_ORIGIN}`;
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'self'",
    `frame-src 'self' ${TURNSTILE_ORIGIN}`,
    "form-action 'self'",
    "img-src 'self' data: blob:",
    "font-src 'self' data:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${scriptSrc}`,
    `connect-src ${connectSrc}`,
  ].join("; ");
}

// Computed once: the CSP depends only on NODE_ENV, fixed for the process lifetime.
const CSP = buildCsp();

// The OAuth consent page (GET /api/oauth/authorize) renders a form that posts to
// /api/oauth/authorize/decision, which 302-redirects to the OAuth client's
// redirect_uri (e.g. ChatGPT at chatgpt.com). Browsers enforce `form-action`
// against that redirect target, so a flat `form-action 'self'` blocks the consent
// POST. Allow exactly the validated redirect_uri's origin for that one page; every
// other response keeps the strict `form-action 'self'`.
function cspForRequest(): string {
  try {
    const url = getRequestUrl();
    if (url.pathname === "/api/oauth/authorize") {
      const redirectUri = url.searchParams.get("redirect_uri");
      if (redirectUri) {
        const origin = new URL(redirectUri).origin;
        return CSP.replace("form-action 'self'", `form-action 'self' ${origin}`);
      }
    }
  } catch {
    // No request context, or a malformed redirect_uri — fall back to strict CSP.
    // (A bad redirect_uri also 400s in the route, so no form is served anyway.)
  }
  return CSP;
}

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const h = result.response.headers;
  h.set("Content-Security-Policy", cspForRequest());
  h.set("X-Content-Type-Options", "nosniff");
  h.set("Referrer-Policy", "strict-origin-when-cross-origin");
  h.set("X-Frame-Options", "SAMEORIGIN");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Browsers honor HSTS only over HTTPS, so it is inert on local http dev.
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return result;
});

// Reject cross-site requests to server functions. Validates same-origin via
// Sec-Fetch-Site / Origin / Referer. Required because we use cookie-based
// (better-auth) sessions, which are otherwise CSRF-vulnerable; server functions
// bypass the Hono /api/* auth + rate-limit layer, so this is their guard.
const csrfMiddleware = createCsrfMiddleware({
  filter: (ctx) => ctx.handlerType === "serverFn",
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [securityHeaders, csrfMiddleware],
  };
});
