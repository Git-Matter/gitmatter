# Durable background work (M2)

Move extraction, bulk review, playbook execution, and large exports onto a database-backed job/outbox
table with a worker loop, so deploys, restarts, provider failures, or closed browser tabs cannot lose
work.

**Status: Planned** (verified 2026-09-16).

Production extraction still uses the in-memory per-user chain in
`packages/core/src/content/extractionQueue.ts`, so a process restart can leave work needing manual
retry.

## Purpose

Prevent deploys, restarts, provider failures, or closed browser tabs from losing work.

## Work

- Replace the in-memory extraction chain with a database-backed job/outbox table and worker loop.
- Represent extraction, bulk review, playbook execution, and large export jobs with durable states:
  `queued`, `running`, `succeeded`, `failed`, `cancelled`.
- Add attempt count, lease/heartbeat, idempotency key, progress, safe error code, timestamps, and
  next retry time. Keep raw provider responses and document content out of job errors.
- Recover expired leases automatically after process restart.
- Make retries idempotent: repeated delivery must not duplicate document versions, cells, commits,
  usage rows, or audit events.
- Decouple browser progress from job ownership. SSE may display progress, but disconnecting must not
  cancel or lose the job.
- Add user controls for retry and cancel where safe; show partial review progress after reload.
- Add bounded concurrency per tenant/user and provider-aware backoff.

## Exit gate

- Kill the web process during extraction and review; restart; both jobs resume or fail safely.
- Repeat the same job delivery; no duplicate artifact mutation appears.
- Provider timeout and rate-limit fixtures produce bounded retries and a clear final state.
- A browser reload reconnects to current progress.

## Code areas

- A new shared job schema and core module.
- The extraction queue, tabular runner, exports, and server worker bootstrap.

## Related plans

- **Enables** the hard caps in [`07-operational-controls.md`](07-operational-controls.md), which stop
  safely at job boundaries.
- **Depends on** [`02-establish-product-truth.md`](02-establish-product-truth.md) for the failure
  fixtures its exit gate needs.
