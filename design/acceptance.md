# Design acceptance ledger

## Marketing removal (November 17, 2026)

Public promotional pages, articles, comparison pages, videos, campaign drafts, demo-booking links,
and their rendering/verification tooling have been removed. `/` enters the assistant through the
existing authentication guard. Privacy, Terms, application workflows and usage documentation remain.

Verification: `vp check`, `vp run typecheck`, `vp run design:check`, the cloud web build and docs build
pass. `vp test --maxWorkers=2` passes all 502 tests across 86 files using disposable loopback
Postgres and S3rver, with no live providers or AWS calls. The simplify-code review removed the
remaining unreachable media-replay branches and found no further source defects.

Rendered checks on the actual app at port 4280 cover guest entry, signup links to both legal
notices, former `/features` 404 recovery, 1440px/390px legal-page reflow, keyboard focus, dark theme
and reduced-motion preferences. No blocking findings remain. Signed-in routing, the setup-guide
destination and deployed behavior were not exercised. Captures are under the ignored
`output/playwright/marketing-removal/` directory. The earlier records below retain their original
scope and do not establish current end-to-end acceptance of unrelated workflows.

## Earlier design evidence

**Current visual revision:** the product frame and hierarchy were rebuilt after the user's feedback.
See [the layout contract](workflows/product-frame.md) and [current app captures](screenshots.json).
Earlier oversized-card screenshots and their visual completion claims are superseded.

- Public references: Harvey and Legora homepages rendered; desktop measurements and screenshots
  recorded during the research. Harvey mobile and Legora tabular product captures also exist in
  `output/playwright/design-research`. These are public pages, not private-app interaction tests.
- Research: source-linked legal-product comparison, SaaS pattern composition, anti-slop taxonomy,
  philosophy, authoring rules, and five detailed workflow contracts are present under `design/`.
- Deterministic foundations: one JSON source generates the CSS; shared user-approved radius values
  are preserved. Essential field edges were strengthened after contrast checks found failures.
- Structural policy: scans authored TS/TSX files and 22 configured contrast pairs; initial scan
  found two real nested link/button controls and an arbitrary shadow. These have been corrected.
- Guard tests cover token generation, theme drift/injection, sRGB contrast, aliased icons, conditional
  classes, playback, interactive composition and configured-model eligibility.
- Rounder geometry: shared tokens increased to 16px controls, 24px dialogs/media and 28px cards.
  Browser checks measured 16px fields and 24px dialogs with no page overflow at 390px; desktop
  controls and dialogs, dark controls, and mobile controls were visually inspected. Screenshots:
  `output/playwright/rounder-{controls-desktop,dialog-desktop,controls-dark,controls-mobile}.png`.
  At that radius checkpoint, format/lint/type checks, design policy and 368 tests in 66 files passed.

## Acceptance scope and status

| Scope                                     | Required verification                                                                  | Status                                                                                                                                                                                                                                            |
| ----------------------------------------- | -------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Generated foundations in rendered product | Fonts, both themes, radius, contrast, responsive reflow                                | Foundation smoke checked at 1440/390 in light/dark; rounder 16px fields, 24px dialogs and no measured page overflow. Formal user study is optional; no empirical usability claim.                                                                 |
| First-review guide                        | Progressive current-task implementation; saved/resumed/denied/stale scenarios          | Six current replay functions pass, including cached refresh retention/recovery, denied access removal, opener clarity and pending/unsaved exits.                                                                                                  |
| Review and output                         | Inspector/source/decision round trip; keyboard/mobile; stale/partial/export states     | Six current replay functions pass, including revised-input recovery, proposal accept/reject and explicit clean-output approval. Local UI evidence only; see boundary below.                                                                       |
| Template lifecycle                        | Editor/reviewer/reader roles; exact revision, private draft, dirty/stale/archive paths | Two current local integration replays pass: exact approved original, private draft, stale/revoked access, dirty/reload/focus recovery, mobile, archive and restore. Injected roles and disk adapter; no production-auth claim.                    |
| Assistant and conversation context        | Explicit execution, source scope, partial/error/cancel/resume, keyboard/mobile         | Two current component/route replays pass with fictional metadata and streams. No live provider, credential, server-cancellation or authentication claim.                                                                                          |
| Navigation/settings/auth                  | Task contracts and current context/cancel/recovery audit                               | Four intercepted-request replays pass, including pre-request sign-out protection, URL/history, drafts, configuration/permission failures, revision-bound limits, auth recovery and mobile focus. Formal practitioner study is optional follow-up. |
| Whole repository                          | `vp check`, `vp run typecheck`, full tests and production build                        | Current format/lint/types, cloud build and fixture types pass; 371 tests / 67 files pass with an explicit 15-second timeout. The default timeout failure is documented below.                                                                     |
| Representative legal users                | Task-completion/comprehension study, if making empirical usability claims              | Not performed; no such claims made                                                                                                                                                                                                                |

A green policy scan is not acceptance of the pending rows. Existing older screenshots, tests or
recordings do not prove that the current workflow is intuitive. Record task, actor, starting state,
actions, observed result, viewport/theme, and remaining limitations when replacing a pending entry.

## Delivery scope

The user explicitly removed practitioner research as a blocker on November 13. The
[full-objective audit](completion-audit.md) covers the research, implementation, guardrails and
internal workflow verification. The requested design is accepted through task/state walkthroughs,
rendered app review and repository gates. [The study packet](usability-study.md) is an optional
follow-up, still NOT RUN; no empirical user-performance or comprehension claim is made.

Sign-out is repaired and verified as described below. Final delivery includes current app screenshots
using fictional demo data, with screenshot scope kept distinct from live deployment evidence.

## Foundation checkpoint commands

- `vp run design:check`: 301 authored files, 22 theme contrast pairs, zero failures.
- `vp test test/design-policy.test.ts`: seven guard tests passed.
- `vp check`: 785 files formatted; 561 files without lint/type issues.
- `vp run typecheck`: six workspace typecheck tasks passed.
- `vp test --maxWorkers=2`: 361 tests in 64 files passed.
- `DEPLOYMENT=cloud vp build` from `apps/web`: passed, public paths prerendered.

These commands validate the foundation/tooling change. They do not satisfy the workflow acceptance
rows above. The isolated UI fixture was started at `http://127.0.0.1:4286/`; it makes fictional API
responses and is appropriate for UI behavior evidence, not live authentication/provider/Word proof.

Foundation captures: `gitmatter-foundations-desktop.png`, `gitmatter-foundations-dark-desktop.png`,
`gitmatter-foundations-dark-mobile.png`, and `gitmatter-foundations-light-mobile.png` under
`output/playwright/design-research/`. These are specimen smoke checks, not full application acceptance.

## Progressive-review checkpoint (November 13, 2026)

See [the replay record](evidence/first-review.json) and [reproduction instructions](../test/acceptance/design-workflows/README.md).
Five CLI functions passed against current production components: new preparation, the state matrix,
unsaved close/route exits, pending preparation, and the template editor's shared guard. Native unload
prevention was signaled/cleaned up; no cross-browser native-prompt behavior is claimed.

The state matrix covers missing setup, failed/partial work, reader access, completed work, stale
source, unavailable initial progress, matter selection, keyboard activation/tab order and mobile
reflow. Preparation captured the fictional instructions with zero execution attempts and zero actual
provider calls. Screenshots show settled states, not an intermediate accordion animation frame. Open panels must
also reach their full content height before capture; `aria-expanded` alone is not paint evidence.

`vp check`, `vp run typecheck`, the fixture TypeScript project, 367 tests in 65 files, the cloud build,
and `design:check` (304 authored files / 22 contrast pairs / no failures) pass. Browser evidence here
is not full application, template lifecycle, live authorization/provider, or Word acceptance.

## Current review/output checkpoint (November 13, 2026)

The refreshed [first-review record](evidence/first-review.json) contains six passing entry points;
the [review/output record](evidence/review-and-output.json) contains six. The replay runner rejects
tool-level errors even when the shell reports success, and checks relevant source/script hashes
before writing the records. See the reproduction README for the exact command and coverage.

Internal walkthrough findings drove concrete repairs:

- Per-finding input survives comparison, failed saves and pending mutations. An unchanged proposal
  retry retains its request ID. Revised findings expose the earlier unfinished input for comparison
  without applying it to a new finding. Pending server work cannot be discarded as though cancelled.
- Quotation inspection focuses and highlights the captured source. Both finding and document drawers
  have programmatic names/descriptions and return focus correctly at 1440px/390px, including stale
  source wording. Confirm dialogs use the shared accessible title/description primitives.
- The manual document proposal has connected field labels and shared unsaved-navigation protection.
  Accepting/rejecting a proposal updates the corresponding finding state without falsely completing
  other findings. Invalid, stale, viewer, failed and unsafe Word states expose the documented gates.
- Output distinguishes report, tracked draft, pending clean request and authorized clean download.
  A cancelled confirmation does not approve anything; applied queue retrieval carries exact review
  and approval references. The fixture downloads fixed source bytes, not a real clean Word file.

All of this evidence is from production React components with fictional API responses. It does not
establish live authorization, legal correctness, actual provider behavior, real Word transformations,
deployment acceptance or empirical usability with legal users. Those claims are not made.

Previous review/output gates passed: `vp check`, `vp run typecheck`, the isolated fixture TypeScript project,
`vp test --maxWorkers=2` (368 tests / 66 files), `vp run design:check` (306 authored files /
22 contrast pairs / no failures), and the cloud production build. Both replay records were checked
against the current relevant source and script hashes.

## Template checkpoint (November 13, 2026)

The [template integration record](evidence/template-library.json) adds real local persistence and
exact approved DOCX identity to the earlier UI-only guard evidence. The editor/reviewer/reader path,
private next draft, 409 stale approval, copyable frozen note, explicit reload, denied/revoked access,
503 recovery, mobile reflow, list context/focus return, archive and restore-to-draft pass. The tracked
harness is reproducible from [its guide](../test/acceptance/template-library/design-acceptance.md).
Injected personas and a disk adapter remain explicit boundaries.

Template review notes now survive closing/reloading decisions and transient refresh failures. A
stale note stays visible and copyable without authorizing a new decision. Authoritative denial
removes the private view. List replacement no longer strands focus; a disappeared row falls back
to search. These repairs use the shared unsaved-work and snapshot-retention policies.

The template dialog keeps its identity and close action visible while the body scrolls. The mobile
walkthrough checks that the note is reachable without being covered by that header. Current static
checks cover nine design rules and 22 configured theme contrast pairs.

The final template replay includes controlled route open/close and an in-flight audited decision.
The save/discard bypass is set only after a confirmed server result or explicit user discard; new
input resets it. Pending actions have literal labels and a live status announcement.

## Settings/access checkpoint (November 13, 2026)

The [access record](evidence/access.json) contains three passing functions on current settings,
authentication and sidebar components with the real Better Auth browser client. A separate Vite
entry has no application backend; unhandled API paths return 599. Browser interception supplies
fictional outcomes and blocks remote requests, including the actual challenge service. All typed
credentials and identity are fictional. See [reproduction and limitations](../test/acceptance/account-ui-fixture/README.md).

- Settings selection follows URL/history. Only visited panels query their data; their mounted input
  survives tab changes. Hidden panels are inert and hidden. One exit decision covers all drafts.
- Failed profile save retains input; pending fields and discard are disabled. Configuration refresh
  outage retains readonly input, retry restores it, and authoritative denial removes private rows.
  An invitation-access outage no longer grants assumed admin controls.
- Review-limit drafts survive a background revision and 503. Explicit Keep/Discard controls reload;
  pointer and form-submit gates block stale mutation. Failed save preserves reason and revision,
  and confirmed success permits exit.
- Signup availability error stays distinct from closed registration. Challenge script failure,
  retry and expiry have explicit states. Enter and button submissions require readiness. Signup,
  login, reset request/reset completion, verification and second factor recover after network error.
  Passkey-service rejection retains password login. External return URLs are rejected; local
  returns work. These are fictional request outcomes, not real successful authentication.
- Mobile tabs remain reachable by horizontal scroll. Workspace navigation has an accessible modal
  name, trapped focus, Escape and focus return. The 390px captures are
  `settings-mobile.png` and `auth-mobile.png` in `output/playwright/design-workflows`.

The fixture's theme provider emits a React warning about its client-rendered theme script. Injected
HTTP failures and aborted requests also appear in the console. No zero-console-error or complete
application-accessibility claim is made. Native prompts are suppressed only for explicit scenario
resets; client route guards remain real. Sign-out before-request handling remains the next source
finding, as listed above.

Current gates: `vp check` passes (854 formatted files; 608 lint/type-checked files), six
`vp run typecheck` tasks and the account fixture TypeScript project pass, the cloud production build
passes, and `design:check` reports 313 authored files / 22 contrast pairs / zero failures. All twenty
browser entry points have current relevant source hashes, including refreshed first-review,
review/output, template and assistant records after the shared navigation guard change.

The default 5-second test run has 370 passing assertions and one timeout in the existing
`document-upload.test.ts` version-deletion integration case. That file also timed out in isolation;
its seven tests pass with a command-line 15-second timeout. It uses configured real object storage,
so this is not evidence that browser contention alone caused the delay. No test or document code
was changed. The full suite passes: `vp test --maxWorkers=1 --testTimeout=15000`, 371 tests across
67 files in 144.44 seconds. The ordinary 5-second timeout has not been reclassified as a pass.

One later `vp check` invocation crashed in the native TypeScript linter before analysis. The
environment doctor passed and an unchanged rerun passed all format/lint/type checks. The log is
`/tmp/gitmatter-access-check-retry.log`; no source workaround or toolchain change was made.

## Assistant checkpoint (November 13, 2026)

The [assistant record](evidence/assistant.json) adds two replay functions to the earlier fifteen.
Prepared workflows no longer dispatch on mount. Start authorizes ordered steps, and only a confirmed
completed response advances them. Stop, stream errors and truncation pause the queue. Model/file
readiness gates cover keyboard and pointer sends; original request context and partial output remain
inspectable. A follow-up draft entered during a response survives completion and route inspection.

Saved fetch failure is distinct from a new conversation. Return waits for current server history,
active observers remain registered after a send, transient errors retain drafts while blocking dispatch,
and denied access removes private content. Matter identity is checked and the inspected document
identity is verified in the next request. Mobile panes and activity focus return pass at 390px.
The actual provider call count is zero; all streams and extraction events are fictional.

At the assistant checkpoint, settings, shell navigation and authentication were still pending. The official
[aws-secrets-manager skill](https://github.com/aws/agent-toolkit-for-aws/blob/main/plugins/aws-core/skills/aws-secrets-manager/SKILL.md)
was located and read, resolving the earlier missing-skill question. No secret values were retrieved.

The mobile header now wraps action groups and bounds breadcrumb labels without overlap. Full matter
and document context remains visible at the composer and is associated with its accessible description.
The assistant snapshot verifies both the visible context and the identifiers dispatched with a request.

Assistant phase validation: `vp check`, `vp run typecheck`, the assistant fixture TypeScript project,
`vp run design:check` (311 authored files, 22 contrast pairs, zero failures) and the cloud build pass.
The full suite passes serially: 371 tests in 67 files with `vp test --maxWorkers=1`. The preceding
two-worker run had one five-second timeout in document-version deletion; that unchanged seven-test
upload file passed in isolation. Neither test code nor timeouts were relaxed at that earlier checkpoint. Its seventeen browser
entry points were current then; the settings/access checkpoint above supersedes that validation.

## Sign-out and full-objective audit (November 13, 2026)

The [access record](evidence/access.json) now has four functions, bringing the total to **21 recorded
browser entry points**. All relevant source hashes and script hashes match current files. The new
sign-out route starts only after the standard router transition resolves current dirty/pending
guards. Keep sends no request; pending saves disable discard; explicit discard precedes dispatch.
Rejection and network failure expose retry, pending action is disabled, and confirmed success reloads
login. Direct URL/query entry and hover do not end a session. The action uses history-state intent,
consumed once, rather than a URL-triggered mutation. All auth responses remain fictional.

Fresh gates pass: `vp check` (859 formatted files; 611 lint/type-checked files), six workspace
`vp run typecheck` tasks, account fixture TypeScript, cloud production build, `design:check`
(314 authored files / 22 contrast pairs / zero failures), and `vp test --maxWorkers=1
--testTimeout=15000` (371 tests / 67 files, 150.49 seconds). The previously documented default
5-second storage integration timeout remains a limitation; it was not silently counted as green.

The [requirement audit](completion-audit.md) maps research, system ownership, all twelve philosophy
principles, guardrails, references and workflow evidence. Local relative Markdown links resolve.
That checkpoint initially treated practitioner task evidence as a delivery gap; the user has since
removed that extra gate. The optional headed settings study setup
was smoke-tested and returned `READY_FOR_HUMAN_OBSERVATION`, with **zero participant tasks executed**.
It intercepts all API/remote requests and deliberately fails writes. No real session, key, mail or
credential operation occurred. This setup is not counted as a 22nd accepted workflow or user study.

## Final design delivery (November 13, 2026)

The user removed the unrequested practitioner-study blocker. Research, the deterministic system,
guardrails and the requested workflow designs are complete under the internal design acceptance
criteria. The optional study is still NOT RUN; that fact does not prevent delivery.

Seven current [screenshots and their hashes](screenshots.json) cover the homepage, actual review
and settings app frames, dark/mobile settings and desktop/mobile matter assistant. Demo records and
identity are fictional. Assistant images crop only the surrounding fixture controls. No screenshot
was generated or retouched, no provider was called, and no live-authentication/deployment claim is made.

Fresh validation: all 21 browser records have current relevant source/script hashes; the twelve
first-review/review functions were replayed after the visual fixture addition. Workspace and fixture
types, format/lint checks, design policy (314 authored files, 22 contrast pairs) and the cloud build
pass. The full suite passes 371 tests / 67 files in 135.50 seconds with the documented explicit
15-second integration timeout. The default 5-second storage-test timeout has not been relabeled.

## Product frame redesign

Production and previews now share `AppFrame`. Navigation, operational typography, page context and
work gutters are coordinated; settings use flat sections with aligned fields and stable section
navigation. Rounded geometry is preserved on controls, overlays and substantial surfaces.

Review has a compact context/status toolbar, a bounded reading area and an independently scrolling
24rem inspector. Proposal fields are disclosed on demand. At narrow widths a finding selector and
expandable status/history preserve the work area. The completion subtree remains mounted during
viewport changes; the output replay verifies that a prepared approval request is retained rather
than offered for duplicate preparation. Desktop/mobile selection share the existing read-event path.

The assistant uses the same frame, thin pane boundaries and task-specific empty copy, with visible
matter/document scope. Current screenshots are unmodified local browser captures with fictional
data and no inference requests. This revision is an adaptation of the published Harvey principles;
it does not claim access to Harvey's private component library or a linked proprietary Figma file.

Final revision checks: 21 recorded workflow entry points match current relevant source/script
hashes. `vp check` passes (863 formatted files, 613 lint/type-checked files), workspace/fixture
typechecks pass, design policy checks 316 authored files and 22 contrast pairs with zero failures,
and the cloud build passes. The full suite passes 371 tests in 67 files in 141.34 seconds with the
documented 15-second integration timeout. Eight desktop/dark/mobile captures are bound to current
relevant sources in `screenshots.json`. No schema or test-timeout source was changed.

## Vault table-first revision (November 13, 2026)

The user chose Harvey Vault's review table as the visual anchor. The review route now starts with
compact document rows and question columns, rather than automatically opening the workbench.
Filename context stays pinned on desktop; mobile scrolls the matrix within its container. The cell
inspector is nonmodal on desktop and modal on mobile. Table and Document representations share
revision-keyed rationale/proposal drafts, URL selection and one navigation guard. Source-version
status is not human verification. Rounded foundation geometry is retained.

Seven review/output browser entry points have fresh relevant source/script hashes, including the
new table/default, nonmodal selection, shared draft, source-return, Escape/focus and responsive
checks. Existing denied, invalid, stale, failed, resumed, proposal and output checks pass after
explicitly selecting Document. Earlier evidence for unrelated workflows remains a historical
checkpoint, not a fresh replay claim for this revision.

Four current unmodified browser captures show the table, inline inspector and mobile representations
using fourteen labelled, identical fictional review copies. This preview is read-only and uses no
provider. The previous eight screenshots and original hashes are archived separately. The current
manifest records the capture script, relevant sources and image hashes. These are local fixture
captures, not authenticated production evidence or private Harvey-library parity.

Validation: `vp check`, `vp run typecheck`, the isolated fixture typecheck, `vp run design:check` and
the cloud production build pass. The full suite passes 371 tests / 67 files in 179.29 seconds using
`vp test --maxWorkers=1 --testTimeout=15000`. The explicit timeout remains documented; the default
5-second storage integration timeout is not relabelled. No schema or timeout configuration changed.

## Shared primitives and frame correction

The user rejected excessive rounded grey framing and clipped content. Workspace and table frames
are now unboxed, with lighter decorative grid rulings independent of interactive field boundaries.
Question columns fit the normal desktop canvas; constrained panes expose keyboard scrolling and
previous/next-column buttons. Headers wrap, and the captured full finding remains in the inspector.
Control/dialog/card radius roles are retained.

Generic behavior now comes from the installed shadcn system: Breadcrumb in PageHeader, retained Tabs
for review representations, one Sheet shell for document/mobile finding overlays, and Badge status
variants. The virtualized review table still composes shadcn Table with TanStack; source identity,
revision-keyed drafts and audited actions remain application responsibilities. Registry additions
retain local button customizations and use the existing utility helper without a new dependency.

The user also requested deleting `.plans/evidence`: all nine records were removed and references
inside `.plans` were converted to ordinary historical text. The plans no longer direct new records
into that directory.

This correction passes seven review/output browser flows and four settings/access flows, including
retained Tab panels, Sheet source round-trips, Escape/focus, denied and stale states, and real
previous/next column scrolling on mobile. Ten focused design-policy/model-eligibility tests pass.
`vp check`, workspace and isolated fixture typechecks, `design:check` (318 authored files, 22 theme
contrast pairs) and the cloud production build pass. The four refreshed screenshots and their
relevant source hashes describe local fictional data, not a production deployment.

## Application-wide shadcn consolidation (November 16, 2026)

The shared Sidebar replaces the custom navigation rail/mobile overlay, with saved desktop preference,
focus return and preserved editing shortcuts. Twenty-one native selectors, sixteen text fields and
twenty-three checkbox usages now compose shared shadcn primitives. List/matter filters use
ToggleGroup; shared search uses InputGroup; document/lifecycle cues use Badge; empty/error states
use Empty; the assistant's narrow activity view uses Sheet. Existing domain state and audit/API
boundaries remain separate from presentation.

The wider walkthrough caught and removed negative-margin pagination clipping on Clients/Matters.
The shared pager now wraps on mobile. Production list routes are captured in a separate read-only
fictional fixture; settings and assistant retain their isolated fixtures, and template decisions
continue to use the local DB/disk harness. No paid inference, live authentication or production
release is claimed. The `.plans/evidence` deletion remains in place.

Fresh verification covers all 21 first-review, review/output, settings/access, assistant and template
workflow entry points plus the five-screen app walkthrough. The latter exercises search/return,
filters, table selection, navigation focus, text shortcuts, pagination bounds and desktop/mobile
layout. The full built-in suite passes 371 tests in 67 files with the documented explicit 15-second
integration timeout; default 5-second storage timing is not relabelled. Workspace/fixture types,
format/lint, design policy (322 authored sources, 22 contrast pairs) and cloud build pass. Current
screenshots show unmodified browser renders with fictional records.

## Default radius scale (November 16, 2026)

The user replaced the earlier custom roundness preference with shadcn defaults. The canonical base
is now 0.625rem, with the documented proportional scale: fields/selectors 8px, dialogs 10px and
cards 14px. The assistant composer and its actions also use their default control radii. Inputs,
input groups, native/custom selectors and textareas inherit the shared scale rather than local
pill overrides. Current instructions and design guidance reflect this superseding preference.

Fresh checks for this styling change cover the five-screen desktop/mobile app walkthrough, settings
capture and measured 8px input/selector radii, assistant interaction checks and refreshed screenshots.
Earlier workflow records retain their original source hashes; they are historical functional checks
rather than fresh attestations of the new geometry.
