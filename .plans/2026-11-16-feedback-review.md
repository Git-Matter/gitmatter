# Feedback and demo-readiness review

Date: 2026-11-16, Australia/Sydney.
Checkout: `/Users/applecakes/.codex/worktrees/gitmatter-consolidation`.
Source snapshot: inspection began at `6ad2f40`; integration advanced to `bf9a9af` during review.
Existing staged/unstaged integration work was left untouched. Only this report was written.

This is an independent source review of the current feedback implementation and adjacent demo paths.
No app or fixture was started/stopped. No browser interaction, install, build, test, branch, index or
release operation was performed. All proposed runtime reproductions below are **UNRUN** in this review.
The code paths are current-source evidence; timing and assistive-technology outcomes need verification.

## Findings

### 1. [P1] Typing makes the Clients and Documents search controls inert

- Sources: `apps/web/src/routes/_auth/clients/index.tsx:78-83,185-190`;
  `apps/web/src/routes/_auth/documents/index.tsx:69-74,184-197`;
  `apps/web/src/components/CollectionPanel.tsx:15-16,76-79`;
  `apps/web/src/lib/hooks/table/useTablePageParams.ts:29`.
- Any raw search edit immediately sets `isPlaceholderData` while the query waits for the 300 ms
  debounce. CollectionPanel then applies `inert` to every child, including these pages' TableSearch.
  That disables the very input needed to finish typing or correct the query. On query failure the
  same input remains inert, so users must retry before they can change a failing search.
- Demo impact: a normally typed search can stop accepting characters or lose usable focus after the
  first character. This is stronger than merely pausing old result actions. Matters, Workflows,
  Library and Reviews already keep their search controls outside the blocked result body.
- Fix boundary: move search/scope controls outside CollectionPanel, or give the panel a separate
  always-interactive toolbar slot. Keep only unconfirmed rows, selection actions and paging inert.
- Verification: type a multi-character search sequentially at 40–100 ms per key while holding the
  request. Assert complete input, uninterrupted focus and available clear/change controls; old-row
  actions must remain blocked. Repeat after a 503. Existing `app-wide.js:40-42` uses `fill()` and thus
  changes the whole value in one event; its historical pass does not cover ordinary typing.

### 2. [P2] An open client editor ignores authoritative refresh denial

- Sources: `apps/web/src/routes/_auth/clients/-components/ClientDialog.tsx:35-42,104-118,215-221`;
  `apps/web/src/routes/_auth/clients/index.tsx:225-232`.
- ClientDialog discards the overview query's pending/error/status fields and uses cached overview
  data or the row snapshot unconditionally. Its fields are disabled only during the save mutation.
  The dialog is outside CollectionPanel, so a list or detail refresh returning 401/403 does not hide
  the open client's private work or stop its edit controls.
- Demo impact: revocation can leave a fully populated, apparently editable dialog after the result
  collection has correctly switched to access-unavailable. This is a stale UI/access-feedback
  defect; it does **not** establish a server authorization bypass.
- Fix boundary: retain the query state; distinguish transient failure from denial, hide the denied
  server view and block dependent actions, and provide explicit retry/return. Preserve the existing
  unsaved-input policy deliberately rather than silently reseeding or discarding a draft.
- Verification: open a client, retain an edit, then refresh with 503 and with 403 separately. Verify
  transient recovery retains the draft and authoritative denial removes the private view/actions.

### 3. [P2] Workflow rename bypasses the autosave queue and can regress a confirmed title

- Sources: `apps/web/src/routes/_auth/workflows/-components/WorkflowDetailPage.tsx:62-76,152-156,192-198`.
- Step/column saves serialize through `writeQueue` and guard cache updates by `revision`. Rename
  calls `api.updateWorkflow` independently and writes its whole response directly to the same cache.
  Rename remains available while autosave is pending. A delayed step-save response containing the
  previous title can therefore arrive after a confirmed rename and replace the new title in cache;
  the step revision check cannot detect the title write because rename never participates in it.
- Demo impact: the header can revert to the previous name while showing Saved, even though the
  server accepted the rename. This response-order defect is inferred from the two independent paths;
  no claim of a reproduced server race is made here.
- Fix boundary: serialize all metadata writes for the same workflow, including Details/Rename, or
  reconcile responses using an authoritative version and current-field ownership. Preserve audit APIs.
- Verification: hold a step PATCH response, complete a title PATCH, then release the older response.
  The confirmed title and latest prompt must both remain current and agree after a refetch.

### 4. [P2] A delayed success is attributed to the page open at completion

- Sources: `apps/web/src/lib/feedback.ts:7-24`;
  `apps/web/src/routes/_auth/documents/-hooks/useDocumentUpload.ts:28-40`.
- notifySuccess derives the section from `window.location.pathname` when the async operation finishes.
  Uploads await one or more requests before notifying, and their route is not guarded against leaving.
  An upload started in Documents and completed after navigation to Settings is labelled Settings.
- Demo impact: the persistent historical receipt misidentifies its origin, undermining the new
  context label precisely when the receipt survives navigation.
- Fix boundary: capture the action's origin at dispatch, or pass an explicit typed section/context to
  notifySuccess. Do not derive action identity from the destination visible when a response arrives.
- Verification: hold a fictional upload, navigate to another section, then complete it. Its receipt
  must retain Documents as the origin. `feedback-interactions.js:88-118` currently navigates only
  after success, so that historical check does not cover this ordering.

### 5. [P2] Sharing presents unavailable directory data as “Everyone already has access”

- Sources: `apps/web/src/components/SharePeopleDialog.tsx:52-65,107-115,159-162`.
- Both team and organization-directory queries default to empty arrays, with no pending/error gates.
  While metadata is loading or if it fails, the candidate selector concludes that everyone already
  has access. A failed team lookup also loses its distinction from an actually empty access list.
- Demo impact: an administrator is told the team is complete when the app has not established that
  fact, with no retry beside the affected control. Directory and team responses can also settle in
  different orders, briefly offering people whose existing membership is still unknown.
- Fix boundary: expose named loading/failure/denial states and retry; enable selection/add only after
  both datasets needed for candidate calculation are confirmed. Keep server permissions authoritative.
- Verification: hold each query independently, then return 503 and 403. Never show an affirmative
  all-members-have-access state unless confirmed data establishes it.

### 6. [P2] Success feedback from a still-open modal is sent behind that modal

- Sources: `apps/web/src/components/SharePeopleDialog.tsx:69-89`;
  `apps/web/src/components/AppFrame.tsx:35-43`;
  `apps/web/src/components/ActionFeedback.tsx:10-26`;
  `apps/web/src/lib/feedback.ts:20-26`.
- Adding/removing a teammate publishes success without closing the modal. The only persistent status
  region lives in the background main surface. Its listener cancels the Sonner fallback regardless
  of the active dialog. Consequently the persistent confirmation is outside the dialog's accessible
  interaction scope, and is only fully available after closing the dialog.
- Demo impact: the new success feedback may be missed by someone remaining in the team modal,
  especially with a screen reader. An updated row is useful but does not make the background status
  region announceable. Actual browser/screen-reader behavior remains UNRUN here.
- Fix boundary: publish the result in a modal-local status region while the modal remains open, while
  retaining the workspace receipt for after close. Avoid duplicating announcements or auto-closing
  the user's modal just to expose a banner.
- Verification: add/remove with the dialog kept open, inspect its accessible subtree and success
  announcement, then close and verify the persistent receipt and focus return.

### 7. [P2] Multi-file upload failure still loses the partial outcome and retry set

- Source: `apps/web/src/routes/_auth/documents/-hooks/useDocumentUpload.ts:28-51`.
- Files upload sequentially, but the only success receipt occurs after the entire loop. If an early
  file succeeds and the next fails, the catch path gives a transient generic error, stops the remaining
  queue and exposes neither the successful count nor the failed/unattempted files. The file picker
  has already cleared its selection before the requests run.
- Demo impact: users cannot tell which files reached the server or retry only the unresolved subset.
  Retrying the original batch is left to guesswork. No claim of actual duplicate server records is
  made without testing the backend's current deduplication behavior.
- Fix boundary: retain a per-file outcome and deliberate retry list; show a persistent partial summary
  that distinguishes uploaded, failed and unattempted files. Do not automatically retry uncertain writes.
- Verification: for three fictional files, accept the first, reject the second, and verify that the
  third's unattempted state and the first's confirmed success are visible without reselecting files.

## Evidence status

- `design/evidence/feedback.json` remains historical, recorded 2026-11-16: its four script digests
  match current scripts, but 7 of 135 recorded source hashes differed in this integration snapshot:
  `lib/data/api.ts`, matter detail, CreateMatterModal, document detail, DocxView, DisplayWorkflowModal
  and Settings index. Paths are relative to `apps/web/src` where appropriate. This does not invalidate
  the historical run; it means it is not complete proof of the integrated tree.
- The older `ux-nine.json` and `app-wide.json` packets also have source/script drift. They were not
  rewritten, rerun, relabelled or used as current runtime sign-off.
- All 25 `design/screenshots.json` capture paths and its video path were absent from this integration
  checkout during inspection. They may still exist in the original workspace's ignored output tree.
  Copy verified artifacts or capture fresh integration evidence before presenting those local links
  from this checkout. Absence here is an artifact-delivery gap, not proof that the original files failed.
- No new visual, authenticated, screen-reader, provider, legal-quality or production acceptance is
  established by this source review. The highest-priority fresh check is real sequential typing for
  finding 1; then run the targeted delayed-response, denial and partial-outcome cases above.

## Review references

The source findings use the repository's current DESIGN.md, design/philosophy.md and
`design/workflows/action-feedback.md` / `workspace-recovery.md` contracts. The current
[Web Interface Guidelines](https://github.com/vercel-labs/web-interface-guidelines) were reread for
focus, input and feedback expectations. The [WAI modal-dialog pattern](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/)
explains why background feedback is outside an active modal's interaction scope. This review does
not reinterpret those sources as a complete WCAG audit.
