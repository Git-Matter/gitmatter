import { createMiddleware, createStart } from "@tanstack/react-start";

// Security headers applied to every response — SSR documents, server routes,
// and the /api/* Hono surface. Registered as global requestMiddleware below.
//
// CSP note: this is a pragmatic baseline. script-src/style-src allow
// 'unsafe-inline' because TanStack Start injects inline hydration scripts and
// we have no nonce pipeline yet. Dev additionally needs 'unsafe-eval' and a
// websocket connect-src for Vite HMR. Tighten to nonce-based CSP later.
function buildCsp(): string {
  const dev = process.env.NODE_ENV !== "production";
  const scriptSrc = dev ? "'self' 'unsafe-inline' 'unsafe-eval'" : "'self' 'unsafe-inline'";
  const connectSrc = dev ? "'self' ws: wss:" : "'self'";
  return [
    "default-src 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
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
  h.set("X-Frame-Options", "DENY");
  h.set("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  // Browsers honor HSTS only over HTTPS, so it is inert on local http dev.
  h.set("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  return result;
});

export const startInstance = createStart(() => {
  return {
    requestMiddleware: [securityHeaders],
  };
});
