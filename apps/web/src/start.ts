import { createCsrfMiddleware, createMiddleware, createStart } from "@tanstack/react-start";

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

function buildCsp(): string {
  const dev = process.env.NODE_ENV !== "production";
  const scriptSrc = dev
    ? `'self' 'unsafe-inline' 'unsafe-eval' ${TURNSTILE_ORIGIN}`
    : `'self' 'unsafe-inline' ${TURNSTILE_ORIGIN}`;
  const connectSrc = dev ? `'self' ws: wss: ${TURNSTILE_ORIGIN}` : `'self' ${TURNSTILE_ORIGIN}`;
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

const securityHeaders = createMiddleware().server(async ({ next }) => {
  const result = await next();
  const h = result.response.headers;
  h.set("Content-Security-Policy", CSP);
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
