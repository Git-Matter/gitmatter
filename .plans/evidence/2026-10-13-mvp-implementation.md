# NDA MVP: integrated source and local evidence

Date: 2026-10-13 (Australia/Sydney). Branch: `feat/native-agent-workflow`,
[PR #12](https://github.com/Git-Matter/gitmatter/pull/12).
This records the integrated MVP implementation and its local verification. Numbered plan exit
gates remain distinct from source readiness and development-branch integration.

## Delivered behavior

- **Review:** responsive captured-document/findings workspace, verified quotation navigation,
  approved standard/fallback replacement previews, explicit inconclusive and stale-source states,
  failed-rule retry with uncertain-paid-outcome acknowledgement, completion gates, and reproducible
  report/manifest downloads. Report capture uses a consistent read-only database snapshot.
- **Human decisions:** separate accepted document baseline; exact current document, edit and matter
  policy bindings; immutable decisions; typed workflow proposals; compatible atomic cell batches;
  owner/editor queue controls. An exact single-DOCX clean-output request can require approval. Its
  zero incremental model-provider cost is separate from hosting/storage costs and bulk scheduling.
- **Matter workspace:** recent reviews, pending requests, failed/active work, bounded escalations,
  spend, and a replayable terminal-job inbox with per-user read acknowledgement. Permission filtering
  precedes job/event pagination. Bounded overview results identify truncation.
- **Reliability:** provider capacity and tenant-admin controls; shared admission/reservations across
  existing buffered and streaming application LLM calls; token and priced-dollar limits; attributed
  usage and CSV. Cache creation/read and reasoning tokens are included when complete totals exist.
  Incomplete or uncertain paid outcomes remain held. External subscription-agent charges are outside
  this ledger, and catalog dollar estimates are not provider invoices.
- **Publication:** staged immutable storage objects, quota admission and revision-fenced reclamation;
  atomic legal row/version/link/audit publication; current account, membership and credential scope
  checks through dispatch and publication. Paid calls without a legal receipt cannot silently repeat
  after worker loss. Synchronous late results cannot overwrite newer findings, source or rules.
- **MCP:** scoped job status/cancel/retry, event acknowledgement, report and exact export-request
  tools share core enforcement. Governed workflow writes return pending proposals until human apply.
  Trusted credential-reference metadata is server-derived; agents cannot approve their own work.
- **CI:** unavailable legacy MinIO images were replaced with official pinned release binaries and
  verified SHA-256 checksums, preserving real object-storage tests without registry credentials.

## Coordinator verification

- `vp install` completed; `vp env doctor` passed.
- `vp check` passed without warnings, lint or type errors.
- `vp run typecheck` passed all six workspace tasks.
- `vp test` passed **54 files and 282 tests**, including real Postgres/object-storage NDA, DOCX and
  subscription-MCP journeys. Provider/network failure behavior uses deterministic mocks.
- `vp run --filter=web build` passed. Existing bundle-size and ineffective dynamic-import warnings
  remain; these are not suppressed.
- Generated MCP reference and synthetic NDA source drift checks passed.
- Migrations `0014`–`0017` were generated, SQL reviewed and applied locally. Subsequent generation
  reported no schema changes. Accepted-baseline backfill does not invent historical human approval.
- Fixture-specific TypeScript, `git diff --check` and planning/acceptance Markdown targets passed.
- Independent final review checked paid-expiry recovery, complete usage accounting, upload authority
  after storage delay, tracked export routing and synchronous source/cell/token publication fencing.
  Blocking races were repaired with focused regressions before the integrated suite.

## Browser interaction evidence

The [isolated UI fixture](../../test/acceptance/mvp-ui-fixture/README.md) renders production components
with fictional API responses and no authenticated session, environment credentials or provider calls.
Browser checks covered approved replacement previews, source quotation highlighting, inconclusive
and stale-source blocking, explicit failed-rule retry acknowledgement, exact atomic batch/workflow
decisions, clean export availability before/after approval, viewer decision denial, tracked document
decision state and invalid/valid admin limit input. Desktop and 390-pixel mobile layouts fit without
horizontal overflow; the temporary viewport was restored. Synthetic screenshots are local artifacts
under `.scratch/mvp-acceptance-2026-10-13/` and are not release evidence.

The fixture's fixed source DOCX download does not establish actual Word transformation. Real DOCX
engine tests establish local stored-output behavior separately. Neither establishes Word round-trip
or legal reviewer acceptance.

## Remaining acceptance and release gates

Current-head remote CI and exact staging deployment are recorded separately after publication.
Authenticated browser/MFA and staging/MCP journeys, restart/load evidence, actual analytics delivery,
representative provider quality/billing, Microsoft Word round-trip and pilot acceptance remain open.
Broader export scheduling, email/digest notifications, provider charge reconciliation and a pilot-
selected external integration remain outside this first NDA MVP scope.

The required Secrets Manager workflow was located and loaded. The user authorized `aws login`;
its browser sign-in needs the existing AWS credentials. No reusable staging test account has yet
been created or stored. Public staging signup is disabled; it has not been weakened for acceptance.
Credential values never belong in source, evidence, chat, logs or memory.
