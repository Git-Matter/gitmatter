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

## Delivery order

`02` → `03` → `04` → `05` → `06` → `07`, matching the `(M0)`–`(M5)` labels in the plan titles.
Earlier plans supply what later ones assume: `02` provides the fixture pack and acceptance harness,
`04` provides the durable jobs that cost caps and notifications act on, and `05` turns `03`'s
escalation state into an approval policy. `01` runs alongside when a pilot or security review requires
it.

## Supporting architecture

[`evidence/2026-09-13-subscription-agent.md`](evidence/2026-09-13-subscription-agent.md) records the
implemented subscription-agent workflow, local validation and staging deployment blockers. The
implementation is on branch `feat/native-agent-workflow` (draft PR #10).

[`../PLANS.md`](../PLANS.md) contains the deeper candidate-feature designs for the audit spine,
approval gates, agent review queue, search, notifications, and branching. Use those sections as
architecture input. These plans decide product order and release gates.

## Status language

- **Planned** — written here only.
- **In progress** — partly implemented in source, not complete.
- **Done** — implemented and covered by focused checks.
- **Runtime-verified** — exercised against the running local or staging stack.
- **Pilot-verified** — completed by a real user with representative documents.
- **Released** — deployed and verified in the intended production environment.
