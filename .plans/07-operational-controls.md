# Operational controls and pilot integrations (M5)

Give firm administrators enough control to permit sustained use: cost estimates before a run, hard
spend caps, admin usage reporting, notifications, and integrations chosen from pilot evidence.

**Status: In progress** (source coverage reviewed 2026-10-13; final integrated checks and release
gates open).

Per-matter usage is metered (`usage_events.matterId`, `GET /api/matters/:id/usage`). Existing application
buffered and streaming LLM calls now share authoritative dispatch admission, capacity and spend
reservations. External subscription-agent provider spend is outside this ledger.

## Implementation progress (2026-10-13)

- **Implemented source:** indicative pre-run bulk estimates; serialized tenant/user/matter/token/run
  token reservations and priced-dollar admission for existing application LLM paths; extraction
  acceptance limit; tenant-admin budget/capacity settings; attributed matter/account/agent/model/day
  reporting and CSV; replayable in-app terminal-job notifications. SDK retries are disabled inside
  admitted calls. Complete known usage settles once, including cache/thinking tokens; incomplete or
  ambiguous paid outcomes remain held. Dollar values are catalog estimates, not provider invoices.
- **Remaining source:** reconciliation of uncertain charges against provider records; email/digest
  notifications for pending approvals, budget thresholds and repeated authentication failures;
  integrations selected from pilot evidence. In-app job delivery does not establish external
  notification delivery.
- **External gates:** representative pricing/provider validation, a pilot-selected integration and its
  authorized end-to-end test, staging/production operation. No email or integration was sent/exercised
  merely by implementing these controls.

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
