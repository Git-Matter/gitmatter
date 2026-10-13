# Shared contracts for plans 03–05

**Design specification, deepened 2026-10-11.** These are implementation requirements, not claims of
shipped behavior. Status and release evidence remain in each numbered plan.

## Product and implementation boundaries

- Keep **Client → Matter → artifacts** and the document-first design in
  [`../PRODUCT.md`](../PRODUCT.md) and [`../DESIGN.md`](../DESIGN.md). Put actions beside the work;
  avoid a second dashboard or separate agent application.
- UI routes, in-app assistants, MCP tools, and workers call the same legal engine. Reuse document
  versions, tracked edits, tabular reviews, Library, and audit export.
- Put schema-only Zod contracts in `packages/contracts`, runtime policy/orchestration in
  `packages/core`, persistence/migrations in `packages/db`, presentation/transport in `apps/web`.
- Deliver `03` → `04` → `05`. Plan 03 labels process-bound execution honestly until 04 supplies
  durable jobs. Escalation in 03 requests judgment; enforcement arrives in 05. Never display
  “approved” because inference or a background task succeeded.

## Identity, versions, and audit

Every operation carries the full `Actor`, including agent label and token scope. Access is the
intersection of current user permissions, token matter scope, and maximum role. Workers reload
authorization before starting and applying a result; retaining a bare `userId` loses scope.
Intersect the original scheduling scope with current credential/user access; later permission
expansion cannot widen an already accepted job's authority.
Read access inherited from a review does not confer document edit permission. Tenant admin status
does not confer access to every confidential matter.

Persist input versions: matter, document/version, review/run, rule snapshot, playbook commit,
selected clause commit, model identifier, and originating actor. Citations resolve against the
immutable reviewed source even after the current document changes. An approved clause means the
exact version selected was approved; publication must not silently replace it. Seeded items without
a commit use an explicit seed revision and stored snapshot, not an invented commit id.

Artifact, proposal-lifecycle, decision, and policy mutations go through `recordCommit`. Proposal
fields have distinct diff paths from approved content so folding history cannot treat an unapproved
proposal as accepted text. Human approval applies content as the human actor, retaining original
agent/proposal attribution. Rejection records a lifecycle commit and leaves approved content
unchanged. Zero-content-change lifecycle commits are deliberate.

Current `recordCommit` owns its transaction and takes an artifact advisory lock. Plan 04 adds
transaction composition preserving those guarantees; wrapping it in another transaction is
insufficient. Multi-artifact decisions acquire locks in a stable order. Required audit evidence
commits synchronously with the mutation. The buffered, best-effort security-event writer and optional
analytics sink cannot be the sole evidence of approval or completion.

## Proposed command envelope

Mutations accept an opaque `requestId` and relevant expected head, source version, or proposal
revision. Store a canonical input fingerprint and result reference. Same authorized actor, scope,
command, request id, and fingerprint returns the original result; key reuse with different input
is a conflict. Replayed reads still check current access. A content hash is not authorization and
is excluded from analytics.

Responses distinguish `applied`, `proposed`, and `queued`, with artifact/commit/proposal/job ids and
state revision. Queued does not mean inference succeeded. Typed failures include `access_denied`,
`stale_source`, `stale_proposal`, `policy_changed`, `ambiguous_match`, `input_not_ready`,
`provider_unavailable`, and `limit_reached`. HTTP/MCP adapters give safe recovery actions without
exposing hidden matter names, text, keys, provider payloads, or stack traces.

Names in these plans are proposed. Reconcile with the registry and generated MCP reference during
implementation; avoid alternate operations that bypass policy or permissions.

## Presentation and accessibility

- Preserve current typography, palette, components, and hierarchy. Document/finding/diff is primary;
  provenance, job detail, and history expand on demand.
- Show risk, execution, and approval separately, using text/icons as well as color. “No clause
  found” and “Review failed” have different meanings and recovery actions.
- On desktop, keep the document beside findings or the decision diff. On narrow screens, use an
  explicit Document / Findings or Proposal / Source switch, retaining selection and focus.
- Make dialogs, citations, filters, and decisions keyboard accessible. Announce meaningful progress
  and validation, not every token. Keep results available after failure or disconnection. Show
  timezone on dates; let long clause text expand.
- Confirm applying/rejecting a batch and policy changes. Reading, filtering, and safe retry need
  no extra confirmation.

## Evidence and measurements

Extend plan 02's allowlisted funnel contract only for an implemented flow. Use opaque ids and
counters; exclude text, legal positions, notes, clause bodies, client names, keys, and provider
responses. Link logical run/job/proposal ids and distinguish attempts from user journeys. A click
or opened modal is not evidence of approval or successful export.

Define denominators before charts: authorized runs accepted by the server; terminal runs with
every required cell terminal, split by succeeded/partial/failed/cancelled; findings opened;
proposals durably created; human decisions committed;
successful output generation and download delivery separately. Retries retain logical run ids;
changed inputs create a new run; duplicate deliveries deduplicate. Analytics failure cannot fail
an already committed legal operation.

Each plan supplies core/DB tests, authenticated browser scenarios, scoped MCP parity, and relevant
failure injection. Run `vp check`, `vp run typecheck`, and `vp test`; regenerate migrations for actual
schema changes. Record local, staging, Word/provider, pilot, and production evidence separately
under [`evidence/`](evidence/). Written scenarios do not prove they passed.
