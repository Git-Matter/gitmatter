import { Hono } from "hono";
import { cors } from "hono/cors";
import { StreamableHTTPTransport } from "@hono/mcp";
import { auth } from "./lib/auth.js";
import {
  getUserJurisdiction,
  probeEnvProviders,
  seedBuiltinWorkflows,
  seedMcpConnections,
  startExtractionWorker,
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
import { serverOrigin } from "./lib/origin.js";
import { type AuthEnv, requireUser } from "./middleware/auth.js";

// Probe which AI providers have a server env key at boot, so the model catalog
// can mark unavailable ones. Logs the result for ops visibility.
{
  const status = probeEnvProviders();
  const available = Object.entries(status)
    .filter(([, ok]) => ok)
    .map(([p]) => p);
  console.log(
    available.length
      ? `[ai] providers available from env: ${available.join(", ")}`
      : "[ai] no provider env keys set — models depend on per-user keys"
  );
}

// Seed system workflows + consumed-MCP connections once on boot (idempotent).
void seedBuiltinWorkflows().catch(() => {});
void seedMcpConnections().catch(() => {});

// Drain uploaded-document extraction in the background (Postgres-backed queue).
startExtractionWorker();

// All server endpoints live under /api and are dispatched here from the
// TanStack Start catch-all route (src/routes/api/$.ts).
export const app = new Hono<AuthEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

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

// better-auth owns /api/auth/* (sign-up, sign-in, session, etc.).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Everything else under /api requires a session. Health + auth are public; the
// MCP endpoint authenticates separately via an access token.
app.use("/api/*", (c, next) => {
  const p = c.req.path;
  // Public: health, better-auth, the MCP endpoint (bearer/OAuth), and the OAuth
  // authorization-server endpoints (which do their own per-endpoint auth).
  if (
    p === "/api/health" ||
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
// gitcounsel access token; a fresh stateless server/transport per request.
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
  const jurisdiction = resolveJurisdiction(null, await getUserJurisdiction(account.userId));
  const server = buildMcpServer({ ...account, jurisdiction });
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
