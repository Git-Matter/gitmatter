# Operational controls and pilot integrations (M5)

Give firm administrators enough control to permit sustained use: cost estimates before a run, hard
spend caps, admin usage reporting, notifications, and integrations chosen from pilot evidence.

**Status: Planned** (verified 2026-09-16).

Per-matter usage is metered (`usage_events.matterId`, `GET /api/matters/:id/usage`), but budgets only
warn and log; they do not stop spend.

## Purpose

Give firm administrators enough control to permit sustained use.

## Work

- Add pre-run cost estimate for bulk review: document count/size, number of rules/cells, selected
  model, estimated token range, and configured limit.
- Add tenant, user, matter, MCP-token, and single-run hard caps. Fail before starting when estimated
  cost exceeds policy; stop safely at cell/job boundaries if actual use crosses a hard cap.
- Add admin usage view grouped by matter, user/agent, model/provider, and day; retain CSV export.
- Add email notifications for failed jobs, pending approvals, completed bulk work, budget threshold,
  and repeated agent authentication failures. Use digests where event volume can spike.
- Select integrations from pilot evidence. First candidates:
  - Microsoft Word round-trip quality and naming conventions;
  - SharePoint/OneDrive or a target firm's DMS import/export;
  - email intake and completion notification.
- Do not build a broad integration marketplace before one pilot integration has repeated weekly use.

## Exit gate

- Admin can predict, cap, attribute, and export spend for a matter.
- Over-limit job does not leave partial mutations presented as completed work.
- Notification contains identifiers and safe status only, never document content.
- At least one pilot-selected integration completes its real workflow end to end.

## Code areas

- Usage core/schema, provider catalog pricing, admin settings and reporting, and email.

## Related plans

- **Depends on** [`04-durable-background-work.md`](04-durable-background-work.md) for the job
  boundaries that hard caps stop at, and on
  [`05-approval-and-agent-queue.md`](05-approval-and-agent-queue.md) for pending-approval
  notifications.
- Integration candidates and their evidence bar:
  [`08-pilot-program-and-release-proof.md`](08-pilot-program-and-release-proof.md).
