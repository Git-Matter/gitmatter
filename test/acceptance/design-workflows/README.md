# Design workflow acceptance

These are function entry points for `playwright-cli run-code --filename`, not `@playwright/test`
specs. They exercise production React components through the isolated fixture with fictional API
data. They do not authenticate, call model providers, publish templates, transform a real Word file,
or establish production release acceptance.

## Reproduce

Start the fixture from the repository root:

```sh
vp dev --config test/acceptance/mvp-ui-fixture/vite.config.ts
```

With a Playwright CLI supporting named sessions and `run-code --filename`, set `PLAYWRIGHT_CLI` to
its executable (the installed Playwright skill wrapper also works):

```sh
PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs first-review
PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs review-and-output
```

Each group uses its own named session and runs its functions serially. Each function selects its own
fixture state. Individual functions can also be run with `playwright-cli --session NAME run-code
--filename=test/acceptance/design-workflows/NAME.js` after opening the fixture in that session.
Template mutation endpoints and model-execution endpoints fail closed. Delayed scenarios hold a
fictional metadata or human-decision response for 2.5 seconds; they do not start inference.

The CLI can print `### Error` while returning shell status 0. Inspect the returned result/assertions,
not just the process status. The replay runner rejects an error, missing structured result, process
failure, timeout, or a relevant source/script changing during the run. It writes the corresponding
JSON records under `design/evidence` only after the whole group succeeds; raw logs go under
`output/playwright/design-workflows/replay-GROUP`. Records include results and source/script hashes.
They are checkpoints, not complete transitive bundle attestations. Format generated JSON with
`vp fmt design/evidence` before the repository checks.

## Coverage

`replay.mjs australian` uses the single-port
[Australian component fixture](../australian-ui-fixture/README.md) on4280. It exercises guided
preparation/failure/Keep/Discard and source identity without inference; retained practice settings,
transient refresh and pending/failed saves; version-keyed practitioner drafts across private-panel
unmount/recovery, blank-source blocking, stale rejection/reconfirmation and exact state-token
payloads. Desktop and normal mobile components are captured. Displayed-source readiness and HTTP
responses are fictional; the group does not prove real rendering, immutable storage, authorization,
legal quality or live assistant dispatch. Its record is `design/evidence/australian.json`.

| Entry point          | Verified behavior                                                                                                                                                                                            | Boundary                                                                             |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------ |
| first-review         | One initial stage; recommendation does not replace selection; explicit Continue focuses the next stage; entered context and standard survive inspection; preparation captures instructions without execution | Fictional prepare response, not a live provider or authorization proof               |
| first-review-states  | Missing storage/provider/standard/source; resumed, failed, viewer, complete and stale work; retryable initial error; no-matter orientation; Enter/Space and tab order; 390px page overflow                   | Not a background-refetch failure test or representative-user study                   |
| first-review-exit    | Keep on local close and route exit; deliberate discard; focus to setup opener; fresh reopen                                                                                                                  | Does not assert an unknown fixture route's final destination                         |
| first-review-saving  | Local close and discard disabled while saving; confirmed save navigates despite an earlier blocked exit                                                                                                      | Delay models pending metadata save, not paid work cancellation                       |
| template-unsaved     | Named dialog; Escape/Keep retains draft; discard closes; unload event prevention/cleanup; fresh reopen                                                                                                       | No template API mutation or full approval/download lifecycle                         |
| first-review-refresh | Cached 503 refresh failure retains instructions, disables stale preparation and recovers; 403 removes private content; setup opener is distinct and absent while open                                        | One denied/transient API fixture, not real session revocation proof                  |
| detail-recovery      | Initial error/retry; cached detail and completion outages pause actions; retained drafts, denied-content removal and authorized recovery; background polling focus; denied drawer close                      | Fictional network outcomes and zero recovery writes, not production authorization    |
| review-workspace     | Finding comparison retains rationale; quotation opens the highlighted captured text with explicit focus; mobile return preserves selection; human disposition saves                                          | Fictional audit response, not legal correctness proof                                |
| review-drafts        | Failed save retains rationale/choices; unchanged retry keeps identity; route Keep/Discard and unload lifecycle; pending save protected across comparison; earlier revision input remains recoverable         | Ephemeral local input; no browser-storage or offline recovery claim                  |
| review-inspector     | Named finding/document dialogs; captured-version download; read-only rerun disabled; source and Escape return focus; 1440/390px, current/stale source and no overflow                                        | Production drawers with a fixed source preview, not a private vendor or auth session |
| review-states        | Invalid quotation, stale source, reader permissions, unknown provider outcome acknowledgement and safe/unsafe Word presentation                                                                              | Does not execute a retry or establish real Word coverage                             |
| review-proposal      | Approved clause/quote → proposed draft → accept/reject exact change → correct finding status; remaining work stays open; manual document inputs are labelled and guarded                                     | Fictional legal state and fixed document bytes; no native Word transformation proof  |
| review-output        | Tracked draft/report distinctions; pending download hidden; exact source/owner approval; confirmation cancel; applied-queue retrieval; bound download URL; mobile reflow                                     | Download is explicitly fixed fictional source bytes, not an actual clean output      |

Screenshots are under `output/playwright/design-workflows/`. Finite animations are disabled at capture
time to show settled states; the keyboard test runs through real opening/closing interactions.
Native unload checks dispatch a cancellable event and inspect prevention. They do not claim that
all browsers display the same native confirmation prompt.

The review fixture also supports `?preview=1` on its production review route. This renders the
actual sidebar and app frame without the test-control toolbar, using the same fictional records.
It is a visual preview, not a new authentication mode or a deployed application. The normal replay
mode remains unchanged. Final captures and relevant hashes are listed in `design/screenshots.json`.

## Important discoveries

Inactive task panels must stay mounted to retain nested form state **and** become inert immediately
to avoid a focusable closing panel. Merely checking `aria-expanded` is insufficient. Use role queries
for visible controls and a captured native input ID when verifying retained values in a closed panel;
role queries correctly exclude inaccessible/hidden controls.

Preparation needs a confirmed-save bypass for an unsaved-work guard before navigation. That bypass
is set only in the successful mutation callback and reset when inputs change. Local stage inspection
is distinct from leaving or discarding a setup form.

The fixture has its own Vite dependency cache and deduplicates React so adding a production primitive
cannot accidentally mix the app and fixture's prebundled React graphs.

## Additional surfaces

`replay.mjs template-library` uses the tracked local integration harness on port 4280. See
[the setup and evidence boundaries](../template-library/design-acceptance.md). This group uses real
loopback Postgres and original fictional files, rather than the API-response fixture used by the
first-review and review/output groups. It still does not establish production authentication.

## Assistant fixture

Start `vp dev --config test/acceptance/assistant-ui-fixture/vite.config.ts`, then run
`PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs assistant`.
The fixture is at port 4280 and uses a fictional identity, model catalog, extraction subscription
and streamed answers. Its fetch adapter blocks remote URLs and unimplemented API paths. It does not invoke
a model, credential API, mail service or real authentication. Scenario resets suppress native unload
prompts only to discard fictional setup state; client route Keep/Discard behavior remains real.

`assistant-execution` verifies model/configuration recovery, keyboard/IME, failed/processing files,
zero-send preparation, ordered steps, stop/error/truncation, request-context retention and deliberate
draft exits. `assistant-context` verifies saved history, continuing the same chat, cache freshness on
return, refresh recovery/denial, older records without fabricated outcomes, matter identity, source
request payload, mobile pane preservation, keyboard resizing, reader controls and activity focus return.
The recorder closes its own named browser before each group for a fresh test environment.

## Settings and access fixture

Start `vp dev --config test/acceptance/account-ui-fixture/vite.config.ts`, then run
`PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs access`.
Port 4280 uses actual settings/authentication components and the Better Auth browser client,
fictional shell session resolution, and a memory router. Browser scripts intercept all API calls
before navigation and block remote requests, including the actual challenge service. Unhandled
API paths fail with 599; this fixture has no application backend or environment loading.

`settings-navigation` checks lazy retained panels, URL/history agreement, drafts across tabs,
one exit decision, failed/pending save behavior, stale/denied provider metadata, invitation-access
recovery, narrow tabs and the navigation modal's keyboard/focus return. `settings-limits` covers
background revisions, explicit reload, transient outages and revision-bound retry without erasing
drafts. `auth-recovery` covers signup availability, security-check load/retry/expiration, button/Enter
readiness, input retention after network failure, passkey-service rejection, missing/expired/mismatched
reset input, two-factor pending/retry, verification wording and safe local return paths.

`sign-out` verifies that hover/direct URLs send nothing, dirty-work Keep retains input without a
session request, pending saves block exit, deliberate discard precedes dispatch, errors permit retry,
pending requests are not duplicated and only confirmed success reloads login. It uses the current
sign-out route and real Better Auth client with fictional responses; no real session is ended.

No real account, password, API key, agent token, invite, email, hardware passkey or challenge
verification is performed. Successful responses are fictional UI evidence. These cases do not prove
production authentication or server authorization; native unload prompts are excluded during
explicit fixture resets.

## Moderated workflow review

[The study packet](../../../design/usability-study.md) contains neutral practitioner tasks and an
unfilled observation form. It is marked NOT RUN. Automated setup does not count as a participant.

For its settings/sign-out tasks, start the port-4280 fixture, then open a dedicated headed session:

```sh
/path/to/playwright-cli --session design-study open about:blank --headed
/path/to/playwright-cli --session design-study run-code --filename=test/acceptance/design-workflows/study-setup.js
```

Leave that browser open for the person to use. This setup intercepts requests and deliberately
fails every write. It does not perform a participant task. Do not open the URL in a different
browser and assume it has the same interception. A moderator can read anonymous request counts
with `await page.evaluate(() => window.studyRequestSummary())` through the CLI; no entered values
are collected. Close and reopen the named session before each participant to reset state.

## Nine-issue workspace regression

Stop the main app before starting this fixture. Reuse port 4280; do not start a second preview:

```sh
vp dev --config test/acceptance/app-ui-fixture/vite.config.ts
PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs ux-nine
```

This group runs `ux-nine`, `ux-authoring` and `app-wide` against the real production components.
It checks failure/denial, blocked stale results, mixed selection, keyboard actions and return focus,
page/scroll restoration, named dialogs, draft recovery, persistent errors, pending confirmations,
zero-write workflow hydration and ordered autosave. It captures six list routes plus Settings on
desktop/mobile and explicit failure/pending states. The recorder rejects source/script drift or a
missing structured result. Source hashes identify relevant modules, not an entire runtime bundle.

API data, identity and write outcomes are fictional. Better Auth passkey metadata and profile failure
are intercepted at transport level because its browser client binds fetch before fixture setup.
Unhandled server API requests return 599. No backend, live auth, credentials or provider call is used.
Native browser Back is tested; native unload is suppressed only during an explicit scenario reset.
Stop the fixture and restore the main app on 4280 after replay. Current screenshots are indexed in
`design/screenshots.json` and `output/playwright/app-screenshots.html`; older packets remain historical.

## Input and action feedback regression

With the sole app-ui fixture on port 4280, run:

```sh
PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs feedback
```

This runs `feedback-interactions`, `ux-nine`, `ux-authoring` and `app-wide`. The first script tests
real guidance association, a rejected save followed by confirmed fictional success, no premature
success, six-second and route persistence, dismiss/focus return, client creation, durable local
autosave status, pressed-state geometry, reduced motion and mobile containment. Receipts must disappear
on a full reload. It captures six feedback states in addition to the normal app and recovery views.
No actual credential value or live credential operation is used. The normal application must be
stopped before this fixture and restored after it; do not run another port in parallel.
