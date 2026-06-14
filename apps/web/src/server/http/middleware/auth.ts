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

/** Resolve the better-auth session user from request headers, or null. */
export async function getUser(c: Context): Promise<AuthedUser | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
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
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};
