# Team implementation: source and local evidence

Date: 2026-10-12 (Australia/Sydney). Branch: `feat/native-agent-workflow`, draft PR #10.
This is a development increment across the numbered plans, not sign-off that any plan is complete.

## Delivered slices

- **02:** retained the synthetic NDA acceptance baseline and generated MCP reference; extended
  integration coverage as the connected review, job and policy paths were implemented. Authored
  fixture answers remain separate from provider quality. Live analytics delivery remains unverified.
- **03:** immutable document/playbook/clause snapshots, explicit finding outcomes and quote checks,
  audited dispositions, exact source/clause-bound tracked proposals, anchored missing-clause
  insertion, request replay, completion and clean-export gates. Matter setup and finding actions
  are connected. Reviewed-version downloads/captured text are distinguished from the current draft.
- **04:** Postgres-owned extraction and bulk-review cell work, fenced leases, capacity reservation,
  atomic commit/checkpoint/receipt publication, retry/cancel/reconnect, immutable replacement keys,
  current membership/scope checks and authorized legacy retry. SDK automatic retries are disabled
  inside durable provider attempts so dispatch belongs to the job engine.
- **05:** audited cell/finding policy, typed staged cells, immutable exact human decisions,
  actor-bound request receipts, compatible atomic batches, activity queue/settings, and firm
  playbook publication guards. Transaction-bound access reads avoid borrowing a second pool
  connection; the regression includes twenty simultaneous decisions.
- **06:** indexed full-text retrieval for documents, accepted cells, clauses, playbooks and matter
  metadata. Authorization is applied before ranking/count/pagination; contextual Library reads
  preserve token scope and client/tenant boundaries. Search/fetch and exact artifact links are shared.
- **07:** indicative bulk estimates and serialized dispatch reservations. Token boundaries cover
  durable-review tenant/user/matter/token/run scopes; dollar controls cover priced durable reviews,
  not every application path. Known usage deduplicates; uncertain paid attempts remain visible/held.
- **08:** a pilot/quality/Word/repeat-use record template was added. No human pilot, customer metric,
  integration use, production deployment or compliance claim follows from that template.

The audit spine now supports transaction composition and audited matter policy. CSV export includes
complete field values, commit ids and provenance metadata; DOCX identifies its abbreviated values
and the corresponding commits. Required evidence is committed with the legal mutation, rather than
depending on buffered security logs or optional analytics.

## Local proof

- `vp test`: **44 files, 231 tests passed**, including actual Postgres/object-storage DOCX and MCP
  fixture journeys. Provider retry forwarding and spend/failure responses use deterministic mocks;
  no live model quality or actual billing behavior is established.
- `vp run typecheck`: six workspace tasks passed.
- Migrations `0011`–`0013` were generated, reviewed and applied to the local stack; generation
  subsequently reported no schema changes. New tables preserve legacy direct cell behavior until
  a matter enables the supported gate; no historical approvals were fabricated.
- Regression coverage includes stale/tampered proposal bindings, conflicting request reuse,
  concurrent decisions, atomic batch failure, scope/role denials, membership drift, late-worker
  fencing, duplicate delivery, legal/checkpoint rollback and uncertain usage.
- Real DOCX fixtures cover two non-overlapping redlines plus absence insertion, rejected proposals
  requiring a later decision, and an editor's acceptance leaving an owner-gated escalation open.
- The coordinator also runs format/lint, generated-reference/fixture drift checks, the web build,
  and local health/readiness before the final commit. Their final outcome is recorded below.

## Remaining gates

Plans 03–07 remain **In progress**. Each plan lists its remaining source work separately from its
release proof: full responsive review/report UX; large export jobs/outbox/storage reclamation;
workflow proposals/approved document baselines/export authorizations; the complete matter overview;
application-wide spending controls, admin reporting and notifications; and a pilot-selected
integration. These settings/features are not labelled as enforced or shipped merely because the
foundation exists.

Fresh MFA enrollment/recovery and credential-dependent browser/staging/provider checks were not
executed. `AGENTS.md` requires the `aws-secrets-manager` skill for credential work, and no matching
skill was available in the configured roots/cache. Historical local MFA proof remains historical.
Authenticated browser/mobile/keyboard, staging fault injection, actual Word round-trip, live provider
quality, pilot and production proof remain open. No external notifications were sent.

Detailed job/control evidence: [durable work and controls](2026-10-12-durable-work-and-controls.md).
Pilot record: [acceptance template](../../test/acceptance/pilot-review.md).

## Coordinator verification

- `vp check`: formatting, lint and type-aware checks passed without warnings.
- `vp run typecheck`: all six tasks passed.
- `vp test`: 44 files, 231 tests passed after integration fixes, including controlled SDK retries.
- `vp run docs:tools:check` and `vp run fixtures:nda:check`: passed.
- `vp run build --filter=web`: passed; bundle-size and ineffective dynamic-import warnings remain.
- `vp run --filter=@workspace/db generate`: no further schema changes after local migrations.
- `git diff --check` and local planning/acceptance link targets: passed.
- Local web development restored on port 4280; `/api/health/ready` returned
  `{"ok":true,"checks":{"db":"up"}}`. This public readiness check does not prove authenticated UX.
