import { type Context, Hono } from "hono";
import {
  type OAuthClient,
  createAuthCode,
  exchangeCode,
  fetchWithTimeout,
  getOAuthClient,
  isPrivateHost,
  recordAudit,
  refreshAccessToken,
  registerDcrClient,
  upsertCimdClient,
} from "@workspace/core";
import { type AuthEnv, getUser } from "../middleware/auth.js";
import { mcpResourceUri, serverOrigin } from "../lib/origin.js";
import { clientMeta } from "../lib/request-meta.js";

export const oauthRoute = new Hono<AuthEnv>();

// The single scope covering gitmatter's MCP tool surface (product features only;
// never auth/user settings — see the connector allowlist).
export const MCP_SCOPE = "mcp";

// ---- Discovery (public, root-level well-known) ----

function protectedResourceMetadata(c: Context) {
  return c.json({
    resource: mcpResourceUri(c),
    authorization_servers: [serverOrigin(c)],
    scopes_supported: [MCP_SCOPE],
  });
}

// RFC 9728: served at the root and at the MCP endpoint's path-suffixed variant.
oauthRoute.get("/.well-known/oauth-protected-resource", protectedResourceMetadata);
oauthRoute.get("/.well-known/oauth-protected-resource/api/mcp", protectedResourceMetadata);

// RFC 8414: authorization server metadata. issuer == origin, so the AS metadata
// lives at the root well-known path (no path insertion).
oauthRoute.get("/.well-known/oauth-authorization-server", (c) => {
  const origin = serverOrigin(c);
  return c.json({
    issuer: origin,
    authorization_endpoint: `${origin}/api/oauth/authorize`,
    token_endpoint: `${origin}/api/oauth/token`,
    registration_endpoint: `${origin}/api/oauth/register`,
    scopes_supported: [MCP_SCOPE],
    response_types_supported: ["code"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    code_challenge_methods_supported: ["S256"],
    token_endpoint_auth_methods_supported: ["none"],
    client_id_metadata_document_supported: true,
  });
});

// ---- Authorization endpoint (auth-code + PKCE + consent) ----

function esc(s: string): string {
  return s.replace(
    /[&<>"']/g,
    (ch) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[ch] as string
  );
}

// Fetch + validate a Client ID Metadata Document. SSRF-guarded: https only, no
// private/loopback hosts, timeout, size cap.
async function fetchCimd(
  clientId: string
): Promise<{ client_name?: string; redirect_uris?: string[]; client_id?: string } | null> {
  try {
    const u = new URL(clientId);
    if (u.protocol !== "https:") return null;
    if (isPrivateHost(u.hostname)) return null;
    const res = await fetchWithTimeout(clientId, {
      timeoutMs: 5000,
      headers: { accept: "application/json" },
    });
    if (!res.ok) return null;
    const text = await res.text();
    if (text.length > 100_000) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

// Resolve a client and validate the redirect_uri exactly. A registered client
// (DCR/pre-registered) is used directly; an https URL client_id is treated as a
// Client ID Metadata Document — fetched, validated, and cached on first use.
async function authorizeClient(clientId: string, redirectUri: string): Promise<OAuthClient | null> {
  const existing = await getOAuthClient(clientId);
  if (existing) return existing.redirectUris.includes(redirectUri) ? existing : null;
  if (!clientId.startsWith("https://")) return null;
  const doc = await fetchCimd(clientId);
  if (!doc || doc.client_id !== clientId) return null;
  if (!Array.isArray(doc.redirect_uris) || !doc.redirect_uris.includes(redirectUri)) return null;
  return upsertCimdClient({
    clientId,
    clientName: doc.client_name ?? clientId,
    redirectUris: doc.redirect_uris,
  });
}

function consentPage(input: {
  clientName: string;
  redirectUri: string;
  scope: string;
  params: Record<string, string>;
}): string {
  const hidden = Object.entries(input.params)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}" />`)
    .join("");
  const host = (() => {
    try {
      return new URL(input.redirectUri).host;
    } catch {
      return input.redirectUri;
    }
  })();
  return `<!doctype html><html><head><meta charset="utf-8"><title>Authorize</title>
<style>body{font:15px system-ui;max-width:30rem;margin:4rem auto;padding:0 1rem}
.card{border:1px solid #ddd;border-radius:12px;padding:1.5rem}
button{font:inherit;padding:.5rem 1rem;border-radius:8px;border:1px solid #ccc;cursor:pointer}
.ok{background:#111;color:#fff;border-color:#111}</style></head>
<body><div class="card">
<h2>Connect ${esc(input.clientName)}</h2>
<p><strong>${esc(input.clientName)}</strong> wants to access your gitmatter matters and tools
(scope <code>${esc(input.scope)}</code>). It can act on the artifacts you can access; it cannot
change your account or keys.</p>
<p style="color:#666">Redirects to <code>${esc(host)}</code></p>
<form method="post" action="/api/oauth/authorize/decision">${hidden}
<div style="display:flex;gap:.75rem;margin-top:1rem">
<button class="ok" name="approve" value="true" type="submit">Approve</button>
<button name="approve" value="false" type="submit">Deny</button>
</div></form></div></body></html>`;
}

oauthRoute.get("/api/oauth/authorize", async (c) => {
  const q = c.req.query();
  if (q.response_type !== "code") return c.text("unsupported_response_type", 400);
  if (q.code_challenge_method !== "S256" || !q.code_challenge)
    return c.text("invalid_request: PKCE with S256 is required", 400);
  if (!q.client_id || !q.redirect_uri) return c.text("invalid_request", 400);
  const client = await authorizeClient(q.client_id, q.redirect_uri);
  if (!client) return c.text("invalid_client or unregistered redirect_uri", 400);

  // Reuse the better-auth session for login; bounce through /login if absent.
  const user = await getUser(c);
  if (!user) {
    const path = new URL(c.req.url).pathname + new URL(c.req.url).search;
    return c.redirect(`/login?next=${encodeURIComponent(path)}`);
  }
  return c.html(
    consentPage({
      clientName: client.clientName,
      redirectUri: q.redirect_uri,
      scope: q.scope || MCP_SCOPE,
      params: q,
    })
  );
});

oauthRoute.post("/api/oauth/authorize/decision", async (c) => {
  const user = await getUser(c);
  if (!user) return c.text("Unauthorized", 401);
  const form = (await c.req.parseBody()) as Record<string, string>;
  const redirectUri = form.redirect_uri ?? "";
  const client = await authorizeClient(form.client_id ?? "", redirectUri);
  if (!client) return c.text("invalid_client", 400);
  const sep = redirectUri.includes("?") ? "&" : "?";
  const stateQ = form.state ? `&state=${encodeURIComponent(form.state)}` : "";
  if (form.approve !== "true") {
    return c.redirect(`${redirectUri}${sep}error=access_denied${stateQ}`);
  }
  const code = await createAuthCode({
    clientId: form.client_id!,
    userId: user.id,
    redirectUri,
    codeChallenge: form.code_challenge!,
    codeChallengeMethod: form.code_challenge_method!,
    scope: form.scope,
    resource: form.resource,
  });
  void recordAudit({
    eventType: "oauth.consent",
    actorId: user.id,
    target: form.client_id,
    metadata: { scope: form.scope, redirectUri },
    ...clientMeta(c),
  });
  return c.redirect(`${redirectUri}${sep}code=${encodeURIComponent(code)}${stateQ}`);
});

// ---- Token endpoint ----

oauthRoute.post("/api/oauth/token", async (c) => {
  const form = (await c.req.parseBody()) as Record<string, string>;
  const tokenJson = (r: { accessToken: string; refreshToken: string; expiresIn: number }) =>
    c.json({
      access_token: r.accessToken,
      token_type: "Bearer",
      expires_in: r.expiresIn,
      refresh_token: r.refreshToken,
      scope: MCP_SCOPE,
    });

  if (form.grant_type === "authorization_code") {
    const r = await exchangeCode({
      code: form.code ?? "",
      clientId: form.client_id ?? "",
      redirectUri: form.redirect_uri ?? "",
      codeVerifier: form.code_verifier ?? "",
    });
    return "error" in r ? c.json({ error: r.error }, 400) : tokenJson(r);
  }
  if (form.grant_type === "refresh_token") {
    const r = await refreshAccessToken({
      refreshToken: form.refresh_token ?? "",
      clientId: form.client_id ?? "",
    });
    if (!("error" in r)) {
      void recordAudit({
        eventType: "oauth.token_refresh",
        target: form.client_id,
        ...clientMeta(c),
      });
    }
    return "error" in r ? c.json({ error: r.error }, 400) : tokenJson(r);
  }
  return c.json({ error: "unsupported_grant_type" }, 400);
});

// ---- Dynamic Client Registration (RFC 7591) ----

oauthRoute.post("/api/oauth/register", async (c) => {
  const body = await c.req.json().catch(() => null);
  if (!body || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
    return c.json({ error: "invalid_client_metadata" }, 400);
  }
  const client = await registerDcrClient({
    clientName: typeof body.client_name === "string" ? body.client_name : "MCP Client",
    redirectUris: body.redirect_uris.filter((u: unknown) => typeof u === "string"),
    tokenEndpointAuthMethod:
      typeof body.token_endpoint_auth_method === "string"
        ? body.token_endpoint_auth_method
        : "none",
  });
  void recordAudit({
    eventType: "oauth.client_register",
    target: client.clientId,
    metadata: { clientName: client.clientName, redirectUris: client.redirectUris },
    ...clientMeta(c),
  });
  return c.json(
    {
      client_id: client.clientId,
      client_name: client.clientName,
      redirect_uris: client.redirectUris,
      token_endpoint_auth_method: client.tokenEndpointAuthMethod,
      grant_types: ["authorization_code", "refresh_token"],
      response_types: ["code"],
    },
    201
  );
});
