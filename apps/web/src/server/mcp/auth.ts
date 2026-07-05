import type { Context } from "hono";
import { resolveMcpAccount, resolveOAuthToken, type TokenScope } from "@workspace/core";
import { mcpResourceUri } from "../http/lib/origin.js";

/** The fully-resolved account behind an MCP request: who, plus the tenant and
 *  (raw) jurisdiction needed to build the tool catalog — all without the route
 *  having to run further lookups. */
export type AuthenticatedMcp = {
  userId: string;
  label: string;
  tokenId?: string;
  tenantId: string | null;
  jurisdiction: string | null;
  /** Least-privilege restriction minted into a static token; OAuth tokens are
   *  unscoped for now. Null = full power of the user. */
  scope: TokenScope | null;
};

/** Resolve the gitmatter account behind an `Authorization: Bearer <token>`
 *  header. Returns tenant + jurisdiction inline: a static token resolves them in
 *  one joined query; a signed OAuth token carries them in its claims. */
export async function authenticateMcp(c: Context): Promise<AuthenticatedMcp | null> {
  const header = c.req.header("authorization") ?? "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  if (!match) return null;
  const token = match[1]!.trim();
  // A static minted token (gc_) first; then an OAuth access token bound to this
  // resource — the MCP server address is the required token audience (RFC 8707).
  const stat = await resolveMcpAccount(token);
  if (stat) return stat;
  const oauth = await resolveOAuthToken(token, mcpResourceUri(c));
  if (oauth) {
    return {
      userId: oauth.userId,
      label: `oauth:${oauth.clientId}`,
      tenantId: oauth.tenantId,
      jurisdiction: oauth.jurisdiction,
      scope: null,
    };
  }
  return null;
}
