import type { Context, MiddlewareHandler } from "hono";
import { auth } from "../lib/auth.js";

export type AuthedUser = {
  id: string;
  email: string;
  name: string;
  // From better-auth additionalFields; always set by the signup hook.
  tenantId: string;
  tenantRole: "admin" | "member";
};

/** Hono env for authenticated routes: `c.get("user")` is typed. */
export type AuthEnv = { Variables: { user: AuthedUser } };

/**
 * Resolve the better-auth session user from request headers, or null.
 *
 * `fresh` skips the session cookie cache and forces a DB lookup, so a revoked
 * session is rejected immediately. requireUser sets it for every mutating
 * method; read paths ride the cache (see auth.ts session.cookieCache).
 */
export async function getUser(c: Context, fresh = false): Promise<AuthedUser | null> {
  const session = await auth.api.getSession({
    headers: c.req.raw.headers,
    query: { disableCookieCache: fresh },
  });
  if (!session?.user) return null;
  const u = session.user as typeof session.user & {
    tenantId?: string;
    tenantRole?: "admin" | "member";
  };
  return {
    id: u.id,
    email: u.email,
    name: u.name,
    tenantId: u.tenantId ?? "",
    tenantRole: u.tenantRole ?? "member",
  };
}

/** Reject unauthenticated requests with 401; otherwise stash the user on context. */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  // Mutating requests (POST/PUT/PATCH/DELETE) — including every write to the
  // audit spine — re-validate against the DB so revocation takes effect at
  // once. GET/HEAD reads ride the cookie cache.
  const fresh = !["GET", "HEAD"].includes(c.req.method);
  const user = await getUser(c, fresh);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};
