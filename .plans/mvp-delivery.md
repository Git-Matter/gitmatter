# NDA MVP delivery

Coordinated implementation started 2026-10-13 on `feat/native-agent-workflow`.
[PR #12](https://github.com/Git-Matter/gitmatter/pull/12) merged into `dev` at `ba161318`
after current-head CI passed for `26b729dc`.

## Acceptance contract

The MVP is one complete third-party NDA workflow, as defined in
[the program framing](08-pilot-program-and-release-proof.md). A person uploads an NDA. A person or
a matter-scoped subscription agent can read it, prepare an approved playbook review, save cited
findings, propose changes using approved firm language, and leave exact work for a person to
approve. The person can resolve findings, download the tracked draft or guarded clean result,
inspect a reproducible review report and audit, and return after a disconnect.

All accepted legal mutations use the audit spine. Pending proposals are separate from accepted
content. The approved document baseline must remain independent of the tracked draft. Every
download names its actual document version and approval state. Failed/partial work and uncertain
provider usage stay visible. Search and jobs obey current matter, tenant, and token scope.

## Engineering ownership

| Workstream                 | Responsibility                                                                        | Integration boundary                                                         |
| -------------------------- | ------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------- |
| Review and workspace       | Responsive document/findings view, report manifest, retry UX, matter overview         | Existing authorized review/document/job/proposal APIs                        |
| Approval and audit         | Workflow proposals, human owner/editor policy, approved baseline, batch UI            | Exact content/source/policy revisions, transactional `recordCommit`          |
| Reliability and controls   | CI storage service, durable recovery, provider capacity, reservations, admin controls | Shared DB jobs and operational policy, safe errors and no sensitive payloads |
| Integration and acceptance | MCP parity, admin UI, migrations, checks, independent review, PR/branch state         | One integrated revision verified before promotion                            |

Agents share one checkout with explicit file ownership. Migration generation, full-suite checks,
commits and remote publication are coordinated centrally. After implementation, agents switch
workstreams for independent review of authorization, races and failure behavior.

## Current implementation (2026-10-13)

The connected NDA source path is in `dev`. Integrated repository checks and PR CI passed.
Authenticated and staging acceptance remain pending; this is source readiness, not release sign-off.

- Responsive captured-source/findings workspace, quotation highlighting, approved-language preview,
  failed-rule retry with explicit acknowledgement of uncertain paid outcomes, completion status,
  review report and its version/provenance manifest.
- Staged cell and matter-workflow proposals, editor/owner human decisions, compatible atomic cell
  batches, document owner policy and separate accepted baseline, and exact single-DOCX clean-export
  approval. That export makes no model call; it does not implement a bulk-export cost ceiling.
- Durable extraction and bulk-review jobs, scoped MCP job reads/cancellation/retry, replayable
  terminal-event inbox, provider capacity, spend reservations across existing application buffered
  and streaming LLM paths, tenant-admin controls and attributed usage CSV.
- Immutable object write intents with quota reservation and fenced unpublished-object cleanup;
  audited document creation/upload publication; stale source/rule/cell guards; paid worker expiry
  stops for explicit retry instead of silently buying another inference.
- Job-led matter overview with pending proposals, failed/active jobs, recent reviews, escalations
  and spend, plus permission-filtered full-text retrieval. Overview coverage is bounded and labelled;
  it is not a complete aggregation of every historical review.

The [synthetic UI fixture](../test/acceptance/mvp-ui-fixture/README.md) mounts production components
with authored responses and no authenticated session. Its interactions are separate from actual
application mutations, provider output and Word transformation. Prior dated evidence records remain
historical; the coordinator records final checks and current-head CI separately.

## Proof and promotion gates

- **Source:** complete usable NDA path; no unimplemented approval control exposed; focused
  transaction, scope, stale-source, retry, cancellation, report and export tests.
- **Repository:** `vp check`, `vp run typecheck`, `vp test`, web build, generated MCP and NDA drift
  checks, migration drift, clean diff, and CI for the current PR head.
- **Local runtime:** real Postgres/object-storage integration and separate browser journey.
  Authored synthetic findings establish workflow behavior; they do not measure model quality.
- **Staging:** exact deployed revision, migrations, browser/MCP journey, restart/reconnect and
  permission revocation proof. Existing health checks do not establish the deployed revision.
- **Human/provider:** representative provider findings and redlines, Microsoft Word round-trip,
  and legal reviewer acceptance recorded separately in the pilot template.

The repository's required `aws-secrets-manager` skill was located in the official AWS toolkit and
loaded on 2026-10-13. The user authorized `aws login`; AWS session refresh awaits the browser
sign-in. No reusable staging account has been created or stored. Account setup still requires
successful runtime secret resolution. Credential values must never enter chat, logs or source.
Independent implementation, deterministic checks and explicitly labelled synthetic UI fixtures
continue.

## Scope after the first NDA MVP

Broader plan exit gates remain tracked in their original plans: large-export scheduling and bulk
approval ceilings, email/digest delivery, reconciliation of uncertain charges against provider
records, representative fault/load evidence and a pilot-selected external integration. Existing
application LLM admission and the in-app job inbox are implemented; live provider billing and
external notification delivery remain separate proof. A source-ready MVP, a staging-ready MVP and
a legally accepted production workflow are separate milestones.

## Integrated verification

The [2026-10-13 implementation record](evidence/2026-10-13-mvp-implementation.md) captures source
coverage, all 282 passing tests in 54 files, required checks, local migrations and the isolated
browser interaction evidence. PR-head CI passed. The
[integration and staging record](evidence/2026-10-14-dev-integration-and-staging.md) confirms the
merge and fresh server pull failures: staging still runs older revisions because private GHCR
authentication was denied. Authenticated acceptance remains open.
