# Human approval and agent review queue (M3)

Make agent-assisted work acceptable under firm supervision: a configurable matter approval policy,
append-only commit approvals, and one Agent activity queue per matter.

**Status: In progress** (verified 2026-09-16).

Accepting or rejecting document edits is already human-only — `resolveEdits` refuses
`actor.type === "agent"` (`packages/core/src/content/documents.ts`). The configurable policy,
append-only approvals, and Agent activity queue are not started.

## Purpose

Make agent-assisted work acceptable under firm supervision.

## Work

- Add matter approval policy with separate controls for:
  - agent-proposed document edits;
  - red/yellow playbook findings;
  - tabular-cell writes;
  - workflow/playbook changes;
  - exports above a configured cost or document count.
- Implement append-only commit approvals: approver, decision, note, timestamp, target commit, and
  policy applied. Approval never rewrites prior history.
- Add one **Agent activity** queue inside each matter containing pending document edits, proposed
  review cells, workflow proposals, and escalations.
- Permit batch approval only when items share the same decision context. Preserve individual audit
  entries and source citations.
- Keep approval human-only by default. Agents may list pending work but cannot approve their own
  work.
- Show pending/approved/rejected state in document, review, history, and export surfaces.

Use the approval-gate and action-review-queue architecture in [`../PLANS.md`](../PLANS.md). Avoid
artifact branches until approval workflow proves branches are necessary.

## Exit gate

- Under `approval required`, agent mutations cannot change approved matter state before a human
  decision.
- Approver identity and note appear in history, `show_commit`, and audit export.
- Rejecting a proposal leaves approved state unchanged.
- Access tests cover viewer/editor/owner, tenant admin, matter-scoped token, and out-of-scope token.

## Code areas

- Commit and access core, matter policy schema, document/tabular/workflow mutation paths, audit
  tools, and matter activity UI.

## Related plans

- **Enforces** the escalation state introduced by
  [`03-review-to-redline-loop.md`](03-review-to-redline-loop.md).
- Approval-gate and action-review-queue architecture: [`../PLANS.md`](../PLANS.md).
