import { betterAuth } from "better-auth";
import { APIError } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { captcha } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import {
  emailEnabled,
  getEnv,
  provisionUserTenant,
  recordAudit,
  sendDeleteAccountEmail,
  sendPasswordResetEmail,
  sendVerificationEmail,
} from "@workspace/core";
import { db } from "@workspace/db/client";
import { account, passkey, session, user, verification } from "@workspace/db/schema";
import { authRateLimitFromEnv, trustedOriginsFromEnv } from "./auth-options.js";

const trustedOrigins = trustedOriginsFromEnv(getEnv);

export const auth = betterAuth({
  // Optional: when unset, better-auth infers the origin from the request, so the
  // app works on any (random) dev port without reconfiguration.
  ...(getEnv("BETTER_AUTH_URL") ? { baseURL: getEnv("BETTER_AUTH_URL") } : {}),
  ...(trustedOrigins ? { trustedOrigins } : {}),
  secret: getEnv("BETTER_AUTH_SECRET"),
  rateLimit: authRateLimitFromEnv(getEnv),
  database: drizzleAdapter(db, {
    provider: "pg",
    // Auth tables live in the `auth` Postgres schema; pass them explicitly.
    schema: { user, session, account, verification, passkey },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: getEnv("ALLOW_SIGNUPS") === "false",
    // Require a verified email before sign-in only once a real provider is
    // configured. In dev (console transport) this stays off so local accounts
    // remain usable without clicking a logged link.
    requireEmailVerification: emailEnabled(),
    sendResetPassword: async ({ user: u, url }) => {
      await sendPasswordResetEmail(u.email, url);
    },
    onPasswordReset: async ({ user: u }) => {
      void recordAudit({
        eventType: "auth.password_reset",
        actorId: u.id,
        target: u.email,
      });
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
    // Self-service account changes. Email changes verify through the new address
    // when a real provider is wired; local dev has no inbox, so it updates
    // immediately. Delete uses the same provider split below.
    changeEmail: { enabled: true, updateEmailWithoutVerification: !emailEnabled() },
    deleteUser: {
      enabled: true,
      ...(emailEnabled()
        ? {
            sendDeleteAccountVerification: async ({ user: u, url }) => {
              await sendDeleteAccountEmail(u.email, url);
            },
          }
        : {}),
    },
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
        // A name is mandatory — it's the actor label across the audit trail. The
        // column is NOT NULL but still accepts "", so reject empty/whitespace-only
        // names here (covers any client, not just our form) and store it trimmed.
        before: async (u) => {
          const name = u.name?.trim() ?? "";
          if (!name) throw new APIError("BAD_REQUEST", { message: "Name is required." });
          return { data: { ...u, name } };
        },
        // Create-or-invite: a matching pending invite joins that tenant, else a
        // new tenant is created (user becomes admin). Then provision a home
        // matter. Idempotent.
        after: async (u) => {
          await provisionUserTenant({ id: u.id, name: u.name, email: u.email });
        },
      },
    },
  },
  plugins: [
    // Cloudflare Turnstile bot protection on sign-up / sign-in / password-reset.
    // Verifies the `x-captcha-response` header server-side against Cloudflare.
    // Gated on the secret: unset (local dev) leaves auth open so accounts stay
    // usable without a widget. Set TURNSTILE_SECRET_KEY on staging/prod to enforce.
    ...(getEnv("TURNSTILE_SECRET_KEY")
      ? [
          captcha({
            provider: "cloudflare-turnstile",
            secretKey: getEnv("TURNSTILE_SECRET_KEY") as string,
          }),
        ]
      : []),
    passkeyPlugin({
      rpName: "gitmatter",
    }),
    // Ensures Set-Cookie survives TanStack Start server-fn responses.
    tanstackStartCookies(),
  ],
});

export type Session = typeof auth.$Infer.Session;
