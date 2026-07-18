import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { passkey as passkeyPlugin } from "@better-auth/passkey";
import { captcha } from "better-auth/plugins";
import { tanstackStartCookies } from "better-auth/tanstack-start";
import { eq } from "drizzle-orm";
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
import {
  allowedEmailDomainsFromEnv,
  authRateLimitFromEnv,
  emailAllowed,
  trustedOriginsFromEnv,
} from "./auth-options.js";
import { posthog } from "../../posthog.js";

const trustedOrigins = trustedOriginsFromEnv(getEnv);
const allowedEmailDomains = allowedEmailDomainsFromEnv(getEnv);
const emailDomainError = "Use your approved work email to access this environment.";

function rejectEmailDomain(email: string | undefined) {
  if (emailAllowed(email, allowedEmailDomains)) return;
  throw new APIError("BAD_REQUEST", { message: emailDomainError });
}

export const auth = betterAuth({
  // Optional: when unset, better-auth infers the origin from the request, so the
  // app works on any (random) dev port without reconfiguration.
  ...(getEnv("BETTER_AUTH_URL") ? { baseURL: getEnv("BETTER_AUTH_URL") } : {}),
  ...(trustedOrigins ? { trustedOrigins } : {}),
  secret: getEnv("BETTER_AUTH_SECRET"),
  rateLimit: authRateLimitFromEnv(getEnv),
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;
      rejectEmailDomain(ctx.body?.email);
    }),
  },
  session: {
    // Cache the session in a signed, httpOnly cookie so read paths verify it
    // without a DB round-trip. maxAge bounds how long a revoked session can
    // still read — our documented revocation SLA. Mutations bypass this cache
    // (see requireUser) so a revoked session can never write to the audit
    // spine. Keep this window short for SOC 2 / ISO 27001 access-control.
    cookieCache: { enabled: true, maxAge: 60 },
  },
  database: drizzleAdapter(db, {
    provider: "pg",
    // Auth tables live in the `auth` Postgres schema; pass them explicitly.
    schema: { user, session, account, verification, passkey },
  }),
  emailAndPassword: {
    enabled: true,
    disableSignUp: getEnv("ALLOW_SIGNUPS") === "false",
    // Disable auto sign-in only when verification is required (real provider).
    // Otherwise auto sign-in hits the unverified-email path and fires a second
    // verification email via sendOnSignIn. In dev (no provider) keep it on so
    // signup lands straight in the app.
    autoSignIn: !emailEnabled(),
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
    sendOnSignUp: emailEnabled(),
    sendOnSignIn: emailEnabled(),
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
        // Staging can restrict account access to approved email domains. Enforce
        // here so every sign-in method, including passkeys, uses the same gate.
        before: async (s) => {
          const rows = await db
            .select({ email: user.email })
            .from(user)
            .where(eq(user.id, s.userId))
            .limit(1);
          rejectEmailDomain(rows[0]?.email);
          return { data: s };
        },
        // A new session = a successful login. Capture it for the audit log.
        after: async (s) => {
          void recordAudit({
            eventType: "auth.login",
            actorId: s.userId,
            ip: s.ipAddress ?? null,
            userAgent: s.userAgent ?? null,
            target: s.id,
          });
          posthog.capture({
            distinctId: s.userId,
            event: "user logged in",
            properties: {
              $ip: s.ipAddress ?? undefined,
              $user_agent: s.userAgent ?? undefined,
            },
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
          rejectEmailDomain(u.email);
          const name = u.name?.trim() ?? "";
          if (!name) throw new APIError("BAD_REQUEST", { message: "Name is required." });
          return { data: { ...u, name } };
        },
        // Create-or-invite: a matching pending invite joins that tenant, else a
        // new tenant is created (user becomes admin). Then provision a home
        // matter. Idempotent.
        after: async (u) => {
          await provisionUserTenant({ id: u.id, name: u.name, email: u.email });
          posthog.capture({
            distinctId: u.id,
            event: "user signed up",
            properties: {
              $set: { name: u.name, email: u.email },
            },
          });
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
