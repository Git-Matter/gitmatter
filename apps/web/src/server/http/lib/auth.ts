import { betterAuth } from "better-auth";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import {
  emailEnabled,
  getEnv,
  provisionUserTenant,
  recordAudit,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@workspace/core";
import { db } from "@workspace/db/client";
import { account, session, user, verification } from "@workspace/db/schema";

export const auth = betterAuth({
  // Optional: when unset, better-auth infers the origin from the request, so the
  // app works on any (random) dev port without reconfiguration.
  ...(getEnv("BETTER_AUTH_URL") ? { baseURL: getEnv("BETTER_AUTH_URL") } : {}),
  secret: getEnv("BETTER_AUTH_SECRET"),
  database: drizzleAdapter(db, {
    provider: "pg",
    // Auth tables live in the `auth` Postgres schema; pass them explicitly.
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    // Require a verified email before sign-in only once a real provider is
    // configured. In dev (console transport) this stays off so local accounts
    // remain usable without clicking a logged link.
    requireEmailVerification: emailEnabled(),
    sendResetPassword: async ({ user: u, url }) => {
      await sendPasswordResetEmail(u.email, url);
    },
  },
  emailVerification: {
    sendOnSignUp: true,
    autoSignInAfterVerification: true,
    sendVerificationEmail: async ({ user: u, url }) => {
      await sendVerificationEmail(u.email, url);
    },
  },
  user: {
    // Self-service account changes. changeEmail applies immediately; deleteUser
    // runs immediately (no sendDeleteAccountVerification callback) — revisit
    // once a provider is wired to gate these behind verification.
    changeEmail: { enabled: true },
    deleteUser: { enabled: true },
    // tenantId/role are owned by the signup hook — not client-settable.
    additionalFields: {
      tenantId: { type: "string", required: false, input: false },
      tenantRole: { type: "string", required: false, input: false },
    },
  },
  databaseHooks: {
    session: {
      create: {
        // A new session = a successful login. Capture it for the audit log.
        after: async (s) => {
          void recordAudit({
            eventType: "auth.login",
            actorId: s.userId,
            ip: s.ipAddress ?? null,
            userAgent: s.userAgent ?? null,
            target: s.id,
          });
        },
      },
    },
    user: {
      create: {
        // Create-or-invite: a matching pending invite joins that tenant, else a
        // new tenant is created (user becomes admin). Then provision a home
        // matter. Idempotent.
        after: async (u) => {
          await provisionUserTenant({ id: u.id, name: u.name, email: u.email });
        },
      },
    },
  },
  // Ensures Set-Cookie survives TanStack Start server-fn responses.
  plugins: [tanstackStartCookies()],
});

export type Session = typeof auth.$Infer.Session;
