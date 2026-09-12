import type { Context } from "hono";
import { getEnv } from "@workspace/core";

/** The externally-visible origin (scheme + host), honoring reverse-proxy headers. */
export function serverOrigin(c: Context, configuredOrigin = getEnv("BETTER_AUTH_URL")): string {
  // The configured public address is authoritative behind TLS-terminating proxies.
  // An internal HTTP hop must not change discovery URLs or resource audiences.
  if (configuredOrigin?.trim()) {
    const configured = new URL(configuredOrigin.trim());
    if (
      !["http:", "https:"].includes(configured.protocol) ||
      configured.username ||
      configured.password
    ) {
      throw new Error("BETTER_AUTH_URL must be an HTTP(S) origin without credentials");
    }
    return configured.origin;
  }
  const url = new URL(c.req.url);
  // A proxy chain appends to X-Forwarded-* (comma-separated); the first hop is the
  // client-facing value. Take it, or the URLs become malformed ("https, http://…").
  const first = (v: string | undefined) => v?.split(",")[0]?.trim();
  const proto = first(c.req.header("x-forwarded-proto")) ?? url.protocol.replace(":", "");
  const host = first(c.req.header("x-forwarded-host")) ?? c.req.header("host") ?? url.host;
  return `${proto}://${host}`;
}

/** The MCP server address, used as the OAuth resource id and token audience. */
export function mcpResourceUri(c: Context): string {
  return `${serverOrigin(c)}/api/mcp`;
}
