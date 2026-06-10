import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { db } from "@workspace/db/client";
import { account, session, user, verification } from "@workspace/db/schema";

export const auth = betterAuth({
  // Optional: when unset, better-auth infers the origin from the request, so the
  // app works on any (random) dev port without reconfiguration.
  ...(process.env.BETTER_AUTH_URL ? { baseURL: process.env.BETTER_AUTH_URL } : {}),
  secret: process.env.BETTER_AUTH_SECRET,
  database: drizzleAdapter(db, {
    provider: "pg",
    // Auth tables live in the `auth` Postgres schema; pass them explicitly.
    schema: { user, session, account, verification },
  }),
  emailAndPassword: { enabled: true },
  // Ensures Set-Cookie survives TanStack Start server-fn responses.
  plugins: [tanstackStartCookies()],
});

export type Session = typeof auth.$Infer.Session;
