# First contract review

## Brief

Person: a matter editor preparing a first review, or a reader inspecting existing progress.
Object: one matter, an uploaded source version, approved standard, captured client instructions,
and an attributable review. Entry: `/first-review?matterId=…` or a matter overview. Terminal result:
findings inspected, human decisions recorded, correct output requested/downloaded if permitted.

Primary reference: GOV.UK multi-task status. Supporting references: Linear contextual creation,
Stripe's prepare/confirm distinction, Harvey source context, Legora cited review.
Sources and rejected alternatives: [comparison matrix](../research/saas-patterns.md).

## Required flow

`choose matter → establish prerequisites → capture instructions → explicitly run → inspect findings → decide → request the right output`

Existing source owner: `apps/web/src/components/FirstReviewGuide.tsx`. The current guide exposes
8 stages: storage/processing, execution route, approved standard, uploaded document, instructions,
cited findings, human decisions, and Word output. They are a set of dependent tasks, not 8 pages
that every person must traverse in sequence. Do not force setup again when resuming valid work.

| State                    | Orientation / next action                                       | Preserve / recovery                                               |
| ------------------------ | --------------------------------------------------------------- | ----------------------------------------------------------------- |
| No matter                | Choose/create a matter; do not imply review work exists         | Return with the chosen matter                                     |
| Reader                   | Inspect progress and sources; explain who may prepare or decide | No hidden mutation path                                           |
| Missing processing setup | Explain the specific prerequisite; link to scoped settings      | Return to this matter                                             |
| No execution route       | Choose application model or inspect a connected agent           | A local choice does not mark the provider verified or start a run |
| No approved standard     | Identify the approval prerequisite and responsible role         | Inspect draft standard without publishing it                      |
| Source processing/failed | Per-document state; open source or retry the affected upload    | Keep original; avoid a second silent upload                       |
| Ready to prepare         | Capture source/standard and client instructions                 | Show unknowns; retain input on error                              |
| Prepared, not run        | Verify model/scope/estimate and explicitly run or hand off      | Opening/setup must not buy inference                              |
| Partial/failed findings  | Show actual counts and affected units                           | Retry only safe failed work; disclose uncertain outcomes          |
| Source changed           | Identify captured vs current version; prepare a fresh review    | Do not silently bind old findings to the new draft                |
| Findings ready           | Inspect source and choose a human disposition                   | Quotation and rule stay with the decision                         |
| Decisions complete       | Explain output choices and any remaining blockers               | Download readiness is not proof of a native Word review           |
| Resumed                  | Recommend the next task using saved facts                       | Do not reset valid work or steal focus during polling             |

## Presentation contract

Show a compact task overview and one useful stage in depth. Other stages remain inspectable.
Recommended next step and expanded/selected step are different concepts: saved progress can change
without collapsing the task the person is editing. Never mark a stage complete because it was opened.
Keep the same stage vocabulary in guide, review setup, and output controls.

Required preparation data cannot be removed just to shorten the form. Known matter/source values
should be prefilled and rechecked; unknown legal instructions must stay explicit. “Prepare” and
“Run” remain different actions and different state transitions.

## Acceptance tasks

- New user finds the first necessary task without scanning all setup detail.
- Existing valid review resumes at findings/decisions/output without repeating provider setup.
- Choose an execution route and prepare a review; catalog/estimate calls may occur, execution does
  not occur until an explicit run. Verify the existing fixture's execution counters.
- Open a completed task, return to the current task, and retain entered instructions.
- Missing provider, standard and source each explain their own recovery route.
- Read-only and stale-source states do not imply authority or readiness they do not have.
- Keyboard summaries announce expanded state, retain logical focus, and work at 390px.

## Implementation and evidence

`ProgressiveTaskList` owns the selected expansion independently of the recommendation from
`design-system/first-review-progress.ts`. Continue is an explicit action, located with the current
stage. Closed panels remain mounted and inert. A read-only person is directed to saved evidence,
not editor setup or a human-decision action. Incomplete records do not falsely claim ongoing work.

`ContractReviewSetup` and `TemplateEditor` share `UnsavedChangesGuard`. Local close and route exit
can keep or deliberately discard work; a pending save cannot be described as discarded. A confirmed
preparation navigates normally and never runs a provider. The guard also registers/cleans up the
native unload-prevention signal.

The current [browser entry points](../../test/acceptance/design-workflows/README.md) and
[recorded results](../evidence/first-review.json) verify the listed cases with fictional data. Six
presentation tests cover prerequisites, roles, resuming work, failed/empty results, stale context,
and truthful preparation labels. The fixture's own TypeScript project passes.

## Refresh and recovery

Transient failures while refreshing progress retain the mounted journey and entered instructions, display a
retry notice and disable new preparation until current progress is available. An authoritative
access denial removes the private journey. `snapshot-refresh.ts` defines the narrow retention policy;
an arbitrary error must not be interpreted as permission to retain cached private content.

The opener is “Set up review”; the save action is “Prepare review”. The opener is removed while the
form is visible and receives focus when it reappears after closing. The refresh entry point verifies
503 retention/recovery, disabled stale preparation, 403 removal and absence of a redundant opener.

Six replayed browser functions verify the documented first-review and shared-guard cases. Current
evidence uses isolated production components, not a live authenticated shell, provider, native Word
transformation or representative legal-user task study. Do not generalize it beyond those cases.
