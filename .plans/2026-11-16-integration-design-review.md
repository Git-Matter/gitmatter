# Integration UI review - 16 November 2026

Scope: independent source review of the legal-provider, document-context and Australian-practice
branches in `/Users/applecakes/.codex/worktrees/gitmatter-consolidation`. Initial retrieval merge
was `414de06`; Australian work was inspected during its merge onto `bf9a9af`. Unresolved merge
markers were treated as work in progress, not product defects. This report does not establish
browser, provider, native Word, staging or production acceptance.

## Findings and integration decisions

| Priority | Finding                                                                                                                                                                                                                                                                                                                                                              | Disposition                                                                                                                                                                                                                                                                                                                  |
| -------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P1       | Retrieval replaced captured review input in `packages/core/src/ai/tabular/runner.ts` with current indexed context. Existing `freezeRunInput` rejects a preexisting source mismatch, and commit verification fences concurrent updates; there was no proof of a stale-source write bypass. Mutable chunk retrieval still did not express the captured-input contract. | Core integration owner is restoring captured text for snapshot-bound reviews, retaining indexed retrieval for legacy reviews without a snapshot. The explicit chunk-ref branch should use its already version-filtered rows. Backend tests remain that owner's responsibility.                                               |
| P1       | `GuidedTaskDialog` had no local-close/navigation draft guard. Escape, overlay, Cancel and Settings navigation could lose instructions or a customized prompt.                                                                                                                                                                                                        | Reused `useDraftExit`. Pending requests block discard; deliberate discard clears the local draft. Changing source selection retains the earlier prompt visibly until explicit re-preparation. Opening fictional material also uses the same draft decision.                                                                  |
| P1       | `PracticeProfileCard` remounted its form from serialized query data and lacked shared settings draft registration. A remote profile update could replace unfinished input.                                                                                                                                                                                           | Removed the profile-content remount key, retained a nullable local draft, and registered it with `useSettingsDraft`. Existing settings panels remain mounted across section changes. Transient refresh failure retains input and disables writes; authoritative access failure removes the private form.                     |
| P1       | `PractitionerReviewPanel` had no draft/pending navigation protection, while the parent keyed it by version/head and silently dropped unfinished scope on a new document revision.                                                                                                                                                                                    | Parent is keyed by document identity. Scope drafts are stored under version/head identity; a new version starts with an empty scope and exposes earlier unfinished text separately. Confirmation remains bound to the current server state token. Pending review requests block discard through the shared navigation guard. |
| P1       | New non-DOCX `previewReady` accepted every document, including a blank extracted/scanned source whose content was not shown.                                                                                                                                                                                                                                         | UI now requires ready status and nonblank displayed markdown for non-DOCX; Word requires complete inspection and successful rendering of the current version. Core owner separately enforces source validity at the server. A visible UI condition alone cannot establish server authorization.                              |
| P1       | Guided launch inherited an auto-send mechanism that could undermine the current preparation/explicit-dispatch model.                                                                                                                                                                                                                                                 | Guided preparation now populates a matter-scoped assistant draft only. The dialog action says **Use in assistant**; the user checks the selected model and explicitly sends there. Existing queued workflows retain their ready/running/paused model, with no mount-time inference.                                          |
| P2       | New standalone API clients duplicated fetch/error handling and discarded HTTP status, weakening shared denial/outage decisions.                                                                                                                                                                                                                                      | Exported the existing request implementation as `apiRequest`; practice and guided clients reuse it. No new transport abstraction or dependency was added.                                                                                                                                                                    |
| P2       | AU components still used obsolete Checkbox `onChange` props, raw selectors, repeated ordinals/kickers and full cards for settings sections.                                                                                                                                                                                                                          | Adapted to installed Base UI Checkbox `onCheckedChange`, NativeSelect, section Card roles and the existing operational type system. Removed task numbers that did not encode a sequence and the redundant guided kicker.                                                                                                     |
| P2       | The AU marketing page imported the previously deleted `Eyebrow` component and would resurrect removed promotional components during conflict resolution.                                                                                                                                                                                                             | Kept prior deletions, removed the broken import and redundant labels, and retained the substantive AU landing page separately. The existing home/CTA/media-origin disclosure remains intact; the home metadata still describes the page actually rendered.                                                                   |

## Behavior explicitly preserved

- Current AppFrame, retained settings sections, URL-backed navigation and `JobControls`.
- Client/matter/artifact context, configured-model send gates and the explicit workflow queue.
- First-review onboarding destination. Practice setup is available as a named settings section;
  adding it does not reroute every existing first-review entry.
- Word layout-preserving mode, cancellation/race protection, inspection notices and preview error
  feedback. The merged `DocxView` also reports successful current-version rendering for the new
  practitioner record.
- Current marketing composition and illustrative-media disclosures. AU capabilities do not turn
  old rendered videos into authenticated product evidence.
- Attributable practitioner review remains distinct from clean-export approval, an accepted edit,
  a delivered document and legal correctness.

## Checks run

- `vp run --filter=web typecheck` passed against the combined in-progress frontend/backend source.
- Four focused test files passed, **11 tests**: guided launch storage/parser, legacy workflow seed
  parser, practice-profile contracts and guided-task registry behavior.
- Focused Vite+ formatting and `git diff --check` passed.
- Read Impeccable's craft floor again before merging UI changes, and checked the shadcn skill and
  current [Checkbox](https://base-ui.com/react/components/checkbox.md),
  [Dialog](https://base-ui.com/react/components/dialog.md),
  [NativeSelect](https://ui.shadcn.com/docs/components/base/native-select) and
  [Field](https://ui.shadcn.com/docs/components/base/field) docs against the installed primitives.

These tests do not exercise browser draft retention or actual server/provider outcomes. No server
was started and no Impeccable detector was run during the changing merge snapshot. The consolidation
owner retains the one final detector pass after UI source settles.

## Required current workflow replay

At desktop and narrow mobile widths, verify guided prepare/edit/close/keep/discard, source changes,
fictional-sample recovery, failed preparations and **zero provider requests before explicit Send**.
Verify practice draft retention across section switches, transient refresh, failed save and page
exit. Verify practitioner scope retention on version changes, source/preview failures, failed and
pending record requests, and a fresh explicit confirmation for the current source. Re-run the
current first-review, assistant, Word preview and settings flows after the root query-state patch
lands. Then run combined repository gates and authenticated release acceptance.

## Current AU component replay - 17 November local time

The new `australian` recorder group passes against integration product sources from `04642c1`.
`design/evidence/australian.json` binds the exact production-component, fixture and script hashes;
they were rechecked against current files after the run. Its 26 HTTP calls are fictional and
fully intercepted, with zero unhandled calls and zero inference requests. The guided callback only
produces a fixture draft; full live-assistant dispatch is outside this test.

The browser checks new guided work, failed preparation, edited prompt retention after source-scope
changes, desktop and mobile Keep/Discard and fresh reopen. Practice preferences survive section
changes, changed server data, transient refresh failure, rejected saves and a pending-save exit;
denial removes the form. Practitioner scopes survive a private-panel unmount/recovery, remain
separate across source revisions, reject blank displayed content, require fresh confirmation after
a stale rejection, block discard during pending record creation, and send the exact state token
without leaking the local draft key. Confirmed output clears only its current scope; denial removes
the private panel. Normal mobile guided and practitioner surfaces remain within the viewport.

Three unmodified desktop/mobile captures and their hashes are listed in
`design/evidence/australian-screenshots.json`. Finite animations were disabled for settled captures.
They show fictional component state, not actual Word/PDF rendering or immutable stored bytes.
Core source/hash authorization tests and authenticated release acceptance remain separate.

Harness corrections were limited to URL parsing in the CLI sandbox, inherited fieldset-disabled
checks, waiting for React state, wrapping the fixture's raw JSON output and disabling finite capture
animations. No production defect was inferred from those test-harness failures. Standalone fixture
TypeScript and whitespace checks pass. Both AU browsers were closed, fixture process exit was
observed, and port4280 was confirmed free afterward; no main app was started by this agent.
