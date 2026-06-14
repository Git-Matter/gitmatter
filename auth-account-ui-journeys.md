# Authentication & Account UI Journeys (Detailed)

## 1. Login — `/login`

**File:** `frontend/src/app/login/page.tsx`

### Route & guards

- Public route. Uses `useAuth` to watch `isAuthenticated` / `authLoading`.
- `useEffect` at line 25: once auth is no longer loading and user is already authenticated, calls `router.replace("/assistant")`.

### User-visible elements

- **Site logo** (`SiteLogo size="lg" asLink`) at top center; links to `/`.
- **Card title:** "Log In".
- **Toggle link group:** current "Log in" (active) and `/signup` link.
- **Email field** (`id="email"`, `type="email"`, required, placeholder "Enter your email").
- **Password field** (`id="password"`, `type="password"`, required, placeholder "Enter your password").
- **Submit button:** label switches from "Log in" → "Logging in..." when `loading`.
- **Disclaimer** below card: demo-service warning.

### State variables

| Var        | Type             | Purpose                          |
| ---------- | ---------------- | -------------------------------- |
| `email`    | `string`         | Login email input.               |
| `password` | `string`         | Login password input.            |
| `loading`  | `boolean`        | Blocks submit and changes label. |
| `error`    | `string \| null` | Displays inline red error box.   |

### Validation

- HTML5 `required` on both inputs.
- No custom email/password format validation.

### API / Supabase calls

1. `supabase.auth.signInWithPassword({ email, password })` (line 37) — triggered by form submit.

### Success / redirect / errors

- On success: `router.push("/assistant")` (line 44).
- On error: `setError(error.message || "An error occurred during login")`.

---

## 2. Signup — `/signup`

**File:** `frontend/src/app/signup/page.tsx`

### Route & guards

- Public route.
- `useEffect` line 31: if authenticated (and not already in `success` state), redirects to `/assistant`.

### User-visible elements

- **Site logo** top center.
- **Card title:** "Create Account".
- **Toggle link group:** `/login` link and active "Sign up".
- **Fields:**
  - Name (optional, text, placeholder "Your name").
  - Organisation (optional, text, placeholder "Your organisation").
  - Email (required, type="email", placeholder "Enter your email").
  - Password (required, placeholder "Create a password (min. 6 characters)").
  - Confirm Password (required, placeholder "Confirm your password").
- **Submit button:** "Sign up" / "Creating account...".
- **Terms copy:** links to `https://mikeoss.com/terms` and `https://mikeoss.com/privacy` (open in new tab).
- **Success view** (when `success` true): green check, "Account created!", "Redirecting you to the home page...".
- **Disclaimer** below card.

### State variables

| Var                                                            | Type             | Purpose                               |
| -------------------------------------------------------------- | ---------------- | ------------------------------------- |
| `email`, `password`, `confirmPassword`, `name`, `organisation` | `string`         | Input values.                         |
| `loading`                                                      | `boolean`        | Blocks submit.                        |
| `error`                                                        | `string \| null` | Inline error.                         |
| `success`                                                      | `boolean`        | Renders success card instead of form. |

### Validation

- `password !== confirmPassword` → `"Passwords do not match"` (line 43).
- `password.length < 6` → `"Password must be at least 6 characters"` (line 50).
- Email and password inputs are `required`.

### API / Supabase calls

1. `supabase.auth.signUp({ email, password })` (line 57) on submit.
2. If `data.session` exists and name/org are non-empty, calls `updateUserProfile({ displayName?, organisation? })` from `mikeApi.ts` (line 69).

### Success / redirect / errors

- On signup success sets `success = true` and after 2s `router.push("/assistant")` (line 82).
- Profile-update failure is swallowed (`console.error`) and still shows success.
- Error displayed: `error.message` or `"An error occurred during signup"`.

---

## 3. MFA Verify Page — `/verify-mfa`

**File:** `frontend/src/app/verify-mfa/page.tsx`

### Route & usage

- Dedicated route rendered when `MfaLoginGate` redirects a logged-in user whose `profile.mfaOnLogin` is enabled and MFA is required.
- Accepts `?next=` query param.

### User-visible elements

- **Site logo** top center.
- **Title:** "Verify your identity".
- **Subtitle:** "Enter the six-digit code from your authenticator app to continue."
- **Factor selector `<select>`** (only shown when `factors.length > 1`).
- **6-digit verification input** (`VerificationCodeInput`) from `MfaVerificationPopup.tsx`.
- **Cancel button** (calls `signOut()` then redirects to `/login`).
- **Verify button** (disabled until factor selected and 6 digits entered).
- **Loading spinner** while factors load.
- **Empty-state message** when no verified factor exists.
- **Inline error** in red.

### State variables

| Var                | Type             | Purpose                       |
| ------------------ | ---------------- | ----------------------------- |
| `factors`          | `MfaFactor[]`    | Verified TOTP factors.        |
| `selectedFactorId` | `string`         | Currently chosen factor.      |
| `code`             | `string`         | 6-digit code.                 |
| `loading`          | `boolean`        | Initial factor loading.       |
| `verifying`        | `boolean`        | Challenge/verify in progress. |
| `error`            | `string \| null` | Error message.                |

### Validation

- `canVerify` = `!loading && !verifying && !!selectedFactorId && code.trim().length === 6` (line 37).

### API / Supabase calls

1. `needsMfaVerification()` from `MfaVerificationPopup.tsx` (Supabase `mfa.getAuthenticatorAssuranceLevel()`).
2. If required, `supabase.auth.mfa.listFactors()` (line 61).
3. On Verify click: `supabase.auth.mfa.challengeAndVerify({ factorId, code })` (line 98).
4. On Cancel: `signOut()` from `AuthContext` (local scope sign-out).

### Success / redirect

- On verify success: `markMfaVerifiedForGate()` writes session storage key, then `router.replace(nextPath)`.
- `safeNextPath` (line 212): defaults to `/assistant`; rejects null, non-`/`, `//`, and `/verify-mfa`.

### Edge cases

- Unauthenticated user → `router.replace("/login")` (line 42).
- No factors → shows error and empty state.

---

## 4. MFA Login Gate — `MfaLoginGate`

**File:** `frontend/src/app/components/shared/MfaLoginGate.tsx`

### Usage location

- Wrapped around authenticated routes (e.g., account layout / app root) to force MFA after login when `profile.mfaOnLogin` is true.

### User-visible elements

- Renders a `FullScreenGateLoader` (centered spinner on `bg-gray-50/80`) while checking or redirecting.

### State variables

| Var         | Type                                               | Purpose                 |
| ----------- | -------------------------------------------------- | ----------------------- |
| `gateState` | `"idle" \| "checking" \| "required" \| "verified"` | Tracks MFA requirement. |

### Logic flow

1. If no user → `idle` (render children).
2. If `UserProfileContext` still loading → return loader (line 88).
3. If `profile.mfaOnLogin` is false → `idle`.
4. If `hasRecentMfaVerification()` (session storage timestamp within 60s) → `verified`.
5. Otherwise call `needsMfaVerification()`:
   - If required → `required`.
   - If not → `verified`.

### Redirect behavior

- When `gateState === "required"` and not already on `/verify-mfa`:
  - Redirects to `/verify-mfa?next=<encoded current path + query>` (line 72).
- When `gateState === "verified"` and on `/verify-mfa`:
  - Redirects to safe `next` path (line 74).

### Edge cases

- Grace period: `MFA_VERIFIED_GRACE_MS = 60_000` (line 11).
- Session storage key: `mike:mfa-verified-at`.
- Export `markMfaVerifiedForGate()` updates the timestamp.

---

## 5. MFA Verification Popup — `MfaVerificationPopup` & `VerificationCodeInput`

**File:** `frontend/src/app/components/shared/MfaVerificationPopup.tsx`

### Usage locations

- `AccountPage` (email change, account delete).
- `ApiKeysPage` (save/remove API keys).
- `SecurityPage` (unenroll factor, toggle login MFA).
- `PrivacyDataPage` (exports & deletes).

### User-visible elements (Modal)

- **Title:** default "Two-factor verification required".
- **Message:** default "Enter a code from your authenticator app to continue."
- **Factor `<select>`** when multiple factors.
- **6 single-digit inputs** (`VerificationCodeInput`).
- **Cancel button**.
- **Verify button** (spinning loader when `verifying`).
- **Loading state:** "Loading authenticator...".
- **Empty state:** "No verified authenticator factor is available for this session."
- **Inline error**.

### `VerificationCodeInput` behavior

- 6 boxes, each accepts one digit (`inputMode="numeric"`, `maxLength={1}`).
- Auto-focus first empty box on mount (or first box if full).
- Pasting a numeric string distributes across boxes.
- Arrow keys move focus; Backspace on empty box moves backward.
- Enter submits if `canSubmit`.
- First input has `autoComplete="one-time-code"`.

### State variables

| Var                                   | Type                | Purpose           |
| ------------------------------------- | ------------------- | ----------------- |
| `factors`, `selectedFactorId`, `code` | same as verify page | Code entry.       |
| `loading`                             | `boolean`           | Listing factors.  |
| `verifying`                           | `boolean`           | Challenge/verify. |
| `error`                               | `string \| null`    | Error.            |

### API calls

1. `supabase.auth.mfa.listFactors()` when `open` becomes true.
2. `supabase.auth.mfa.challengeAndVerify({ factorId, code })` on Verify.

### `needsMfaVerification()` helper

- Calls `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`.
- Returns `data.nextLevel === "aal2" && data.currentLevel !== "aal2"`.

---

## 6. Auth Context — `AuthContext`

**File:** `frontend/src/contexts/AuthContext.tsx`

### Usage

- Wraps the app; provides `user`, `isAuthenticated`, `authLoading`, `signOut`, `updateEmail`.

### State variables

| Var           | Type                                   | Purpose                                     |
| ------------- | -------------------------------------- | ------------------------------------------- |
| `user`        | `{ id, email, pendingEmail? } \| null` | Derived from Supabase session user.         |
| `authLoading` | `boolean`                              | True until initial session check completes. |

### Supabase calls

1. Mount: `supabase.auth.getSession()` (line 43).
2. Subscribes `supabase.auth.onAuthStateChange` to keep `user` in sync.

### Methods

- `signOut()` — `supabase.auth.signOut({ scope: "local" })`, then `setUser(null)`.
- `updateEmail(email)` — `supabase.auth.updateUser({ email }, { emailRedirectTo: "${origin}/account" })`; updates local user state; throws on error.

### Edge cases

- `pendingEmail` comes from Supabase `user.new_email`.
- Throws if `useAuth` used outside provider.

---

## 7. User Profile Context — `UserProfileContext`

**File:** `frontend/src/contexts/UserProfileContext.tsx`

### Usage

- Wraps authenticated app; provides profile + mutators for account pages.

### State variables

| Var       | Type                  | Purpose                                                            |
| --------- | --------------------- | ------------------------------------------------------------------ |
| `profile` | `UserProfile \| null` | Full profile including model prefs, MFA, legal research, API keys. |
| `loading` | `boolean`             | Profile fetch state.                                               |

### API calls

- `getUserProfile()` from `mikeApi.ts` on mount / when auth changes.
- Fallback profile constructed on any error (unlimited credits, Free tier, default models, legalResearchUs true, empty API keys).

### Mutators (all guard `if (!user) return false`)

| Mutator                               | API call                                          | Notes                                                           |
| ------------------------------------- | ------------------------------------------------- | --------------------------------------------------------------- |
| `updateDisplayName`                   | `updateUserProfile({ displayName })`              | Swallows errors.                                                |
| `updateOrganisation`                  | `updateUserProfile({ organisation })`             | Re-throws MFA errors.                                           |
| `updateModelPreference(field, value)` | `updateUserProfile({ [field]: value })`           | Swallows errors.                                                |
| `updateMfaOnLogin(enabled)`           | `updateUserMfaOnLogin(enabled)`                   | Re-throws MFA errors.                                           |
| `updateLegalResearchUs(enabled)`      | `updateUserProfile({ legalResearchUs: enabled })` | Swallows errors.                                                |
| `updateApiKey(provider, value)`       | `saveApiKey(provider, normalized)`                | Normalizes empty string to null; re-throws MFA errors.          |
| `reloadProfile()`                     | `loadProfile()`                                   | Only if `userId`.                                               |
| `incrementMessageCredits()`           | none                                              | Returns false if no credits; currently stubbed to return false. |

### Edge cases

- On API failure a generous fallback profile is used so UI never crashes.

---

## 8. Account Layout — `/account/*`

**File:** `frontend/src/app/(pages)/account/layout.tsx`

### Route

- Applies to all `/account` sub-routes.

### Guards

- `useEffect` line 37: if auth finishes loading and user is not authenticated, `router.push("/")`.
- While `authLoading` → full-screen `Loader2` spinner.
- If not authenticated → renders `null`.

### User-visible elements

- **Header:** "Settings" title.
- **Left navigation tabs:**
  1. General — `/account`
  2. Features — `/account/features`
  3. Privacy & Data — `/account/privacy-data`
  4. Security — `/account/security`
  5. Model Preferences — `/account/models`
  6. API Keys — `/account/api-keys`
- Active tab highlighted (`bg-gray-100 text-gray-900`); others `text-gray-500`.
- On desktop nav is sticky; on mobile it overflows horizontally.

### Edge cases

- Active detection uses exact `pathname === tab.href` or `pathname.startsWith(tab.href)` (except `/account` itself).

---

## 9. Account General Page — `/account`

**File:** `frontend/src/app/(pages)/account/page.tsx`

### User-visible sections

#### Profile

- **Display Name** input (placeholder "Enter your name").
  - Save button: "Save" → "Saving..." → "Saved".
  - Disabled while saving, if empty, or if `saved`.
- **Organisation** input (placeholder "Enter your organisation").
  - Save button disabled while saving, if value equals persisted org, or if `orgSaved`.

#### Email

- **Email** input pre-filled with `user.pendingEmail || user.email`.
- Status line shows pending confirmation if `user.pendingEmail` exists.
- After save, shows confirmation message or "Email updated.", plus current email line.
- Save button disabled if empty, unchanged, equals pending email, or `emailSaved`.

#### Usage Plan

- Read-only card displaying `profile?.tier || "Free"` (capitalized via CSS).

#### Actions

- **Sign Out** button (`LogOut` icon) → signs out and redirects to `/`.

#### Danger Zone

- **Delete account** row + red "Delete account" button.
- Opens `ConfirmPopup` with title "Delete account?" and destructive message.
- If MFA is required, closes confirm and opens `MfaVerificationPopup`.

### Modals

- `ConfirmPopup` for delete confirmation.
- `WarningPopup` for "Email already registered" error.
- Two `MfaVerificationPopup` instances: one for account delete, one for email change.

### State variables

| Var                                                                   | Purpose            |
| --------------------------------------------------------------------- | ------------------ |
| `displayName`, `isSavingName`, `saved`                                | Display name edit. |
| `organisation`, `isSavingOrg`, `orgSaved`                             | Organisation edit. |
| `email`, `isSavingEmail`, `emailSaved`, `emailStatus`, `emailWarning` | Email edit.        |
| `emailMfaOpen`, `deleteConfirm`, `isDeleting`, `accountDeleteMfaOpen` | Modal control.     |

### API calls / order

1. Profile save → `updateDisplayName` / `updateOrganisation` (UserProfileContext).
2. Email save →
   - `needsMfaVerification()` first.
   - If required → open MFA popup.
   - Else → `updateEmail(nextEmail)` from AuthContext.
   - On already-registered error → `WarningPopup`.
3. Delete account →
   - `needsMfaVerification()`.
   - If required → MFA popup.
   - Else → `deleteAccount()` from `mikeApi.ts`, then `signOut()`, then `router.push("/")`.

### Validation

- Email trim must be non-empty and different from current/pending email.
- Display name save requires non-empty trimmed value.

### Edge cases

- `if (!user) return null` (line 167).
- Already-registered email detection: message contains "a user with this email address has already been registered".

---

## 10. Model Preferences Page — `/account/models`

**File:** `frontend/src/app/(pages)/account/models/page.tsx`

### User-visible elements

- **Title:** "Model Preferences".
- **Title generation model** dropdown.
  - Description: "Used for naming chats and other lightweight titles."
  - Defaults to `gemini-3.1-flash-lite-preview`.
  - Options from `SETTINGS_MODELS`.
- **Tabular review model** dropdown.
  - Description: "We recommend using a smaller model for tabular reviews to reduce token costs."
  - Defaults to `gemini-3-flash-preview`.
  - Options from `MODELS`.
- Dropdown shows provider groups: Anthropic, Google, OpenAI.
- Selected value displays a checkmark.
- Unavailable models (missing API key) are grayed with red alert icon and tooltip.
- During save shows spinner; on success shows green checkmark for ~1.6s.

### State variables

| Var                | Type                                     | Purpose                                  |
| ------------------ | ---------------------------------------- | ---------------------------------------- |
| `savingField`      | `"titleModel" \| "tabularModel" \| null` | Which field is saving.                   |
| `savedField`       | same                                     | Which field just saved.                  |
| `optimisticValues` | `Partial<Record<...>>`                   | Immediate UI update before API response. |

### API calls

- `updateModelPreference(field, id)` from UserProfileContext → `updateUserProfile({ [field]: value })`.

### Validation / edge cases

- On save failure, optimistic value is reverted.

---

## 11. API Keys Page — `/account/api-keys`

**File:** `frontend/src/app/(pages)/account/api-keys/page.tsx`

### User-visible elements

- **Title:** "API Keys".
- **Description:** users must provide keys or set env keys; encrypted in storage.
- **Model API Keys section** with fields for:
  - Anthropic (Claude) API Key — placeholder `sk-ant-...`
  - Google (Gemini) API Key — placeholder `AI...`
  - OpenAI API Key — placeholder `sk-...`
  - OpenRouter API Key — placeholder `sk-or-...`
- **Other API Keys section** for CourtListener API Key with explanatory description.
- Each field:
  - Password input by default.
  - Eye/EyeOff reveal button only when input is dirty.
  - Placeholder changes to "Server .env key configured" if source is `env`, or "Saved key hidden" if a user key exists.
  - **Save** button (disabled if server-configured, saving, not dirty, or saved).
  - **Remove** button (red, appears only when a user-saved key exists and not server-configured).
- `MfaVerificationPopup` appears if saving/removing requires MFA.

### State variables (per `ApiKeyField`)

| Var                | Purpose                       |
| ------------------ | ----------------------------- |
| `value`            | Current input.                |
| `reveal`           | Toggle visibility.            |
| `isSaving`         | Save/remove in progress.      |
| `saved`            | Brief success state.          |
| `pendingMfaAction` | `"save" \| "remove" \| null`. |

### API calls

1. `needsMfaVerification()` before save/remove.
2. `updateApiKey(provider, value.trim() || null)` from UserProfileContext → `saveApiKey(provider, normalized)`.

### Validation / edge cases

- Empty trimmed input on Save is treated as a remove (passed as `null`).
- Server-configured keys (`source === "env"`) are disabled; user cannot edit/remove.
- Input is cleared whenever `hasSavedKey` changes.

---

## 12. Features Page — `/account/features`

**File:** `frontend/src/app/(pages)/account/features/page.tsx`

### User-visible elements

- **Section:** Legal Research.
- **Jurisdiction toggle** for US.
  - Label: "US".
  - Description: "Enable US case law research (CourtListener) in chat."
  - Checkbox-style button with `Check` icon when enabled.
- **Update button** disabled when no changes or while saving; label cycles "Update" → "Updating..." → "Updated".
- Red error text if update fails.

### State variables

| Var                            | Purpose                     |
| ------------------------------ | --------------------------- |
| `saving`, `saved`, `saveError` | Update state.               |
| `draftLegalResearchUs`         | Local override until saved. |

### API calls

- `updateLegalResearchUs(usEnabled)` from UserProfileContext → `updateUserProfile({ legalResearchUs: enabled })`.

### Validation

- Button disabled unless `draftLegalResearchUs !== null && draftLegalResearchUs !== persistedLegalResearchUs`.

---

## 13. Security Page — `/account/security`

**File:** `frontend/src/app/(pages)/account/security/page.tsx`

### User-visible elements

- **Section:** Multi-Factor Authentication.
- **Verification method** row:
  - Status badge: "Enabled" / "Not set up".
  - Description changes based on factor presence and current AAL level.
  - **Set up** button if no factor (opens modal).
- **Login verification** row (only when factor exists):
  - Toggle switch (`role="switch"`) to require MFA on every login.
  - **Remove authenticator app** link.
- **Status line** at bottom of card for errors/success messages.
- `MfaSettingsSkeleton` shown while loading.

### Setup modal flow

1. **Step 1 — Instructions:**
   - Lists authenticator apps (Google, Microsoft, Authy, 1Password, iCloud Passwords).
   - "Continue" starts enrollment.
2. **Step 2 — QR + secret:**
   - Displays QR code image and setup key.
   - Copy setup key button ("Copy" → "Copied").
   - 6-digit verification input.
   - "Verify" completes enrollment.
   - "Back" cancels current enrollment and returns to Step 1.
   - "Cancel" closes modal and cancels enrollment.

### State variables

| Var                                                 | Type                                                 | Purpose |
| --------------------------------------------------- | ---------------------------------------------------- | ------- |
| `loading`, `factors`, `currentLevel`, `nextLevel`   | MFA state from Supabase.                             |
| `setupModalOpen`                                    | Modal open.                                          |
| `enrollment`                                        | `{ factorId, challengeId, qrCode, secret } \| null`. |
| `verificationCode`                                  | Code entered in setup modal.                         |
| `setupKeyCopied`                                    | Copy feedback.                                       |
| `status`                                            | Inline status/error.                                 |
| `busy`                                              | Enrollment/unenrollment in progress.                 |
| `savingLoginPreference`                             | Toggle saving.                                       |
| `pendingUnenrollFactorId`, `pendingLoginPreference` | For MFA popup callbacks.                             |

### API / Supabase calls

1. `refreshMfaState()`:
   - `supabase.auth.mfa.listFactors()`.
   - `supabase.auth.mfa.getAuthenticatorAssuranceLevel()`.
2. `startEnrollment()`:
   - `supabase.auth.mfa.enroll({ factorType: "totp", friendlyName: "Mike" })`.
   - On duplicate friendly name error, retries with `Mike ${Date.now()}`.
   - `supabase.auth.mfa.challenge({ factorId })`.
3. `verifyEnrollment()`:
   - `supabase.auth.mfa.verify({ factorId, challengeId, code })`.
   - On success calls `refreshMfaState()`.
4. `cancelEnrollment()`:
   - `supabase.auth.mfa.unenroll({ factorId }).catch(() => null)`.
5. `requestUnenroll(factorId)`:
   - Checks AAL; if not AAL2, opens MFA popup.
   - Else calls `unenrollFactor`.
6. `unenrollFactor(factorId)`:
   - `supabase.auth.mfa.unenroll({ factorId })`.
   - If `profile?.mfaOnLogin`, disables it via `updateMfaOnLogin(false)`.
7. `handleLoginPreferenceToggle()`:
   - Calls `needsMfaVerification()`; if required, opens MFA popup.
   - Else `saveLoginPreference(enabled)` → `updateMfaOnLogin(enabled)`.

### Edge cases

- Duplicate friendly name auto-retry.
- Unenroll sets `mfaOnLogin` to false automatically.
- If unenroll returns AAL error, shows MFA popup.

---

## 14. Privacy & Data Page — `/account/privacy-data`

**File:** `frontend/src/app/(pages)/account/privacy-data/page.tsx`

### User-visible elements

#### Export data section

- **Export chats** — "Download assistant and tabular review chat history as JSON."
- **Export tabular reviews** — "Download all owned tabular reviews, cells, and review chat records as JSON."
- **Export account JSON** — "Download account metadata, projects, document metadata, workflows, and review data as JSON."
- Each has a primary "Export" button (shows spinner + "Exporting..." while active).

#### Delete data section

- **Delete all chats** — permanently deletes assistant & tabular review chat history.
- **Delete all tabular reviews** — permanently deletes all owned tabular reviews.
- **Delete all projects** — permanently deletes all projects owned, including docs/chats/reviews.
- Each has a red "Delete" button.
- `ConfirmPopup` shown with tailored title/message per action.

### State variables

| Var                                                                   | Type                       | Purpose                       |
| --------------------------------------------------------------------- | -------------------------- | ----------------------------- |
| `pendingDeleteAction`                                                 | `DeleteDataAction \| null` | Which delete confirm is open. |
| `deletingAction`                                                      | same                       | Which delete is executing.    |
| `pendingMfaAction`                                                    | `MfaRetryAction \| null`   | Which action needs MFA retry. |
| `isExportingAccount`, `isExportingChats`, `isExportingTabularReviews` | booleans                   | Export loading states.        |

### API calls

- Before every export/delete: `needsMfaVerification()`.
- Exports:
  - `exportAccountData()` → `/user/export`.
  - `exportChatData()` → `/user/chats/export`.
  - `exportTabularReviewsData()` → `/user/tabular-reviews/export`.
- Deletes:
  - `deleteAllChats()` → `/user/chats` (DELETE); then `setCurrentChatId(null)` and `loadChats()`.
  - `deleteAllTabularReviews()` → `/user/tabular-reviews` (DELETE).
  - `deleteAllProjects()` → `/user/projects` (DELETE); then `setCurrentChatId(null)` and `loadChats()`.

### Edge cases

- All exports trigger a browser download via temporary blob URL.
- `MfaVerificationPopup` onVerified re-runs the pending action.
- Confirm popup cancel is disabled while delete is executing.

---

## 15. Confirm Popup — `ConfirmPopup`

**File:** `frontend/src/app/components/shared/ConfirmPopup.tsx`

### Usage locations

- `AccountPage` (delete account).
- `PrivacyDataPage` (delete data actions).

### User-visible elements

- Bottom-center toast-style modal portal.
- Optional title.
- Optional message.
- **Cancel** button (text only).
- **Confirm** button:
  - If confirm label is "Delete", shows `Trash2` icon and red styling.
  - Otherwise dark gray styling.
  - In `loading` state shows spinner + progressive label (e.g., "Deleting...").
  - In `complete` state shows completed label (e.g., "Deleted").

### Props

| Prop                                              | Type                                |
| ------------------------------------------------- | ----------------------------------- |
| `open`                                            | `boolean`                           |
| `title`, `message`, `confirmLabel`, `cancelLabel` | `ReactNode`                         |
| `confirmStatus`                                   | `"idle" \| "loading" \| "complete"` |
| `onConfirm`, `onCancel`                           | `() => void`                        |
| `confirmDisabled`                                 | `boolean`                           |

### Edge cases

- Confirm disabled if `confirmStatus !== "idle"`.
- Uses `createPortal` to render in `document.body`.

---

## 16. Warning Popup — `WarningPopup`

**File:** `frontend/src/app/components/shared/WarningPopup.tsx`

### Usage locations

- `AccountPage` (email already registered).

### User-visible elements

- Top-center toast-style portal with red-tinted background.
- `AlertCircle` icon.
- Optional title and message.
- Optional `primaryAction` and `secondaryAction` buttons.
- Dismiss `X` button.

### Props

| Prop                                   | Type                            |
| -------------------------------------- | ------------------------------- |
| `open`, `onClose`                      | `boolean`, `() => void`         |
| `title`, `message`, `children`, `icon` | `ReactNode`                     |
| `primaryAction`, `secondaryAction`     | `{ label, onClick, disabled? }` |

---

## 17. Mike API — Auth/Account functions

**File:** `frontend/src/app/lib/mikeApi.ts` (auth/account relevant excerpts)

### Error handling

- `MikeApiError` with `status` and `code`.
- `isMfaRequiredError(error)` returns true when `status === 403 && code === "mfa_verification_required"`.

### Auth/account endpoints

| Function                        | Method/Path                        | Body / Notes                                                                  |
| ------------------------------- | ---------------------------------- | ----------------------------------------------------------------------------- |
| `deleteAccount()`               | `DELETE /user/account`             |                                                                               |
| `deleteAllChats()`              | `DELETE /user/chats`               |                                                                               |
| `deleteAllProjects()`           | `DELETE /user/projects`            |                                                                               |
| `deleteAllTabularReviews()`     | `DELETE /user/tabular-reviews`     |                                                                               |
| `exportAccountData()`           | `GET /user/export`                 | Returns `{ blob, filename }`.                                                 |
| `exportChatData()`              | `GET /user/chats/export`           | Returns `{ blob, filename }`.                                                 |
| `exportTabularReviewsData()`    | `GET /user/tabular-reviews/export` | Returns `{ blob, filename }`.                                                 |
| `getUserProfile()`              | `GET /user/profile`                | Returns `UserProfile`.                                                        |
| `updateUserProfile(payload)`    | `PATCH /user/profile`              | Accepts displayName, organisation, titleModel, tabularModel, legalResearchUs. |
| `updateUserMfaOnLogin(enabled)` | `PATCH /user/security/mfa-login`   | Body `{ enabled }`.                                                           |
| `getApiKeyStatus()`             | `GET /user/api-keys`               |                                                                               |
| `saveApiKey(provider, apiKey)`  | `PUT /user/api-keys/${provider}`   | Body `{ api_key: apiKey }`.                                                   |

### Authentication

- Every request attaches Supabase `access_token` via `Authorization: Bearer <token>` from `getAuthHeader()`.
- Base URL from `NEXT_PUBLIC_API_BASE_URL` or `http://localhost:3001`.

---

## 18. Account Styles — `accountStyles.ts`

**File:** `frontend/src/app/(pages)/account/accountStyles.ts`

### Exported class-name constants

| Constant                                   | Visual                                              |
| ------------------------------------------ | --------------------------------------------------- |
| `accountGlassInputClassName`               | Rounded gray input, transparent border, focus ring. |
| `accountGlassSectionClassName`             | White rounded-xl card.                              |
| `accountGlassButtonClassName`              | Transparent button with hover gray background.      |
| `accountGlassPrimaryButtonClassName`       | Same as button, slightly darker text.               |
| `accountGlassDangerButtonClassName`        | Red text, red hover background.                     |
| `accountGlassDangerOutlineButtonClassName` | Same as danger button.                              |
| `accountGlassIconButtonClassName`          | Compact icon button (eye toggle).                   |
| `accountTabButtonClassName(active)`        | Left nav tab styling; active gets gray background.  |

---

## Cross-page Guard Summary

| Flow                | Guard / Trigger                            | MFA check                            | Redirect/Outcome             |
| ------------------- | ------------------------------------------ | ------------------------------------ | ---------------------------- |
| Login               | none                                       | handled by Supabase                  | `/assistant`                 |
| Signup              | none                                       | none                                 | `/assistant` after 2s        |
| Auth gate           | `MfaLoginGate` checks `profile.mfaOnLogin` | `needsMfaVerification()`             | `/verify-mfa?next=...`       |
| Verify MFA          | page checks user exists                    | `challengeAndVerify`                 | safe `next` path             |
| Account layout      | unauthenticated → `/`                      | —                                    | —                            |
| Email change        | AccountPage                                | `needsMfaVerification()`             | `MfaVerificationPopup`       |
| Account delete      | AccountPage                                | `needsMfaVerification()`             | `MfaVerificationPopup` → `/` |
| API key save/remove | ApiKeysPage                                | `needsMfaVerification()`             | `MfaVerificationPopup`       |
| Login MFA toggle    | SecurityPage                               | `needsMfaVerification()`             | `MfaVerificationPopup`       |
| Unenroll factor     | SecurityPage                               | AAL check / `needsMfaVerification()` | `MfaVerificationPopup`       |
| Exports/Deletes     | PrivacyDataPage                            | `needsMfaVerification()`             | `MfaVerificationPopup`       |
