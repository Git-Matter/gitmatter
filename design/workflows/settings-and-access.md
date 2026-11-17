# Settings and access

Settings configure a named scope; authentication returns a person to the task they requested.
They must not look successful merely because a button was pressed or a page opened.

## Composed references

Use the settings/navigation recipes in [the SaaS comparison](../research/saas-patterns.md):
Linear for stable destinations and scoped settings, GOV.UK for recoverable form errors and
explicit consequential actions, and Stripe for distinguishing requested, pending and completed
work. Keep gitmatter's shared controls and vocabulary across those inspirations.

## Settings contract

- The URL selects the visible section. Back and Forward restore that selection.
- A section opens its own queries only when first visited. Previously visited panels remain mounted
  and inaccessible while hidden, preserving unfinished input without saving it to browser storage.
- Section changes preserve drafts. Leaving settings asks once about all unfinished sections. While a
  request is pending, leaving cannot pretend to cancel it. Keep editing retains the same inputs.
- A successful save clears only its submitted draft. Pending controls cannot accept edits that
  would then be erased by that response. Failed requests retain input and expose a retry path.
- Loading, unavailable and denied metadata do not become “not configured”, an empty list or admin
  permission. Private data is removed after an authoritative denial; transient failures explain
  that displayed information may be stale and block dependent mutations.
- Account, organization, provider and agent scopes stay distinct. Appearance changes immediately;
  external access, invites, key changes and account deletion require their explicit actions.
- Narrow screens expose every section through a labelled selector and have readable, named fields.
  Keyboard tab focus never enters a hidden panel.

## Authentication contract

- Typing and preparing input do not submit. Button and Enter share the same readiness gates.
- A required challenge must be ready before any password request. Expiration/failure removes
  readiness; a failed request requires a fresh challenge.
- Pending work has a literal label and prevents duplicate submission. Network failures restore
  the action and preserve input. Error text does not report a successful send or login.
- Reset links distinguish missing/expired from usable. Password mismatch is locally correctable.
- Two-factor and passkey rejection/cancellation permit retry; completion uses a safe local return
  path. No external return URL is accepted.
- Verification and reset confirmations describe the server's response, not proven mail delivery.

## Sign-out contract

- Sign out uses a normal router transition, so existing dirty/pending guards run before any session
  request. Keep editing sends nothing and retains input. Deliberate discard permits the transition.
- The destination starts the request only for an explicit in-app sign-out intent. Preloading or
  opening its URL without that intent does not end a session; direct entry asks for an action.
- A pending request has a literal state and cannot be submitted again from its action. Rejection or
  a network failure stays visible with Retry and Return to workspace. Do not claim the session is
  still active when the server response was not received. A request already sent may still finish.
- Only confirmed success reloads the login page. The old draft guards have unmounted by then, so
  the redirect does not ask a second time to discard the same work.

## Evidence boundary

Verify current product components and routing with fictional session data and intercepted network
requests. This proves UI transitions and request intent, not real sign-in, mail delivery, passkey
hardware, challenge verification, credential storage or server authorization. Record actual cases
and limitations in [the acceptance ledger](../acceptance.md).
