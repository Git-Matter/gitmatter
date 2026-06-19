import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto";
import { and, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type OAuthClient,
  oauthAccessTokens,
  oauthAuthCodes,
  oauthClients,
} from "@workspace/db/schema";
import { getUserTenant } from "../core/access.js";
import { getEnv } from "../core/config.js";
import { hashToken } from "./mcp-tokens.js";
import { getUserJurisdiction } from "./settings.js";

// Re-export so consumers can name the client type without reaching into db.
export type { OAuthClient, OAuthAccessToken } from "@workspace/db/schema";

const ACCESS_TTL_MS = 60 * 60 * 1000; // 1 hour
const CODE_TTL_MS = 60 * 1000; // 60 seconds

export type IssuedTokens = { accessToken: string; refreshToken: string; expiresIn: number };

// ---- Signed, self-validating access tokens --------------------------------
// An access token carries its own claims (user, client, tenant, jurisdiction,
// audience, expiry) plus an HMAC signature, so validating one is pure crypto —
// no database round-trip on the MCP hot path. Refresh tokens stay opaque +
// DB-backed (see issueTokens), so rotation and revocation still work; the only
// trade-off is that a signed access token cannot be revoked before it expires
// (≤ 1h). The token is opaque to clients — only this server reads its contents.

type AccessClaims = {
  u: string; // userId
  c: string; // clientId
  t: string | null; // tenantId
  j: string | null; // jurisdiction (raw user setting; resolved at use)
  a: string; // audience (the MCP resource uri)
  e: number; // expiry, epoch seconds
};

// Signing key: a dedicated secret, falling back to the app-wide better-auth
// secret. In dev, when neither is set, a per-process random key keeps things
// working (tokens just don't survive a restart). PRODUCTION MUST set one of
// OAUTH_TOKEN_SECRET or BETTER_AUTH_SECRET, or tokens become unverifiable.
function getSigningKey(): Buffer {
  const secret = getEnv("OAUTH_TOKEN_SECRET") ?? getEnv("BETTER_AUTH_SECRET");
  if (secret) return createHash("sha256").update(secret).digest();
  const DEVKEY = Symbol.for("gitmatter.oauthDevKey");
  const g = globalThis as Record<symbol, Buffer | undefined>;
  return (g[DEVKEY] ??= randomBytes(32));
}

function sign(payload: string): string {
  return createHmac("sha256", getSigningKey()).update(payload).digest("base64url");
}

function signAccessToken(claims: AccessClaims): string {
  // A random nonce makes every issued token unique even when the claims (same
  // user/client/audience) and the per-second expiry are identical — otherwise two
  // issuances in the same second collide on the stored token hash.
  const claimsWithNonce = { ...claims, n: randomBytes(9).toString("base64url") };
  const payload = Buffer.from(JSON.stringify(claimsWithNonce)).toString("base64url");
  return `gco_${payload}.${sign(payload)}`;
}

/** Verify a signed access token's signature and decode its claims. Returns null
 *  for anything that isn't a well-formed, correctly-signed token (including a
 *  legacy opaque token, which has no `.` separator). Does NOT check expiry. */
function verifyAccessToken(token: string): AccessClaims | null {
  if (!token.startsWith("gco_")) return null;
  const body = token.slice(4);
  const dot = body.indexOf(".");
  if (dot < 0) return null;
  const payload = body.slice(0, dot);
  const got = Buffer.from(body.slice(dot + 1));
  const want = Buffer.from(sign(payload));
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null;
  try {
    return JSON.parse(Buffer.from(payload, "base64url").toString()) as AccessClaims;
  } catch {
    return null;
  }
}

/** Verify a PKCE S256 challenge against the verifier (constant-time). */
export function verifyPkce(verifier: string, challenge: string, method: string): boolean {
  if (method !== "S256") return false;
  const computed = createHash("sha256").update(verifier).digest().toString("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(challenge);
  return a.length === b.length && timingSafeEqual(a, b);
}

// ---- Clients ----

export async function getOAuthClient(clientId: string): Promise<OAuthClient | null> {
  const [row] = await db.select().from(oauthClients).where(eq(oauthClients.clientId, clientId));
  return row ?? null;
}

/** Register a Dynamic Client Registration (RFC 7591) client; generates a client_id. */
export async function registerDcrClient(input: {
  clientName: string;
  redirectUris: string[];
  tokenEndpointAuthMethod?: string;
}): Promise<OAuthClient> {
  const clientId = `gcc_${randomBytes(16).toString("hex")}`;
  const [row] = await db
    .insert(oauthClients)
    .values({
      clientId,
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      tokenEndpointAuthMethod: input.tokenEndpointAuthMethod ?? "none",
      registration: "dcr",
    })
    .returning();
  return row!;
}

/** Upsert a CIMD client keyed by its metadata-document URL (== client_id). */
export async function upsertCimdClient(input: {
  clientId: string;
  clientName: string;
  redirectUris: string[];
}): Promise<OAuthClient> {
  const [row] = await db
    .insert(oauthClients)
    .values({
      clientId: input.clientId,
      clientName: input.clientName,
      redirectUris: input.redirectUris,
      registration: "cimd",
    })
    .onConflictDoUpdate({
      target: oauthClients.clientId,
      set: { clientName: input.clientName, redirectUris: input.redirectUris },
    })
    .returning();
  return row!;
}

// ---- Authorization codes ----

export async function createAuthCode(input: {
  clientId: string;
  userId: string;
  redirectUri: string;
  codeChallenge: string;
  codeChallengeMethod: string;
  scope?: string;
  resource?: string;
}): Promise<string> {
  const code = `gca_${randomBytes(32).toString("hex")}`;
  await db.insert(oauthAuthCodes).values({
    codeHash: hashToken(code),
    clientId: input.clientId,
    userId: input.userId,
    redirectUri: input.redirectUri,
    codeChallenge: input.codeChallenge,
    codeChallengeMethod: input.codeChallengeMethod,
    scope: input.scope ?? null,
    resource: input.resource ?? null,
    expiresAt: new Date(Date.now() + CODE_TTL_MS),
  });
  return code;
}

async function issueTokens(input: {
  clientId: string;
  userId: string;
  scope: string | null;
  audience: string;
}): Promise<IssuedTokens> {
  // Embed the user's tenant + jurisdiction into the signed token so the MCP path
  // never has to look them up. These reads happen only at issuance (once per
  // hour, on refresh), so a tenant/jurisdiction change takes effect within 1h.
  const [tenantId, jurisdiction] = await Promise.all([
    getUserTenant(input.userId),
    getUserJurisdiction(input.userId),
  ]);
  const accessToken = signAccessToken({
    u: input.userId,
    c: input.clientId,
    t: tenantId,
    j: jurisdiction,
    a: input.audience,
    e: Math.floor((Date.now() + ACCESS_TTL_MS) / 1000),
  });
  const refreshToken = `gcr_${randomBytes(32).toString("hex")}`;
  // The row backs the refresh token (opaque, DB-validated for rotation). The
  // access token is self-validating; its hash is stored only to satisfy the
  // unique column and leave a handle for audit, never read on the hot path.
  await db.insert(oauthAccessTokens).values({
    tokenHash: hashToken(accessToken),
    refreshTokenHash: hashToken(refreshToken),
    clientId: input.clientId,
    userId: input.userId,
    scope: input.scope,
    audience: input.audience,
    expiresAt: new Date(Date.now() + ACCESS_TTL_MS),
  });
  return { accessToken, refreshToken, expiresIn: ACCESS_TTL_MS / 1000 };
}

/** Exchange an authorization code for tokens, verifying PKCE and the client/redirect. */
export async function exchangeCode(input: {
  code: string;
  clientId: string;
  redirectUri: string;
  codeVerifier: string;
}): Promise<IssuedTokens | { error: string }> {
  const [row] = await db
    .select()
    .from(oauthAuthCodes)
    .where(eq(oauthAuthCodes.codeHash, hashToken(input.code)));
  if (
    !row ||
    row.consumedAt ||
    row.expiresAt < new Date() ||
    row.clientId !== input.clientId ||
    row.redirectUri !== input.redirectUri ||
    !verifyPkce(input.codeVerifier, row.codeChallenge, row.codeChallengeMethod)
  ) {
    return { error: "invalid_grant" };
  }
  await db
    .update(oauthAuthCodes)
    .set({ consumedAt: new Date() })
    .where(eq(oauthAuthCodes.codeHash, row.codeHash));
  return issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
    audience: row.resource ?? "",
  });
}

/** Rotate a refresh token (OAuth 2.1 requires rotation for public clients). */
export async function refreshAccessToken(input: {
  refreshToken: string;
  clientId: string;
}): Promise<IssuedTokens | { error: string }> {
  const [row] = await db
    .select()
    .from(oauthAccessTokens)
    .where(
      and(
        eq(oauthAccessTokens.refreshTokenHash, hashToken(input.refreshToken)),
        isNull(oauthAccessTokens.revokedAt)
      )
    );
  if (!row || row.clientId !== input.clientId) return { error: "invalid_grant" };
  await db
    .update(oauthAccessTokens)
    .set({ revokedAt: new Date() })
    .where(eq(oauthAccessTokens.id, row.id));
  return issueTokens({
    clientId: row.clientId,
    userId: row.userId,
    scope: row.scope,
    audience: row.audience,
  });
}

/**
 * Validate an OAuth access token for a specific audience (the MCP server address).
 * Enforces the RFC 8707 audience binding: a token is only valid at the resource
 * it was issued for. Returns the bound user, or null.
 */
export async function resolveOAuthToken(
  token: string,
  audience: string
): Promise<{
  userId: string;
  clientId: string;
  tenantId: string | null;
  jurisdiction: string | null;
} | null> {
  // Fast path: a signed, self-validating token — pure crypto, no DB round-trip.
  const claims = verifyAccessToken(token);
  if (claims) {
    if (claims.a !== audience || claims.e * 1000 < Date.now()) return null;
    return { userId: claims.u, clientId: claims.c, tenantId: claims.t, jurisdiction: claims.j };
  }
  // Fallback: a legacy opaque token still in flight (issued before signing, or in
  // tests). DB-validated, including expiry + revocation; these age out within the
  // 1h access TTL. Tenant/jurisdiction are looked up here so the caller stays
  // uniform — this path is rare and short-lived.
  const [row] = await db
    .select()
    .from(oauthAccessTokens)
    .where(
      and(eq(oauthAccessTokens.tokenHash, hashToken(token)), isNull(oauthAccessTokens.revokedAt))
    );
  if (!row || row.expiresAt < new Date() || row.audience !== audience) return null;
  const [tenantId, jurisdiction] = await Promise.all([
    getUserTenant(row.userId),
    getUserJurisdiction(row.userId),
  ]);
  return { userId: row.userId, clientId: row.clientId, tenantId, jurisdiction };
}
