# Product plans

Working plans for features and product-readiness work. A plan describes intended work; it does not
mean the feature is implemented, browser-verified, deployed, or used by a real firm.

## Active sequence

1. [`02-real-usage-roadmap.md`](02-real-usage-roadmap.md) — product roadmap for turning the current
   feature set into one reliable, pilot-ready legal workflow.
2. [`01-mfa-better-auth.md`](01-mfa-better-auth.md) — security plan for opt-in TOTP and backup-code
   MFA. Schedule alongside the roadmap when a pilot or security review requires it.

## Supporting architecture

[`../PLANS.md`](../PLANS.md) contains the deeper candidate-feature designs for the audit spine,
approval gates, agent review queue, search, notifications, and branching. Use those sections as
architecture input. The real-usage roadmap decides product order and release gates.

## Status language

- **Planned** — written here only.
- **Implemented** — present in source and covered by focused checks.
- **Runtime-verified** — exercised against the running local or staging stack.
- **Pilot-verified** — completed by a real user with representative documents.
- **Released** — deployed and verified in the intended production environment.
