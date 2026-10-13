# MFA with better-auth (two-factor)

Add multi-factor authentication to gitmatter using better-auth's `twoFactor` plugin. TOTP
(authenticator app) as the primary second factor, with backup codes for recovery. No SMS.

Today login supports email + password and passkeys, but password login has no second factor. The
Security marketing page lists MFA as "on our roadmap" — this delivers it.

**Status: Runtime-verified** (local implementation and acceptance completed 2026-09-21; not yet
deployed or production-verified).

## Why

- Legal-work product: a firm's infosec review expects MFA. It is the single biggest gap flagged in
  the Security page.
- better-auth ships a maintained `twoFactor` plugin (server + client), so we add a factor without
  hand-rolling TOTP, secrets, or backup codes.

## Scope

In scope:

- TOTP enrollment (QR + manual secret), verification, and disable.
- Backup codes (one-time recovery).
- Two-step login: when 2FA is enabled, password success triggers a second verification step.
- Per-user opt-in from account settings. Optional later: tenant-admin enforcement.
- Audit-log entries for enable / disable / failed second factor.

Out of scope (note explicitly, do not silently drop):

- SMS / phone OTP.
- Email OTP as a second factor (plugin supports it; skip for v1).
- WebAuthn / passkeys (separate plugin, separate plan).
- Org-wide mandatory enforcement (leave a hook, ship opt-in first).

## Library

`better-auth@1.7.5`. Plugin: `twoFactor` (server) +
`twoFactorClient` (client). Verified against current better-auth 2FA docs.

TOTP and backup codes do not depend on transactional email. Gitmatter's existing Resend transport
continues to serve verification, password-reset, account-deletion, and invite emails. Email OTP is
not enabled as a second factor in this scope.

## Changes

### 1. Server — `apps/web/src/server/http/lib/auth.ts`

- Import `twoFactor` from `better-auth/plugins`.
- Add to the `plugins` array (keep `tanstackStartCookies()`):
  ```ts
  plugins: [
    twoFactor({
      issuer: "gitmatter", // shown in the authenticator app
      // skipVerificationOnEnable stays false: require a TOTP code to confirm enrollment
    }),
    tanstackStartCookies(),
  ];
  ```
- The plugin adds endpoints under `/two-factor/*`: `enable`, `verify-totp`, `disable`,
  `generate-backup-codes`, `verify-backup-code`.
- Audit: extend `databaseHooks` (or wrap the endpoints) so 2FA enable/disable and failed
  verification land in the audit log via `recordAudit`, consistent with the existing
  `auth.login` hook. New event types: `auth.2fa.enabled`, `auth.2fa.disabled`,
  `auth.2fa.failed`.

### 2. Database — `packages/db/src/schema/auth.ts` + migration

The plugin requires:

- New `twoFactor` table in the `auth` Postgres schema: `id`, `userId` (FK → user.id),
  `secret`, `backupCodes`, `verified`, `failedVerificationCount`, `lockedUntil`.
- New field on `user`: `twoFactorEnabled` (boolean).

Steps:

- Add the `twoFactor` table and the `user.twoFactorEnabled` column to `schema/auth.ts`,
  matching the existing `auth`-schema convention used by user/session/account/verification.
- Register the table in the drizzle adapter `schema` map in `auth.ts`
  (`schema: { user, session, account, verification, twoFactor }`).
- Regenerate + check the migration:
  `vp run --filter=@workspace/db generate` then review the SQL before committing.
- (Optional) `better-auth generate` can scaffold the schema; reconcile its output with our
  hand-authored drizzle style rather than committing its raw output.

### 3. Client — `apps/web/src/lib/auth/auth-client.ts`

- Add `twoFactorClient` to `createAuthClient` plugins:
  ```ts
  plugins: [
    twoFactorClient({
      onTwoFactorRedirect() {
        window.location.href = "/2fa";
      },
    }),
  ];
  ```
- Export the new methods: `twoFactor` namespace (`enable`, `disable`, `verifyTotp`,
  `generateBackupCodes`, `verifyBackupCode`).

### 4. Login flow — `apps/web/src/routes/_unauth/login.tsx`

- When 2FA is enabled, `signIn.email(...)` does not complete the session; it triggers
  `onTwoFactorRedirect`. Today `login.tsx` hard-redirects to `next ?? "/assistant"` on success —
  that path must yield to the 2FA step.
- Add a `/2fa` route (new `apps/web/src/routes/_unauth/2fa.tsx`): a code input that calls
  `twoFactor.verifyTotp({ code })`, with a "use a backup code" fallback
  (`twoFactor.verifyBackupCode`). On success, do the same full reload to `next ?? "/assistant"`.
- Preserve the `next` param across the 2FA hop (carry it in search params).

### 5. Account settings — `apps/web/src/routes/_auth/settings/`

- New "Two-factor authentication" section:
  - Disabled state: "Enable" → prompt for password → call `twoFactor.enable` → show QR
    (render `totpURI`) + the backup codes once → require a TOTP code to confirm
    (`verifyTotp`) → mark enabled.
  - Enabled state: show status, "Regenerate backup codes", and "Disable" (password-gated).
- Match the existing settings UI patterns (changeEmail / changePassword already live here).

## Verify

1. Migration: `vp run --filter=@workspace/db generate` produces the `twoFactor` table +
   `user.twoFactorEnabled`; SQL reviewed. → check: migration file present and sane.
2. `vp check` + `vp run typecheck` pass. → check: green.
3. Enroll: settings → enable → scan QR in an authenticator → confirm code → enabled.
   → check: `user.twoFactorEnabled = true`, `twoFactor` row `verified = true`.
4. Login with 2FA on: email+password → redirected to `/2fa` → correct TOTP logs in;
   wrong code rejected. → check: session only created after second factor.
5. Backup code: verify one logs in and cannot be reused. → check: one-time use enforced.
6. Disable (password-gated) clears 2FA. → check: `twoFactorEnabled = false`, row removed.
7. Audit log shows enable / disable / failed-verification events.

Local verification evidence (2026-09-21): migration applied successfully; `vp check`,
`vp run typecheck`, the web production build, and all 168 `vp test` tests passed. A disposable local
account completed enrollment, rejected an incorrect TOTP, completed TOTP and backup-code logins,
rejected reuse of a consumed backup code, disabled MFA cleanly, and produced the expected MFA audit
events. The `/2fa` authenticator and backup-code states were also browser-checked. Production claims
and the Security marketing copy remain unchanged until the feature is deployed and verified there.

Upgrade verification (2026-09-21): aligned Better Auth and passkey packages at `1.7.5`, upgraded
the shared Drizzle ORM dependency to `0.45.2`, added the 1.7 two-factor lockout fields in migration
`0010_watery_major_mapleleaf.sql`, and confirmed the database has no duplicate account keys or
1.7.0-1.7.2 `issuer` column. A fresh local account then completed TOTP enrollment, TOTP login, and
backup-code recovery on Better Auth 1.7.5.

## Sign-off review (2026-10-11)

Source and repository checks were repeated on the current branch. Fixed an open redirect in the
post-login `next` handling: login, email verification, and MFA now share `safeLoginNext`, rejecting
protocol-relative destinations, backslashes, and control/whitespace characters. The regression test
preserves legitimate matter/OAuth return paths. Migration generation reports no schema drift.
The current MFA page renders both authenticator and backup-code states with empty submit disabled.

The 2026-09-21 enrollment/login/recovery/disable/audit evidence above remains historical runtime
proof; fresh enrollment and recovery were not repeated in this review. The repository requires the
`aws-secrets-manager` skill before credential work, and that skill is unavailable in this session.
No deployment, production acceptance, or marketing availability claim was made. Keep the status
Runtime-verified (local historical proof), with fresh authenticated and production sign-off pending.

## Open questions

- Enforcement: opt-in only for v1, or let tenant admins require 2FA for their members? (Leave the
  hook; default opt-in.)
- Email OTP as an alternative second factor — defer to v2?
- Update `docs/admin/self-hosting.mdx` and the Security marketing page (move MFA from "roadmap" to
  "available") once shipped.
