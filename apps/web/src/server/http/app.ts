import { Hono } from "hono";
import { StreamableHTTPTransport } from "@hono/mcp";
import { auth } from "./lib/auth.js";
import {
  getUserJurisdiction,
  seedBuiltinWorkflows,
  seedMcpConnections,
  startExtractionWorker,
} from "@workspace/core";
import { resolveJurisdiction } from "@workspace/registry";
import { chatRoute } from "./routes/chat.js";
import { contractRoute } from "./routes/contract.js";
import { documentsRoute } from "./routes/documents.js";
import { keysRoute } from "./routes/keys.js";
import { tabularRoute } from "./routes/tabular.js";
import { tokensRoute } from "./routes/tokens.js";
import { workflowRoute } from "./routes/workflow.js";
import { authenticateMcp } from "../mcp/auth.js";
import { buildMcpServer } from "../mcp/server.js";
import { type AuthEnv, requireUser } from "./middleware/auth.js";

// Seed system workflows + consumed-MCP connections once on boot (idempotent).
void seedBuiltinWorkflows().catch(() => {});
void seedMcpConnections().catch(() => {});

// Drain uploaded-document extraction in the background (Postgres-backed queue).
startExtractionWorker();

// All server endpoints live under /api and are dispatched here from the
// TanStack Start catch-all route (src/routes/api/$.ts).
export const app = new Hono<AuthEnv>();

app.get("/api/health", (c) => c.json({ ok: true }));

// better-auth owns /api/auth/* (sign-up, sign-in, session, etc.).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Everything else under /api requires a session. Health + auth are public; the
// MCP endpoint authenticates separately via an access token.
app.use("/api/*", (c, next) => {
  const p = c.req.path;
  if (p === "/api/health" || p.startsWith("/api/auth/") || p === "/api/mcp") return next();
  return requireUser(c, next);
});

app.route("/", keysRoute);
app.route("/", documentsRoute);
app.route("/", tabularRoute);
app.route("/", contractRoute);
app.route("/", workflowRoute);
app.route("/", chatRoute);
app.route("/", tokensRoute);

// Exposed MCP server for Claude Desktop / CLI / Cowork. Authenticated by a
// gitcounsel access token; a fresh stateless server/transport per request.
app.all("/api/mcp", async (c) => {
  const account = await authenticateMcp(c);
  if (!account) return c.json({ error: "Unauthorized" }, 401);
  const jurisdiction = resolveJurisdiction(null, await getUserJurisdiction(account.userId));
  const server = buildMcpServer({ ...account, jurisdiction });
  const transport = new StreamableHTTPTransport({ sessionIdGenerator: undefined });
  await server.connect(transport);
  return transport.handleRequest(c);
});

export default app;
