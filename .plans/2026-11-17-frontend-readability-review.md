# Frontend readability review — 17 November 2026

**Scope:** read-only application of `/Users/applecakes/.codex/skills/simplify-code/SKILL.md` to the integrated frontend changes from `origin/main` (`ac8a5fa585de62851ee441e8eb77d3f4c2970db9`) through `04642c1536095ea2098ada5183bfe17aa0a687a2`. The review used `/Users/applecakes/.codex/worktrees/gitmatter-consolidation` and checked that `apps/web/src` had no uncommitted differences from that revision. AU browser-recorder and evidence edits were outside this source review.

The initial review changed only this report. The orchestrator then authorized the two bounded source edits below; their implementation and validation are recorded at the end. No branch, index, server, test fixture or acceptance record was changed by this agent. Feedback and template changes still being prepared in the original checkout were deliberately excluded. The final combined delegated diff needs another scoped review after those changes are integrated; this report does not claim to cover them.

## Result

The reviewed snapshot, draft and practitioner controls have understandable ownership and explicit failure paths. No blocking readability defect was found. Two small deduplications improve the changed code without introducing shared machinery or changing feature boundaries. Both were applied in the authorized follow-up; final browser replays remain separate.

## Recommended bounded edits

### 1. Keep guided preparation inputs in one feature-local function

`apps/web/src/routes/_auth/assistant/-components/GuidedTaskDialog.tsx:78–101` constructs the same `guidedApi.prepare` request twice, once for preparation and again immediately before handing work to the assistant. Both send task, matter, source IDs, effective jurisdiction and instructions.

Define one local function, for example `prepareCurrentSelection`, that constructs and sends that request. Use it as the `mutationFn` for both existing mutations. Keep their separate success handlers: preparation updates the editable prompt; the later check resolves the exit guard and passes the reviewed prompt to the assistant.

This is actual reuse within one feature and removes the risk of adding a selected input to only one path. Do not reuse the first response instead of making the second request: the second request deliberately rechecks current access/readiness. Do not move this dialog-specific state or orchestration into a global hook or API framework.

If applied, check the AU guided-work browser cases for edited prompt retention, stale/denied source rejection, explicit sample replacement and zero inference before the assistant send. The server prepare operation and request count must remain unchanged.

### 2. Reuse the existing configured-model predicate for the URL hint

`apps/web/src/routes/_auth/reviews/$id.tsx:187–191` repeats the available-provider/exact-model search already implemented by `apps/web/src/lib/data/configured-model.ts` and already used earlier in the same route.

Replace only that nested `providers.some(...models.some(...))` expression with:

```ts
configuredModelAvailable(model, guide.data?.application.providers ?? [], false);
```

Keep the surrounding guide loading/fetch/error checks and the invalid-hint/explicit-choice logic. The explicit `false` matters: a URL hint must remain an exact configured model, without permitting the helper's arbitrary OpenRouter model fallback. The guide's provider contract uses the same provider/model shape. The helper's empty/length checks agree with the route's existing overall model-availability gate.

If applied, run `test/configured-model.test.ts`, the workspace type check and the review/first-review model-selection browser cases. Confirm that unavailable or malformed hints still require an explicit valid selection and never silently choose another paid model.

## Reviewed boundaries and deliberate complexity

| Area                            | Sources inspected                                                                                                                            | Decision                                                                                                                                                                                                                                                                                                    |
| ------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Detail freshness and recovery   | `lib/data/snapshot-refresh.ts`, `components/SnapshotNotice.tsx`, review route, document route and `DocumentDrawer.tsx`                       | Keep the small shared policy. Readable outage snapshots, authoritative denial, first-entry verification and established background polling are different states. Collapsing them into one loading/error boolean would change privacy, drafting focus or action readiness.                                   |
| Finding drafts                  | `reviews/-components/useReviewActionDrafts.ts`, review route and its action/workbench callers                                                | Keep revision-keyed state and earlier-draft recovery in the review feature. Request identity must survive an unchanged retry; earlier input must not be applied automatically to a new finding revision.                                                                                                    |
| Navigation and pending work     | `components/UnsavedChangesGuard.tsx`, `lib/hooks/useDraftExit.tsx`, `components/ConfirmDialog.tsx`, `components/AppFrame.tsx`                | The workspace registry has multiple real consumers. Keep a single workspace decision and the synchronous request latch. The confirmed-save bypass and pending/discard distinction protect asynchronous ordering; replacing them with a generic boolean form wrapper would lose meaning.                     |
| AU guided handoff               | `GuidedTaskDialog.tsx`, `GuidedStarts.tsx`, assistant route, `lib/data/guided-task-launch.ts`, `guided-api.ts`                               | Launch storage requests a dialog, not inference. The small strictly parsed envelope and explicit assistant send are clear. Apply only recommendation 1; no wizard framework or shared task controller is justified.                                                                                         |
| Practice preferences            | `settings/-components/PracticeProfileCard.tsx`, `PracticeSetup.tsx`, `lib/data/practice-api.ts`, practice contract and jurisdiction registry | The form and setup explanation have different responsibilities; keep them feature-local. Read-only profile handling, draft preservation, parsing and explicit save are already direct. Two short jurisdiction filters do not justify a new cross-package UI abstraction in this increment.                  |
| Practitioner review             | `documents/-components/PractitionerReviewPanel.tsx`, document-route caller and `DocxView.tsx`                                                | Preserve document-route ownership of drafts across denied refreshes, version/head matching, token-bound confirmation and successful rendering of the current version. Cancellation plus detached rendering prevents an obsolete asynchronous render from replacing the current source; both are purposeful. |
| Collections and shared controls | `CollectionPanel.tsx`, `DataTable.tsx`, `ProgressiveTaskList.tsx`, `lib/hooks/state/useWorkspaceViewState.tsx`, shared primitive call sites  | Keep collection placeholder/filter behavior separate from detail snapshot policy. Virtualization, width measurement, focus/scroll restoration and retained accordion state are distinct operations. Do not split them into tiny hooks merely to reduce line counts or rewrite installed shadcn primitives.  |
| First-review journey            | `components/FirstReviewGuide.tsx` and its setup/progress callers                                                                             | The long component mainly contains eight ordered task descriptions. Existing named progress logic and setup component provide useful boundaries. A generic schema-driven wizard or eight additional files would obscure the current path without removing substantive repetition.                           |

The finding-draft and practitioner-draft stores intentionally remain separate: their value shapes, revision identities, recovery UI and mutation semantics differ. Snapshot notices and collection notices also have distinct contracts. Superficially similar JSX is not sufficient reason to merge those behaviors.

## Checks and evidence

- Read the mandatory skill and project instructions; compared the changed source with `origin/main..04642c1`; inspected the ordinary, pending, transient-error, denied, stale, cancelled and resumed paths in the named source/callers.
- Confirmed `git diff --name-only 04642c1 -- apps/web/src` was empty during this review. No pending original-checkout code was treated as final integrated source.
- Earlier in this same agent run, default `vp test` on `04642c1` passed **504 tests in 86 files**, with no skipped tests, worker/timeout overrides or retries, using isolated synthetic Postgres and real loopback HTTP MinIO. The complete log is `.scratch/integration-default-tests-04642c1.log`; its SHA-256 is `b05d56d20426ac64d3b2af53aa19a6eb0136e1f206ee2d7cf00c8cdfe39256ec`. The structured receipt is `.scratch/integration-validation-04642c1.json`.
- The generated NDA fixture-source check and MCP documentation check passed at that revision. The documentation check first lacked its required import-time `DATABASE_URL`; it passed when supplied the same synthetic local database value.
- The initial pass was review-only. The authorized follow-up and its focused checks are recorded below. Final combined-source checks and any affected browser replays remain the integrating agent's responsibility.
- No production deployment, live provider quality, actual provider account controls, native Word UI fidelity or representative-user usability is established by this review.

## Authorized follow-up

Applied recommendations 1 and 2 in the integration checkout, with no additional source changes:

- `GuidedTaskDialog.tsx` now defines one local `prepareCurrentSelection` function and passes it to both existing mutations. Each mutation still makes its own request. Their distinct success handlers, prompt editing, final permission/readiness recheck and explicit assistant dispatch remain unchanged.
- `reviews/$id.tsx` now calls the existing `configuredModelAvailable` helper for the URL hint, with the OpenRouter fallback explicitly `false`. The surrounding readiness, malformed-hint and explicit-selection gates are unchanged.

Re-read the two-file combined diff after editing under the simplify-code skill. The shared function remains local to its feature; no new hook, wrapper, registry or prop plumbing was introduced. No further worthwhile simplification was identified in that diff.

Observed validation:

- **PASS:** `vp test test/configured-model.test.ts apps/web/src/lib/data/guided-task-launch.test.ts apps/web/src/routes/_auth/assistant/-components/workflow-seed.test.ts` — six tests in three files, using a clean environment without provider credentials or a root `.env`.
- **PASS:** `vp run typecheck` from `apps/web` (`tsc --noEmit`).
- **PASS:** scoped `vp check` for both changed source files (format, lint and types; no warnings) and `git diff --check` for the pair and report.
- **Pending:** final integrated AU and review browser replays, coordinated by root after the combined delegated source settles. These focused module checks do not substitute for those interaction replays.
