# gitmatter design program

The current app revision uses a shared workspace frame, compact interface typography, continuous
settings sections and contextual review/assistant panes. [View the current captures](screenshots.json)
and [the component/layout contract](workflows/product-frame.md). This supersedes the earlier visual
composition rejected by the user.

The goal is a coherent, task-led legal workspace whose design choices are reproducible from explicit
rules, current product facts, and documented evidence. This program supplements the implementation
reference in [DESIGN.md](../DESIGN.md). It preserves the user-preferred rounder geometry: 16px controls,
24px media/dialogs, and 28px cards, with compact-control exceptions.

## Deliverables and completion evidence

| Requirement                    | Owning artifact           | Required evidence                                                                            | Current state                                        |
| ------------------------------ | ------------------------- | -------------------------------------------------------------------------------------------- | ---------------------------------------------------- |
| Deep dive on Harvey            | research/harvey-legora.md | Primary product docs, dated public visual observations, limitations                          | Documented                                           |
| Deep dive on Legora            | research/harvey-legora.md | Current brand vs historic brand, source-linked product flows                                 | Documented                                           |
| Broad anti-slop taxonomy       | research/anti-slop.md     | Visual, content, interaction, state, AI trust, accessibility, performance, governance traits | Documented                                           |
| Design philosophy              | philosophy.md             | Principles with trade-offs and operational decisions                                         | Documented                                           |
| Deterministic design system    | policy.json + tooling     | Single owners, finite choices, executable checks, controlled exceptions                      | Implemented; static gates verified                   |
| Intuitive workflow contracts   | workflows/                | Preconditions, next action, context, recovery, terminal states for each journey              | 5 briefs; task/state walkthroughs verified           |
| Multiple references per screen | research/saas-patterns.md | Screen-by-screen composition and rejected alternatives                                       | Documented                                           |
| Workflow verification          | acceptance.md             | Task walkthroughs, responsive/keyboard checks and evidence limitations                       | Internal replay evidence; formal user study optional |

The [full-objective audit](completion-audit.md) maps every requested deliverable and the twelve
principles to current sources and evidence. The [practitioner task packet](usability-study.md) is
optional follow-up and NOT RUN; it is not a delivery blocker and no observations are fabricated.

## Evidence discipline

Current [app screenshots](screenshots.json) cover review/decision, settings in light/dark/mobile and
the matter assistant. All use production components and the shared app frame with fictional demo
data. These replace the earlier oversized-card composition; no images are retouched or synthesized.

Classify each claim as vendor-documented, directly observed, inferred, or a gitmatter decision.
Public marketing pages are not evidence of private app behavior. Product announcements do not prove
usability, legal accuracy, or comparative superiority. Where a newer help article requires a login,
record that gap and use accessible evidence without implying the private experience was inspected.

Determinism here means the same task, permissions, facts, and viewport lead to the same prescribed
layout, actions, and states. It does not mean model answers or aesthetic judgments are deterministic.

## Progress log

- Initial continuation: inspected the current worktree and existing visual system; confirmed this
  broader goal is not satisfied by the earlier radius and marketing changes.
- Found a material research correction: Legora's current public site uses custom sans typography,
  green pill CTAs, and a motion-led hero. Historical serif-led case studies cannot stand in for its
  current design system. Harvey's newer Harvey II help overview redirects to authentication.

- Foundation implementation: canonical tokens, generated CSS, 9 structural/contrast guard rules,
  CI enforcement, authoring instructions, and 7 guard tests. Initial policy scan found and drove
  repairs to nested login controls, essential field contrast and an arbitrary destructive-card shadow.
- Remaining work: assistant/navigation/settings/authentication briefs and browser audit, followed by
  the final requirement-by-requirement completion audit.

- Verification checkpoint: `vp check`, `vp run typecheck`, 361 tests across 64 files, and cloud
  production build pass. Policy scans 301 authored files and 22 contrast pairs with zero failures.
  The isolated production-component UI fixture is running at `http://127.0.0.1:4286/` for the next
  workflow pass; verify its live endpoint before resuming. The main specimen is at port 4285.

- Progressive-review checkpoint: shared task list, state-aware recommendation, inert retained panels,
  truthful finding status, and shared unsaved-work guards are implemented. Five browser functions,
  six presentation tests, 367 repository tests and the cloud build pass. See the acceptance ledger
  for the remaining background-refresh/opener checks and the other workflow audits.

- Review/output checkpoint: first-review refresh retention and opener clarity now pass. Review drafts
  survive comparison, rejected/pending saves and source inspection. Revised findings expose earlier
  input without treating it as a current decision. Named inspector/document dialogs preserve return
  focus; the manual document form has connected labels and unsaved-input protection. Version-bound
  proposal acceptance/rejection and explicit output approval pass in the fictional API fixture.
  Six first-review and six review/output functions are replayable with source/script hashes. Remaining
  work is listed in the acceptance ledger; this checkpoint is not production or empirical usability proof.

- Template/media checkpoint: a tracked loopback harness verifies current UI/Hono/core with local
  Postgres and original fictional Word files. Two role/lifecycle/stale/recovery functions pass.
  The media inventory covers 19 rendered illustrations; the shared player discloses example data,
  and DG010 rejects unreviewed/changed assets or independent marketing players. Five page families
  pass at desktop/mobile. Relevant evidence lives under `design/evidence`.

- Assistant checkpoint: explicit workflow preparation/start, outcome-aware queues, model/file gates,
  retained follow-up drafts, explicit saved-chat recovery and context validation are implemented.
  Two isolated component/route functions pass; no actual provider, credential or auth operation is
  part of that evidence. The remaining scope is shell/navigation, settings and authentication.

- Settings/access checkpoint: URL-controlled lazy retained tabs, one cross-tab draft guard,
  literal configuration/permission failures, current-revision limits recovery, auth request retry,
  challenge readiness and a named mobile navigation modal are implemented. Three additional browser
  functions pass against actual product components and the Better Auth browser client with fictional
  intercepted requests. See `evidence/access.json`. No real credentials, mail or authentication were
  exercised. Remaining work is action-based shell exits and the final requirement audit.

- Sign-out/audit checkpoint: router navigation now resolves dirty/pending work before ending a
  session; direct URL/hover do not act, failures permit retry and confirmed success reloads login.
  Twenty-one recorded browser functions have current relevant source/script hashes. Format/lint,
  workspace/fixture types, design policy and cloud build pass; 371 tests pass with an explicit
  15-second integration timeout (the default-timeout failure remains documented). The full audit
  initially treated practitioner observations as a dependency. The user removed that extra gate
  in the delivery clarification below. The optional study setup has zero participant tasks executed.

- Delivery clarification: the user removed practitioner research as a blocker. The original research,
  system and workflow scope remains intact; final acceptance uses rendered app review and current
  internal checks. The study packet remains optional, with no empirical usability claim.
