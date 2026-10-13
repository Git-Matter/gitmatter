# Durable work and operational controls: local source evidence

Date: 2026-10-12 (Australia/Sydney). This records the local implementation slice for plans 04 and 07,
not staging deployment or live-provider sign-off.

## Implemented

- Upload and replacement acceptance publish document versions, audited commits and extraction jobs
  in one Postgres transaction. Initial uploads are now audited. Replacement bytes use unique immutable
  storage keys and reject a stale document head before publication.
- Durable jobs carry the initiating actor, original scope, immutable input references, request
  fingerprint, state/revision, attempt bounds, lease epoch and expiry. Duplicate requests replay;
  changed inputs conflict. JSONB object-key order does not change canonical fingerprints.
- Workers reserve global/tenant/user capacity under a transaction lock and use database time,
  heartbeats, lease fencing and tenant fairness. Legal apply, receipt, checkpoint and terminal
  success share the commit transaction. User, credential metadata and matter membership are locked
  through publication; removed membership and revoked/restricted credentials cannot authorize apply.
- Extraction replaces the volatile queue. Pre-migration failed/pending/stale-processing sources
  require an explicit currently authorized human retry, verified stored bytes and an audited durable
  acceptance; an active legacy process is not reclaimed before its five-minute age guard.
  Corrupt magic bytes fail terminally without a retry loop.
  Cancellation and authorized bounded manual retry retain history and attempts.
- Bulk review accepts per-cell work atomically, snapshots prepared sources for ad-hoc reviews, and
  observes persisted results. Closing the SSE observer does not cancel accepted jobs. Generated
  results are agent-authored and respect approval policy; streaming reads accepted cell values,
  rather than displaying staged proposals as accepted content. Single-cell and row calls remain
  synchronous in this slice.
- Durable provider dispatch reserves estimated capacity atomically. Token controls cover configured
  tenant/user/matter/token/run scopes; extraction occurrences have a separate hard acceptance limit.
  Indicative dollar controls explicitly cover durable reviews. They do not cap every provider path
  in the application or constitute invoice reconciliation. Missing prices fail closed when a dollar
  cap is configured. Known paid attempt usage survives a discarded legal result and deduplicates.
  Uncertain paid attempts retain their reservation and appear in authorized job usage details.
- Durable cell queries disable SDK-internal retries: Anthropic/OpenAI use `maxRetries: 0`,
  Gemini uses one total attempt, and OpenRouter uses retry strategy `none`. Existing synchronous/chat
  callers retain their defaults. Options were verified against the installed SDK types/source and
  no-network adapter tests.
- Confirmed pre-inference 429/connection-establishment faults use bounded persisted retries.
  Timeouts/5xx after dispatch retain uncertain usage and do not automatically spend again.
- Authorized HTTP status/list/queue/estimate/cancel/retry routes share these core contracts.

## Local validation observed

- `vp test packages/core/test/jobs.test.ts packages/core/test/review-jobs.test.ts packages/core/test/nda-acceptance.test.ts`: 14 passed.
- `vp test packages/core/test/document-docx.test.ts packages/core/test/document-upload.test.ts packages/core/test/tabular-write.test.ts packages/core/test/jobs.test.ts packages/core/test/review-jobs.test.ts`: 27 passed.
- `vp test packages/core/test/provider-policy.test.ts packages/core/test/document-upload.test.ts packages/core/test/jobs.test.ts packages/core/test/review-jobs.test.ts`: 21 passed.
- `vp test packages/core/test/provider-retries.test.ts packages/core/test/provider-policy.test.ts packages/core/test/review-jobs.test.ts packages/core/test/jobs.test.ts`: 18 passed.
- Dedicated Postgres fixtures verify expired-worker fencing, completion replay, rollback after legal
  write, queued/running cancellation, scope denial, concurrent capacity reservation, lifetime retry
  bounds, immutable source/request replay, known usage dedupe, membership drift, and a pending red
  proposal preserving an accepted green cell while blocking clean export.
- The NDA/upload suites use configured object storage and real DOCX processing. Review/provider
  answers and usage in durable boundary tests are explicit synthetic values; no live LLM quality,
  provider billing, MFA or pilot outcome is asserted.
- The coordinator owns full-workspace format/lint/typecheck/test/build and migration validation.
  No credentials were retrieved or included in this evidence.

## Remaining release gates

- Staging process-kill/restart and multi-instance fault injection with real provider timing;
  authenticated browser reconnect/cancel/retry and scoped MCP job transport parity.
- Large export jobs, per-provider capacity limits, durable delivery outbox, and staged-object
  reservations/orphan cleanup. Unique keys prevent overwriting prior versions but do not yet prove
  orphan reclamation after failed publication.
- Synchronous single-cell/row/provider chat paths need equivalent spend boundaries before claiming
  application-wide firm hard caps. Pricing/token estimates need provider-specific qualification.
- Admin reporting/configuration, safe notification delivery, and one pilot-selected integration
  remain open. No notifications or external messages were sent.
