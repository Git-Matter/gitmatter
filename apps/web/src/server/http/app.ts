import { Hono } from "hono";
import { cors } from "hono/cors";
import { StreamableHTTPTransport } from "@hono/mcp";
import { auth } from "./lib/auth.js";
import {
  getEnvNumber,
  logEvent,
  probeEnvProviders,
  purgeExpiredDocuments,
  purgeExpiredTokens,
  purgeOldAuditEvents,
  purgeOldChats,
  recordAudit,
  seedBuiltinWorkflows,
  seedMcpConnections,
} from "@workspace/core";
import { resolveJurisdiction } from "@workspace/registry";
import { chatRoute } from "./routes/chat.js";
import { documentsRoute } from "./routes/documents.js";
import { keysRoute } from "./routes/keys.js";
import { mattersRoute } from "./routes/matters.js";
import { oauthRoute } from "./routes/oauth.js";
import { tabularRoute } from "./routes/tabular.js";
import { tenantsRoute } from "./routes/tenants.js";
import { tokensRoute } from "./routes/tokens.js";
import { workflowRoute } from "./routes/workflow.js";
import { authenticateMcp } from "../mcp/auth.js";
import { buildMcpServer } from "../mcp/server.js";
import { checkReadiness } from "./lib/health.js";
import { serverOrigin } from "./lib/origin.js";
import { clientMeta } from "./lib/request-meta.js";
import { type AuthEnv, requireUser } from "./middleware/auth.js";
import { ipKey, rateLimit, tokenOrIpKey } from "./middleware/rate-limit.js";
import { requestLog } from "./middleware/request-log.js";

// Probe which AI providers have a server env key at boot, so the model catalog
// can mark unavailable ones. Logs the result for ops visibility.
{
  const status = probeEnvProviders();
  const available = Object.entries(status)
    .filter(([, ok]) => ok)
    .map(([p]) => p);
  logEvent("info", "ai.providers", { available });
}

// Seed system workflows + consumed-MCP connections once on boot (idempotent).
void seedBuiltinWorkflows().catch(() => {});
void seedMcpConnections().catch(() => {});

// Retention sweeps. No scheduler here, so boot is the periodic sweep: hard-delete
// documents past their soft-delete window, dead auth/MCP tokens, old audit events,
// and (when enabled) inactive chats. All windows are env-configurable.
//
// Guarded to run once per process via a global flag, so a dev HMR module reload
// doesn't re-fire these full-table delete scans. (A real deployment should move
// this to a scheduled job rather than coupling retention to process boot.)
const SWEPT = Symbol.for("gitmatter.retentionSwept");
const g = globalThis as Record<symbol, boolean>;
if (!g[SWEPT]) {
  g[SWEPT] = true;
  void purgeExpiredDocuments().catch(() => {});
  void purgeExpiredTokens().catch(() => {});
  void purgeOldAuditEvents().catch(() => {});
  void purgeOldChats().catch(() => {});
}

// All server endpoints live under /api and are dispatched here from the
// TanStack Start catch-all route (src/routes/api/$.ts).
export const app = new Hono<AuthEnv>();

// Structured request logging first, so every request (incl. health) is logged.
app.use("*", requestLog);

// Liveness: is the process up? Cheap, no dependencies — for restart probes.
app.get("/api/health", (c) => c.json({ ok: true }));

// Readiness: can we actually serve? (DB required → 503 on failure; docling
// reported but not required.) See lib/health.ts.
app.get("/api/health/ready", async (c) => {
  const report = await checkReadiness();
  return c.json(report, report.ok ? 200 : 503);
});

// Allow cross-origin browser requests to the OAuth discovery docs, token/register
// endpoints, and the MCP endpoint (some clients fetch these from the browser).
// The /authorize endpoint is a top-level navigation (uses the session cookie),
// so it is intentionally left out.
app.use("/.well-known/*", cors());
app.use("/api/oauth/token", cors());
app.use("/api/oauth/register", cors());
app.use(
  "/api/mcp",
  cors({
    origin: "*",
    allowHeaders: ["Authorization", "Content-Type", "Mcp-Session-Id", "Mcp-Protocol-Version"],
    exposeHeaders: ["WWW-Authenticate", "Mcp-Session-Id"],
  })
);

// Rate limits on the public, unauthenticated-reachable endpoints (registered after
// CORS so preflight OPTIONS is answered before the limiter). These are the abuse
// surfaces: open client registration, the OAuth flow, and the MCP tool endpoint.
// Per-IP, except MCP which keys per token. Each limit is env-tunable; 0 disables.
// Windows in ms.
//
// NOTE: the per-IP keys only isolate callers when TRUST_PROXY=true (a trusted edge
// sets the forwarded IP). Without it, these share one bucket, so the limit applies
// globally — defaults carry headroom to avoid blocking legit bursts in that mode.
// Set TRUST_PROXY=true in production for true per-IP limiting.
app.use(
  "/api/oauth/register",
  rateLimit({
    name: "oauth_register",
    limit: getEnvNumber("OAUTH_REGISTER_RATE_LIMIT", 20),
    windowMs: 10 * 60_000,
    key: ipKey,
  })
);
app.use(
  "/api/oauth/authorize",
  rateLimit({
    name: "oauth_authorize",
    limit: getEnvNumber("OAUTH_RATE_LIMIT", 120),
    windowMs: 60_000,
    key: ipKey,
  })
);
app.use(
  "/api/oauth/token",
  rateLimit({
    name: "oauth_token",
    limit: getEnvNumber("OAUTH_RATE_LIMIT", 120),
    windowMs: 60_000,
    key: ipKey,
  })
);
app.use(
  "/api/mcp",
  rateLimit({
    name: "mcp",
    limit: getEnvNumber("MCP_RATE_LIMIT", 240),
    windowMs: 60_000,
    key: tokenOrIpKey,
  })
);

// better-auth owns /api/auth/* (sign-up, sign-in, session, etc.). We wrap it to
// record the two security events better-auth has no DB hook for: a failed
// sign-in (401) and a sign-out. Login is captured via the session-create hook.
app.on(["GET", "POST"], "/api/auth/*", async (c) => {
  const path = c.req.path;
  const isSignIn = path.includes("/sign-in");
  const isSignOut = path.includes("/sign-out");
  // Capture the actor before sign-out clears the session.
  let actorId: string | null = null;
  if (isSignOut) {
    const session = await auth.api.getSession({ headers: c.req.raw.headers }).catch(() => null);
    actorId = session?.user?.id ?? null;
  }
  // Clone so we can read the attempted email on a failed sign-in without
  // consuming the body better-auth needs.
  const probe = isSignIn ? c.req.raw.clone() : null;

  const res = await auth.handler(c.req.raw);

  if (isSignOut && res.ok) {
    void recordAudit({ eventType: "auth.logout", actorId, ...clientMeta(c) });
  } else if (isSignIn && res.status === 401) {
    const email = await probe!
      .json()
      .then((b: { email?: string }) => b?.email ?? null)
      .catch(() => null);
    void recordAudit({ eventType: "auth.failed", target: email, ...clientMeta(c) });
  }
  return res;
});

// Everything else under /api requires a session. Health + auth are public; the
// MCP endpoint authenticates separately via an access token.
app.use("/api/*", (c, next) => {
  const p = c.req.path;
  // Public: health, better-auth, the MCP endpoint (bearer/OAuth), and the OAuth
  // authorization-server endpoints (which do their own per-endpoint auth).
  if (
    p.startsWith("/api/health") ||
    p.startsWith("/api/auth/") ||
    p === "/api/mcp" ||
    p.startsWith("/api/oauth/")
  )
    return next();
  return requireUser(c, next);
});

app.route("/", keysRoute);
app.route("/", mattersRoute);
app.route("/", tenantsRoute);
app.route("/", oauthRoute);
app.route("/", documentsRoute);
app.route("/", tabularRoute);
app.route("/", workflowRoute);
app.route("/", chatRoute);
app.route("/", tokensRoute);

// Exposed MCP server for Claude Desktop / CLI / Cowork. Authenticated by a
// gitmatter access token; a fresh stateless server/transport per request.
app.all("/api/mcp", async (c) => {
  const account = await authenticateMcp(c);
  if (!account) {
    // Point clients at the protected-resource metadata so they can discover the
    // authorization server and run the OAuth flow (RFC 9728 §5.1).
    c.header(
      "WWW-Authenticate",
      `Bearer resource_metadata="${serverOrigin(c)}/.well-known/oauth-protected-resource", scope="mcp"`
    );
    return c.json({ error: "Unauthorized" }, 401);
  }
  // tenant + jurisdiction already came back with the account (one joined query
  // for static tokens, or carried in the signed OAuth token) — no extra reads.
  const jurisdiction = resolveJurisdiction(null, account.jurisdiction);
  const server = buildMcpServer({
    userId: account.userId,
    label: account.label,
    tokenId: account.tokenId,
    tenantId: account.tenantId,
    jurisdiction,
  });
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
