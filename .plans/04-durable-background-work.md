# Durable background work (M2)

Move extraction, bulk review, playbook execution, and large exports onto a database-backed job/outbox
and worker loop so deploys, restarts, provider failures, or closed tabs cannot lose accepted work.

**Status: In progress** (source/local slices reviewed 2026-10-12; release gates open).

The prior extraction baseline used an in-memory per-user chain in
`packages/core/src/content/extractionQueue.ts`. A restart can leave work needing manual retry.
Durable extraction now replaces that ownership model; broader work remains below. Apply the
[shared contracts](workflow-contracts.md), especially transaction composition and actor scope.

## Implementation progress (2026-10-12)

- **Implemented source/local slices:** accepted extraction and bulk-review cell work in Postgres;
  leases/heartbeats/fencing; atomic audit commit + checkpoint/receipt; current actor/membership checks;
  idempotent submissions; retry/cancel/status endpoints; reconnectable bulk progress; token/spend
  reservations before provider dispatch. Paid outcomes without known usage remain explicitly uncertain.
- **Remaining source:** large-export jobs, provider-specific concurrency, durable outbox delivery,
  staged-object reservation/reclamation, and broader operational recovery tooling.
- **Proof still open:** deployment restart/kill tests, staging reconnect and provider fault behavior,
  representative load, and production operation. Local DB tests are separate evidence.

## Product behavior

A lawyer can start a review, leave the page, and return to the same completed or partial work.
Operations staff can diagnose a stuck job without seeing document text, credentials, or raw provider
responses. The durable job is the source of truth; SSE only delivers updates.

Keep progress beside its artifact, with stage, completed/total items, safe explanation, and last
update. Use determinate counts where known and a stage label where unknown; do not invent percentages
or ETAs. Expand “Details” for attempts and recovery. No separate task dashboard in this slice.

| Visible state    | Product copy/action                                     | Persisted behavior                                     |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------ |
| Queued           | “Waiting to start”; Cancel                              | Accepted work exists even if no worker is available    |
| Running          | Current stage and completed count; Request cancellation | Disconnect does not cancel work                        |
| Waiting to retry | Reason and next retry time; Cancel                      | Queued with persisted next-attempt time                |
| Succeeded        | Link to result                                          | Required outputs and result references committed       |
| Failed           | Safe reason; Retry when permitted                       | Partial outputs remain visible                         |
| Cancelled        | Completed count and retained-result links               | No new work starts; committed outputs remain           |
| Recovering       | “Resuming after interruption”                           | An expired lease is reclaimed with a new fencing token |

“Retry” resumes unfinished units against the original input snapshot. “Run again” creates a new
logical job and explains that completed units may incur new cost. Cancellation acknowledges a
request immediately but becomes terminal only at a safe checkpoint. Revoked access stops visible
updates; workers must also stop applying results.

## Scope and work units

Cover document extraction, review cells, playbook execution, and large exports. A parent review job
has deterministic child units keyed by document version + rule/cell + run snapshot. Small exports
may stay synchronous through the same version/permission contract; define the threshold using pilot
measurements, not an invented universal size limit. Job transport must not introduce a second
implementation of extraction or review.

Keep `queued`, `running`, `succeeded`, `failed`, `cancelled` as durable job states. Waiting/recovering
are derived UI labels. Children record success, failure, cancellation, or skipped work. Aggregate
counts describe partial results; a failed/cancelled parent must never erase succeeded children.
A parent succeeds only when every required unit and output publication has succeeded.

## Proposed persistence

- **jobs:** id, kind/schema version, tenant/matter/artifact references, initiating actor and token
  credential reference (never credential value), immutable input snapshot reference, request id,
  canonical input fingerprint, state/revision, priority, attempt count/limit, next-attempt time,
  lease owner/epoch/expiry, heartbeat, cancellation-request time, progress counts, safe error code,
  result reference, timestamps. Uniqueness covers authorized request identity and command kind.
- **job_units/checkpoints:** job id, logical unit key, input revision, state, result/commit/version
  references and timestamps. Unique job + logical unit; retry attempt is not part of mutation identity.
- **job_attempts:** lease epoch, provider/model, timing, sanitized outcome, retry decision. No raw
  provider body, document content, API key, bearer token, or signed storage URL.
- **operation receipts/outbox:** unique logical operation key and committed result; durable
  dispatch/publication records with dedupe keys. They make mutation/result publication replayable.
- **usage dedupe:** link a usage row to a known provider completion/attempt identity. Replaying the
  same recorded completion cannot duplicate usage; an actual second provider call has its own cost.

Inputs live in domain snapshots or private object storage, not an unstructured job log. Index due
queued work, expired leases, tenant concurrency, artifact lookup, and request receipts. Specify
retention for operational attempt detail separately from retained legal commits and provenance.
Deleting a job cannot delete evidence referenced by an artifact or approval.

## Worker and transaction contract

1. **Accept atomically.** In one DB transaction, verify access, persist the input snapshot/job and
   any initiating artifact commit, plus outbox/receipt. Return `queued` only after commit. Upload
   bytes may be staged first; do not accept a job referencing unavailable input. Client disconnect
   after commit can recover the original job by request id.
2. **Claim bounded work.** Select eligible jobs with DB row locking/`SKIP LOCKED`, tenant/user limits,
   and per-provider limits. Reserve concurrency capacity atomically under capacity-row/advisory
   locks; a count query alone can race across workers. Release reservations on terminal state or
   lease reclamation. Increment lease epoch when claiming. Use DB time for expiry. Proposed
   initial lease is 30 seconds with 10-second heartbeat, configurable and verified under slow calls.
   Maintain tenant fairness; one firm's large review cannot monopolize every worker.
3. **Execute outside a DB transaction.** Refresh permission/token revocation, validate input revision,
   call the existing engine, and heartbeat while waiting. Never hold an artifact lock during an
   external provider or object-storage call. A failed heartbeat stops further dispatch/apply work.
4. **Apply atomically.** Lock the job/checkpoint, verify live lease epoch/expiry and cancellation,
   recheck access and expected artifact inputs, and acquire artifact locks in stable order. In one
   transaction, record artifact mutation, commit/diff, operation receipt, unit result, usage for
   known completion, progress revision, and required outbox event. Use a composable `recordCommit`
   implementation; no separate transaction can leave the checkpoint ahead of the artifact.
5. **Publish and finish.** Deliver outbox messages at least once with dedupe. Mark success only after
   required durable result references exist. A crash after apply but before acknowledgement replays
   the receipt; it does not regenerate content. Reclaim expired leases with a new epoch so the old
   worker cannot commit a late response.

Exactly-once observable artifact mutation is the target. Provider execution remains potentially
at least once: a crash after a paid response but before persistence can require another call. Persist
available provider request/completion ids; show uncertain usage honestly rather than claiming zero
cost or duplicating known usage. Do not promise exactly-once billing across an external provider.
Persist known paid attempt usage even when cancellation/access drift prevents applying its result;
this billing record grants no authority to mutate the legal artifact.

## Object storage and exports

Object storage and Postgres do not share a transaction. Stage output under a unique immutable key,
verify bytes/checksum, then publish its version/result reference in the artifact transaction. Track
staging reservations; reclaim only aged objects proven unreferenced after a grace period longer
than valid leases. Cleanup cannot delete objects still used by versions, jobs, or exports.

Export jobs capture document version, audit cutoff, policy revision, and access at acceptance;
recheck current permission/policy before publication and retrieval. A policy/source change cannot
silently switch output input. Where the new policy invalidates authorization, fail safely. Downloads
must use an authorized endpoint with short-lived delivery; logout/revocation blocks obtaining a new
link. Document any remaining validity of previously issued storage links.

## Retry, cancellation, and observability

- Classify retryable timeouts, temporary network/storage faults, rate limits, and provider 5xx.
  Honor bounded `Retry-After`; otherwise use exponential backoff with jitter and persisted schedule.
  Proposed default is three automatic attempts per unfinished unit, with a configured delay cap.
  Invalid input, stale source, access denial, policy denial, and unsupported formats fail immediately.
- Bound attempts, elapsed work, concurrency, and cost where existing caps permit. Plan 07 adds the
  firm's hard budget policy at these boundaries. Manual retry rechecks access, input compatibility,
  limits, and retry eligibility; it never resets receipts or completed units.
- Queued cancellation is atomic. Running cancellation fences new dispatch and checks before apply.
  A unit that committed before cancellation remains committed. An in-flight provider call may still
  incur cost; retain attributable usage. A cancellation request never rewinds legal history.
- Persist safe error categories and recovery state. Log job/unit/attempt ids and aggregate latency;
  exclude sensitive payloads. Alert on aged queue, expired leases, exhausted retries and repeated
  publication failures. Optional notifications are not required for job correctness.
- SSE sends monotonic durable revisions; reconnect/poll returns the current authorized snapshot.
  Discard stale events in the client. Keep provider-token streaming separate from job completion.

## Rollout and ownership

1. Add schema/migrations, typed commands, shared job core and transaction composition; test receipts,
   leases, authorization and storage publication without a live provider.
2. Move extraction first. Enable exactly one scheduler path per task: drain/fence the old in-memory
   queue before turning on durable ownership. Never let both paths extract the same upload.
3. Move review/playbook child units and reconnectable progress. Then add large export workers.
4. Wire worker lifecycle into the supported server deployment: readiness, heartbeat, graceful
   shutdown, lease recovery and observability. A worker embedded in the web process is acceptable
   initially if all correctness state lives in DB and multiple instances are safe.
5. Stage fault-injection tests and monitor queue age before full rollout. Rollback stops new claims
   and retains jobs/results for compatible workers; it cannot discard the new tables or return
   unfinished durable jobs to volatile ownership.

## Acceptance and exit gate

- **Restart before apply:** kill the process during extraction/provider wait; restart. Work resumes
  within lease recovery plus configured polling, or reaches a clear bounded terminal failure.
- **Crash after apply:** kill after the legal transaction but before job acknowledgement; replay.
  One version/cell mutation, commit, usage row for that completion, and durable event exist.
- **Competing workers:** two workers claim the same unit; an expired worker returns late. Only the
  current lease can apply, and global/tenant/provider concurrency never exceeds configured limits.
- **Storage boundaries:** fail upload, DB publication, and outbox delivery separately. No result
  points to absent bytes; staged orphans are reclaimed without removing referenced objects.
- **Provider faults:** deterministic timeout/429/5xx fixtures respect schedules and attempt limits;
  an ambiguous paid completion is distinguished from known usage. Invalid input does not loop.
- **Cancellation:** cancel queued and running jobs. No new units start after the cancellation
  boundary, retained partial results remain visible, and committed history is unchanged.
- **Access drift:** revoke a token/remove membership while work runs; no later result applies.
  Out-of-scope tokens cannot inspect jobs, counts, errors, or results from another matter.
- **Browser/MCP:** reload/close the browser while a review runs; reconnect shows persisted results.
  Duplicate authorized submissions return the same logical job; changed payload with the same
  request id conflicts. UI and MCP expose the same state/error semantics.
- **Migration/operations:** regenerate migrations, pass repository checks, and record local and
  staging crash/recovery evidence. A polling UI alone does not satisfy the durability gate.

## Code areas and dependencies

`packages/db` job/receipt schema, `packages/contracts`, shared `packages/core` jobs/commit modules,
`content/extractionQueue.ts`, tabular runner, exports, and server worker bootstrap/progress adapters.

Uses [02's failure fixtures](02-establish-product-truth.md) and [03's immutable review inputs](03-review-to-redline-loop.md).
Provides safe boundaries for [05's approval rechecks](05-approval-and-agent-queue.md) and
[07's limits/notifications](07-operational-controls.md).
