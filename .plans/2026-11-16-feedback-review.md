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

## Implementation dispositions — 2026-11-17

Work is in the original `/Users/applecakes/projects/gitmatter` checkout, as requested. The earlier
read-only findings and evidence notes above are retained as historical observations. This addendum
records source implementation and type checks; it does not convert any earlier receipt into a new run.

| Finding                 | Current disposition                                                                                                                                                                                                                                                                                                                                                                                                   |
| ----------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1: Inert search         | Root-owned fix already present. Preserved the Clients/Documents toolbars outside the blocked results body.                                                                                                                                                                                                                                                                                                            |
| 2: Client detail denial | Implemented with the existing readableSnapshot/snapshotIsCurrent helper and SnapshotNotice, without editing either shared file. Transient failures retain the local draft and pause actions; authoritative denial hides private fields/work. Client object links now let the route guard decide before the dialog unmounts.                                                                                           |
| 3: Rename/autosave race | Implemented one queueWrite path for all workflow metadata writes, including rename/details. Cache publication is in that ordered path; autosave status still respects the latest prompt/column revision.                                                                                                                                                                                                              |
| 4: Async success origin | Added typed ActionOrigin and captureActionOrigin. Owned mutations capture origin through TanStack onMutate and pass that result to onSuccess; uploads, sharing and async clipboard/workflow operations capture before awaiting. Six calls in protected files still require their owners to adopt the compatible second argument; see handoff below.                                                                   |
| 5: Sharing metadata     | Team and directory queries retain their state, distinguish loading/error/denial, provide retry and pause dependent changes until current. Denial hides private membership/picker content; unknown data no longer says everyone already has access.                                                                                                                                                                    |
| 6: Modal-local success  | Sharing publishes an explicit polite status within the open modal, while retaining the workspace receipt for after close. Pending/dirty sharing has the existing single Keep/Discard policy; actions stay on the same APIs.                                                                                                                                                                                           |
| 7: Partial uploads      | Added a feature-local UploadFeedback view and retained per-file records. Confirmed, rejected, unconfirmed and unattempted files are distinct. New picks do not erase unresolved files. Retry sends only the chosen file, with its captured matter/origin; accepted files are not retried. Pending work blocks exit; leaving unresolved results requires a deliberate discard. No automatic retry of uncertain writes. |

### Protected-owner origin handoff

To respect the explicit ownership exclusions, these six existing single-argument calls were not
edited in this pass:

- `apps/web/src/routes/_auth/documents/-components/DocumentDrawer.tsx`: new-version upload success.
- `apps/web/src/routes/_auth/reviews/$id.tsx`: rule retry and prompt-update success.
- `apps/web/src/routes/_auth/settings/-components/AiSettings.tsx`: jurisdiction, provider-key save
  and provider-key removal success.

Each owner can import `captureActionOrigin`, return it from the corresponding mutation's `onMutate`,
receive that result as the third `onSuccess` parameter, and pass it to `notifySuccess(message, origin)`.
Preserve any existing onMutate bookkeeping; combine its returned context rather than replace it if
an owner has since introduced one. The optional origin argument keeps these files type-compatible
in the meantime, but their legacy calls still derive their label at completion. Finding 4 should not
be called globally closed until these owner changes and the delayed-completion replay pass.

### Focused browser scenarios prepared, not executed

`test/acceptance/design-workflows/feedback-recovery.js` is ready for the coordinated app-ui fixture.
It covers client 503/403/draft/route recovery; independently unavailable sharing metadata; success in
an open modal; delayed origin attribution; held autosave plus queued rename; and a three-file partial
upload with explicit retries and an unsent third file. The app-ui fixture adds a small prepareSuccess
adapter to exercise the real captured-origin helper. No replay runner or MVP fixture was edited.

**Browser status: UNRUN.** The root workflow session retains sole ownership of port 4280. No server,
fixture, browser, live credential operation or provider call was started by this implementation pass.
No branch, index or commit operation was performed. APIs, permission enforcement and audit commits
were preserved; no schema change or migration was introduced.

### Readability review and checks

Applied `$simplify-code` from the installed skill after the combined changes. Removed a redundant
client-seeding ref in favor of the existing baseline, named the upload operations and ref state
explicitly, kept the retry rule with the upload feature and reused it in the dispatcher/results UI,
and consolidated repeated sharing-feedback resets. No speculative global component or backend
abstraction was added. Other changes to origin capture use the existing mutation lifecycle rather
than a custom mutation framework.

Actually run after the simplifications:

- `vp run typecheck`: passed, six tasks successful (latest log:
  `/tmp/gitmatter-feedback-recovery-types-final.log`).
- `vp exec tsc --project test/acceptance/app-ui-fixture/tsconfig.json --noEmit`: passed
  (`/tmp/gitmatter-feedback-recovery-fixture-types-final.log`).
- `vp fmt` on the owned modified files: passed.

Full `vp check`, `vp test`, design policy and browser replay remain for the coordinated validation
window. Earlier 371-test/four-replay receipts were not relabelled or rewritten by this pass.

## Frozen source handoff — 2026-11-17

The original implementation, app-ui fixture and browser scripts are frozen. No further UI changes
are planned in this session. Root requested the fresh independent UAT/replay window and retains
integration, index, commit and push ownership. `$commit-and-push` was loaded; its explicit-hold rule
was honored. Branch/HEAD observed at this phase: `docs/staging-verification-handoff`, `527459d`.

### Final implementation additions from specialist review

- TypeScript specialist: add/remove success handlers now await team invalidation, keeping controls
  paused until the post-write membership refresh settles. Local confirmation appears immediately.
- Product designer: retained sharing rows/counts are labelled Last loaded during that refresh.
  The Documents page now scrolls with a minimum usable grid height while upload recovery is visible,
  so checking existing documents does not require clearing the retry list.
- Unknown upload results now open a file-specific duplicate-risk decision. Keep result/escape sends
  nothing; only Retry anyway dispatches that file. Rejected and unattempted retries remain direct.
- Root's independent review identified missing names on the client Type/Status comboboxes. Visible
  labels are now bound with htmlFor/trigger IDs. The focused browser script checks both role names
  and keyboard selection, without altering the Select primitive.

The global TypeScript engineer, product designer and independent UI/UX reviewer critiqued the actual
patch/rendered states. Their findings were reconciled into the bounded fixes above. The UI/UX reviewer
also consulted `agents/references/ui-quality-review.md` and reported observed passing for useful
labels, actionable recovery, explicit retry decisions and mobile document access in its review window.
Those observations do not establish live authorization, representative-user usability or full WCAG.

`$simplify-code` was applied to the combined owned patch. The final additions were reviewed again;
no further structural edit justified thawing the stable source window. Recovery components remain
feature-local. Existing press/selection, progress/completion and dialog feedback were retained.
The updated shared motion/gesture guidance was consulted: network/access notices retain persistent
text, existing reduced-motion behavior remains, and file dragging retains the visible picker/keyboard
alternative. New motion or gestures were not added to these recovery states.

### Current verification and remaining gate

The host restarted during the combined replay. Temporary process handles/logs disappeared and no
`design/evidence/feedback-recovery.json` was produced. That attempt is **INTERRUPTED**, not accepted.
The later cold replay stopped in the client Status keyboard selection check (expected inactive,
observed active), although the same sequence and independent named-control review had passed in
other windows. Keep this as an intermittent keyboard/automation acceptance gap for the fresh reviewer;
do not relax the assertion or claim the full group passed without resolving it.

Actually completed after restart, with sources frozen:

- Scoped `vp fmt --check`: passed for 35 owned files/hunks.
- `vp exec tsc --project apps/web/tsconfig.json --noEmit`: passed.
- TypeScript parser syntax check of feedback-recovery.js and replay.mjs: passed.
- Earlier app/fixture type checks and design checks passed in their windows; no post-restart browser
  or integrated test receipt is inferred from them.

The prior global `vp check` attempt stopped on formatting of the separate root-owned
`.plans/2026-11-17-ui-ux-uat-review.md`. I left that report unchanged. Root should format its own report
and run the complete required gates after integration. Do not reuse the earlier 371-test/four-replay
receipts or root's separate 504-test revision as proof of this final working tree.

Persistent local artifacts: `output/playwright/design-workflows/replay-feedback-recovery/` contains
scoped-format.log, types-scoped.log, runner.log and a source-only frozen-sources.json. The source hashes
are a handoff snapshot, not runtime acceptance. Six legacy origin calls in protected owner files remain
as listed in the previous owner handoff section; those owners should finish that migration.

### Runtime release

Stopped only the restored owned app-ui fixture PID 4981, verified its launcher exited 143, and closed
only the owned design-feedback-recovery browser. The immediate release check found no 4280 listener.
A later listener PID 18924 appeared from the next owner and was left untouched. No alternate port,
main app, database or provider was started. Root's fresh reviewer/template slot and eventual main-app
restoration remain under root coordination.

### Owned file/hunk list

The following list includes only this task's source/script scope; preserve peer changes within shared
files, particularly template access work and the earlier search-toolbar move. No shared snapshot
helper, MVP fixture, review/document detail or marketing file was edited by this session.

- `apps/web/src/components/SharePeopleDialog.tsx`
- `apps/web/src/lib/feedback.ts`
- `apps/web/src/routes/_auth/clients/-components/ClientDialog.tsx`
- `apps/web/src/routes/_auth/clients/-components/CreateClient.tsx`
- `apps/web/src/routes/_auth/clients/index.tsx`
- `apps/web/src/routes/_auth/documents/-components/UploadFeedback.tsx`
- `apps/web/src/routes/_auth/documents/-hooks/useDocumentUpload.ts`
- `apps/web/src/routes/_auth/documents/index.tsx`
- `apps/web/src/routes/_auth/library/-components/TemplateDetail.tsx`
- `apps/web/src/routes/_auth/library/-components/TemplateEditor.tsx`
- `apps/web/src/routes/_auth/library/-components/TemplateTeam.tsx`
- `apps/web/src/routes/_auth/library/index.tsx`
- `apps/web/src/routes/_auth/matters/$id/index.tsx`
- `apps/web/src/routes/_auth/matters/-components/AddDocumentsModal.tsx`
- `apps/web/src/routes/_auth/matters/-components/AgentActivity.tsx`
- `apps/web/src/routes/_auth/matters/-components/AgentHandoff.tsx`
- `apps/web/src/routes/_auth/matters/-components/CreateMatterModal.tsx`
- `apps/web/src/routes/_auth/matters/-components/EditMatterModal.tsx`
- `apps/web/src/routes/_auth/matters/-components/MatterFileExplorer.tsx`
- `apps/web/src/routes/_auth/matters/-components/MatterOverview.tsx`
- `apps/web/src/routes/_auth/matters/index.tsx`
- `apps/web/src/routes/_auth/reviews/-components/CreateReviewDialog.tsx`
- `apps/web/src/routes/_auth/settings/-components/AccountSettings.tsx`
- `apps/web/src/routes/_auth/settings/-components/ConnectAgent.tsx`
- `apps/web/src/routes/_auth/settings/-components/JobControls.tsx`
- `apps/web/src/routes/_auth/settings/-components/LegalResearchCard.tsx`
- `apps/web/src/routes/_auth/settings/-components/OrganizationCard.tsx`
- `apps/web/src/routes/_auth/settings/-components/TwoFactorCard.tsx`
- `apps/web/src/routes/_auth/workflows/-components/WorkflowDetailPage.tsx`
- `apps/web/src/routes/_auth/workflows/-components/WorkflowDetailsModal.tsx`
- `apps/web/src/routes/_auth/workflows/-components/WorkflowFormModal.tsx`
- `apps/web/src/routes/_auth/workflows/index.tsx`
- `test/acceptance/app-ui-fixture/main.tsx`
- `test/acceptance/design-workflows/feedback-recovery.js`
- `test/acceptance/design-workflows/replay.mjs`
