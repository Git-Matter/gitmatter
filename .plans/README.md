# Product plans

Working plans for features and product-readiness work. A plan describes intended work; it does not
mean the feature is implemented, browser-verified, deployed, or used by a real firm.

Plans are split by concern, one concern per file.
[`08-pilot-program-and-release-proof.md`](08-pilot-program-and-release-proof.md) holds the shared
product framing, current baseline, pilot program, measures, and release-proof tiers; the other plans
link to it instead of repeating it. [`roadmap/README.md`](roadmap/README.md) is the epic that tracks
which plans are done, in progress, or planned.

## Plans

- [`01-mfa-better-auth.md`](01-mfa-better-auth.md) — opt-in TOTP and backup-code MFA.
- [`02-establish-product-truth.md`](02-establish-product-truth.md) — sanitized NDA fixture pack,
  browser acceptance script, generated MCP reference, and funnel instrumentation.
- [`03-review-to-redline-loop.md`](03-review-to-redline-loop.md) — the first complete legal outcome:
  upload to cited review to approved-clause tracked change to export.
- [`04-durable-background-work.md`](04-durable-background-work.md) — database-backed job/outbox so
  restarts and provider failures do not lose work.
- [`05-approval-and-agent-queue.md`](05-approval-and-agent-queue.md) — matter approval policy,
  append-only commit approvals, and one Agent activity queue.
- [`06-matter-workspace-and-search.md`](06-matter-workspace-and-search.md) — job-led matter page and
  permission-filtered Postgres full-text search.
- [`07-operational-controls.md`](07-operational-controls.md) — cost estimates, hard caps, admin usage
  reporting, notifications, and pilot-chosen integrations.
- [`08-pilot-program-and-release-proof.md`](08-pilot-program-and-release-proof.md) — shared framing
  and the evidence tiers every plan must satisfy.

Plan status lives in each plan's own status banner and in [`roadmap/README.md`](roadmap/README.md).

[`mvp-delivery.md`](mvp-delivery.md) records the coordinated NDA MVP acceptance contract,
engineering ownership and promotion gates.

## Accepted product research

[Product priorities](research/2026-10-14-product-priorities.md) compare buyer evidence and current
source gaps. [Review setup and Word intake](review-setup-and-word-intake.md) is the coordinated
implementation of review instructions, guided first review and incoming Word inspection accepted
on 2026-10-14. [Source and local proof](evidence/2026-10-14-review-setup-and-word-intake.md) is recorded
separately from authenticated staging, Word and pilot proof. Named handoff and partner/client briefs
are planned follow-ups in the existing plans.

[Local runtime checks on 2026-10-15](evidence/2026-10-15-review-workflow-signoff.md) add actual account
and guide interactions, metered provider cases and native Word save/reopen/re-import proof. They also
found and corrected unsupported citation-page claims. Staging and broader pilot/release gates remain
separate. The [2026-10-18 follow-up](evidence/2026-10-18-final-visual-and-staging-verification.md)
closes the local visual recheck. Staging's served frontend still lacks these features despite a
successful image-build/deployment-trigger workflow; staging acceptance remains open.

## Delivery order

`02` → `03` → `04` → `05` → `06` → `07`, matching the `(M0)`–`(M5)` labels in the plan titles.
Earlier plans supply what later ones assume: `02` provides the fixture pack and acceptance harness,
`04` provides the durable jobs that cost caps and notifications act on, and `05` turns `03`'s
escalation state into an approval policy. `01` runs alongside when a pilot or security review requires
it.

## Supporting architecture

Plans 03–05 were deepened on 2026-10-11 with user journeys, state models, proposed data/core
contracts, permission/audit rules, failure handling, delivery slices, and acceptance scenarios.
[`workflow-contracts.md`](workflow-contracts.md) defines their shared version, actor, transaction,
presentation, and measurement requirements. This specification work did not change release status.
Source implementation through 2026-10-13 is recorded separately in plans 03–07, the roadmap and
[`mvp-delivery.md`](mvp-delivery.md). The connected workspace, approval, recovery, search and spending
controls remain distinct from authenticated acceptance, provider/Word quality and release proof.
The dated 2026-10-12 evidence is historical; final checks for the current increment are recorded
separately. No plan closes a release gate merely by passing module tests.

[`evidence/2026-09-13-subscription-agent.md`](evidence/2026-09-13-subscription-agent.md) records the
implemented subscription-agent workflow, local validation and staging deployment blockers. The
implementation was merged through [PR #10](https://github.com/Git-Matter/gitmatter/pull/10).
The NDA MVP implementation was merged into `dev` through
[PR #12](https://github.com/Git-Matter/gitmatter/pull/12) on 2026-10-13 after current-head CI passed.
[The current implementation record](evidence/2026-10-13-mvp-implementation.md) captures local checks;
staging and authenticated acceptance remain separate gates.

[`../PLANS.md`](../PLANS.md) contains the deeper candidate-feature designs for the audit spine,
approval gates, agent review queue, search, notifications, and branching. Use those sections as
architecture input. These plans decide product order and release gates; the detailed 03–05 contracts
take precedence where the older candidate approval designs differ.

## Status language

- **Planned** — written here only.
- **In progress** — partly implemented in source, not complete.
- **Done** — implemented and covered by focused checks.
- **Runtime-verified** — exercised against the running local or staging stack.
- **Pilot-verified** — completed by a real user with representative documents.
- **Released** — deployed and verified in the intended production environment.
