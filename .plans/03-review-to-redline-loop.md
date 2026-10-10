# Close the review-to-redline loop (M1)

Deliver the first complete legal outcome: open a matter, run the firm's approved playbook on a
third-party NDA, read cited findings, turn a finding into a tracked change using the firm's approved
clause or fallback, and export a defensible redline with its audit trail.

**Status: Planned** (verified 2026-09-16).

The subscription-agent handoff exists (a matter "review with your own AI" entry point, cited cells,
proposed tracked edits), but no matter-level Review contract action or finding-to-redline path exists
yet.

## Purpose

Deliver the first complete legal outcome.

## Work

- Add a matter-level **Review contract** action. Ask for documents, approved playbook, model, and
  optional client position; create/run the review underneath.
- On each playbook finding, show source citation, matched playbook rule, severity, standard
  position, available fallbacks, and guidance.
- Add **Propose redline** from a finding. Resolve an approved clause/fallback, create the tracked
  DOCX edit through the normal commit path, and record clause id, clause version/commit, playbook
  rule id, source finding, and acting user/agent in commit metadata.
- Add **Escalate** for findings needing partner judgment.
  [`05-approval-and-agent-queue.md`](05-approval-and-agent-queue.md) supplies enforcement; until then
  escalation is visible workflow state and cannot masquerade as approval.
- Provide one review completion view: unresolved findings, pending tracked changes, rejected
  findings, escalations, export readiness, and audit-export action.
- Make generated output clearly distinguish a review report from the source/redlined document.

Reuse the phase-3 clause/playbook design in [`../PLANS.md`](../PLANS.md); do not create a parallel
redline engine.

## Exit gate

- NDA fixture completes from upload to downloadable tracked-change DOCX and audit export.
- Every generated finding has a source citation or an explicit `not found` outcome.
- Every proposed redline identifies the approved clause/fallback version used.
- No redline mutation bypasses `recordCommit()`.
- Web UI and a scoped MCP agent produce equivalent attributable history.

## Code areas

- `packages/core/src/ai/tabular/`, `packages/core/src/content/clauses.ts`,
  `packages/core/src/content/documents.ts`, `packages/core/src/tools/`.
- Matter, review, and document UI.

## Related plans

- **Depends on** [`02-establish-product-truth.md`](02-establish-product-truth.md) for the NDA fixture
  pack and browser acceptance script.
- **Escalation enforcement** arrives with
  [`05-approval-and-agent-queue.md`](05-approval-and-agent-queue.md).
- Phase-3 clause/playbook architecture: [`../PLANS.md`](../PLANS.md).
