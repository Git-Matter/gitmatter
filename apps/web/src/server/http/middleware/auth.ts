import type { Context, MiddlewareHandler } from "hono";
import { auth } from "../lib/auth.js";

export type AuthedUser = { id: string; email: string; name: string };

/** Hono env for authenticated routes: `c.get("user")` is typed. */
export type AuthEnv = { Variables: { user: AuthedUser } };

/** Resolve the better-auth session user from request headers, or null. */
export async function getUser(c: Context): Promise<AuthedUser | null> {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session?.user) return null;
  return { id: session.user.id, email: session.user.email, name: session.user.name };
}

/** Reject unauthenticated requests with 401; otherwise stash the user on context. */
export const requireUser: MiddlewareHandler<AuthEnv> = async (c, next) => {
  const user = await getUser(c);
  if (!user) return c.json({ error: "Unauthorized" }, 401);
  c.set("user", user);
  await next();
};
