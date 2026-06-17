import type { Context } from "hono";
import { getEnv } from "@workspace/core";

/**
 * Best-effort client IP + User-Agent for audit logging.
 *
 * Forwarded headers (`x-forwarded-for`/`x-real-ip`) are client-controllable and
 * therefore spoofable unless a trusted proxy/edge sets them. We only read them
 * when `TRUST_PROXY=true` (set this only when the edge strips client-supplied
 * forwarded headers). Otherwise the audit IP is left null rather than recording
 * a value an attacker could forge. User-Agent is informational, never trusted.
 */
export function clientMeta(c: Context): { ip: string | null; userAgent: string | null } {
  let ip: string | null = null;
  if (getEnv("TRUST_PROXY") === "true") {
    const fwd = c.req.header("x-forwarded-for");
    ip = fwd ? (fwd.split(",")[0]?.trim() ?? null) : (c.req.header("x-real-ip") ?? null);
  }
  return { ip, userAgent: c.req.header("user-agent") ?? null };
}
