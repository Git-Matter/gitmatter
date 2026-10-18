# Epic: real-usage legal workflow

Turn gitmatter's existing feature set into one reliable, pilot-ready legal workflow: a third-party
NDA review that runs from upload to a cited review to an approved-clause tracked change to an exported
redline, with every step attributable whether it was started in the web UI or by a matter-scoped MCP
agent.

This epic tracks progress. It is not a plan itself; each concern has its own plan file.

- Goal, product hierarchy, current baseline, measures, and release-proof tiers:
  [`../08-pilot-program-and-release-proof.md`](../08-pilot-program-and-release-proof.md)
- Plan index and status vocabulary: [`../README.md`](../README.md)
- Status reviewed: 2026-10-13 for current source coverage in 02–07; integrated repository checks passed;
  authenticated/staging gates remain open. Plan 01 retains its historical local proof.
- Specifications deepened: 2026-10-11 for plans 03–05 and their
  [shared contracts](../workflow-contracts.md); no additional implementation or release claim.

## Plan status

Numbers are delivery order, not progress rank — a low number is not further along than a high one.

| Plan                                             | Concern                                                                 | Status                   |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------ |
| [`01`](../01-mfa-better-auth.md)                 | Opt-in TOTP and backup-code MFA                                         | Runtime-verified (local) |
| [`02`](../02-establish-product-truth.md)         | NDA fixture pack, browser acceptance, MCP reference, funnel events      | In progress              |
| [`03`](../03-review-to-redline-loop.md)          | Review contract → cited findings → proposed redline → export            | In progress              |
| [`04`](../04-durable-background-work.md)         | Database-backed job/outbox replacing the in-memory extraction queue     | In progress              |
| [`05`](../05-approval-and-agent-queue.md)        | Matter approval policy, append-only approvals, Agent activity queue     | In progress              |
| [`06`](../06-matter-workspace-and-search.md)     | Job-led matter page and permission-filtered full-text search            | In progress              |
| [`07`](../07-operational-controls.md)            | Cost estimates, hard caps, admin reporting, notifications, integrations | In progress              |
| [`08`](../08-pilot-program-and-release-proof.md) | Shared framing, measures, release-proof tiers                           | Reference                |

## Review setup and Word intake increment

On 2026-10-14, review instructions, guided first review and bounded incoming Word inspection were
implemented and locally checked. They extend plans 02 and 03 under
[the coordinated scope](../review-setup-and-word-intake.md), with
[dated implementation evidence](../evidence/2026-10-14-review-setup-and-word-intake.md).
Named reviewer handoff, a personal work
list, client brief and pilot-selected integration are tracked as later additions to plans 03/05–07.
Source checks and real Word/pilot/release gates remain separate.

The [2026-10-15 local acceptance record](../evidence/2026-10-15-review-workflow-signoff.md) now covers
authenticated guided preparation, bounded live-provider quality and actual Word save/reopen/re-import.
A discovered citation-page defect was corrected with history-preserving projections and regressions.
The [2026-10-18 follow-up](../evidence/2026-10-18-final-visual-and-staging-verification.md) closes the
local citation-label/source-link visual check and verifies Word inspection controls. Staging still
lacks the integrated feature frontend; deployment/runtime, authenticated staging and broader
pilot/release proof remain open. This does not close the numbered plans.

## In progress

### 02 Establish product truth

- **Done:** the MCP tools reference is generated from the runtime catalog with a CI drift check
  (`scripts/generate-mcp-docs.ts` → `docs/api-reference/mcp-tools.mdx`,
  `.github/workflows/ci.yml`).
- **Done:** subscription MCP journeys run in CI against real object storage
  (`apps/web/src/server/mcp/server.test.ts`; MinIO wired into the verify job).
- **Done locally:** synthetic NDA fixture pack and engine integration acceptance; shared
  content-free funnel contracts/runtime allowlist; repeatable browser acceptance script; CI fixture
  source drift check.
- **Implemented source:** isolated UI fixture mounting production review, approval, matter and admin
  components with authored API responses; it creates no authenticated session or actual model output.
- **Remaining:** execute full authenticated browser script locally and on staging, verify actual
  analytics delivery, and record Word/provider/pilot evidence separately.
- **Where:** merged into `dev` through
  [PR #12](https://github.com/Git-Matter/gitmatter/pull/12).

### 03–07 Team implementation

- **03:** immutable review inputs, validated findings, approved-clause redline provenance,
  dispositions, responsive source/findings workspace, failed-rule retry, report/manifest downloads,
  completion/export gates, and connected matter/review actions.
- **04:** durable extraction/bulk-review work, fenced leases, transactional receipts/checkpoints,
  cancellation/retry/reconnect, provider capacity, paid-expiry recovery, durable terminal-event inbox,
  staged-object reservations/reclamation and immutable source checks. Large-export jobs remain open.
- **05:** audited cell/finding/document/workflow policy, staged cells and workflows, exact human
  decisions, separate accepted document baseline, atomic cell batches and selection UI, exact
  single-DOCX export authorization, queue/settings UI, and shared Library publication guards.
- **06:** indexed permission-filtered retrieval, scoped Library context, exact links and matter
  search UI; job-led overview with pending proposals, recent reviews, failed/active work, bounded
  escalations and spend. Representative usability/load and timing analysis remain open.
- **07:** indicative run estimates, admission/reservations across existing application LLM paths,
  tenant-admin budget/capacity controls, attributed usage CSV and in-app job notifications. Actual
  provider billing reconciliation, email/digests and a pilot integration remain open.
- **08:** pilot/quality/Word/repeat-use record template prepared; no real pilot or release claimed.
- Details and precise remaining source/proof gates live in each numbered plan and
  [MVP delivery](../mvp-delivery.md). The
  [2026-10-12 durable-work evidence](../evidence/2026-10-12-durable-work-and-controls.md) records the
  earlier increment; it does not prove the current head.

### 05 Approval and agent queue

- **Done:** accepting or rejecting document edits is human-only — `resolveEdits` refuses
  `actor.type === "agent"` (`packages/core/src/content/documents.ts`).
- **Implemented source:** audited cell/finding/document/workflow policy; immutable decisions;
  workflow proposals; accepted document baseline and owner gate; exact single-DOCX export approvals;
  compatible batch API/UI; queue and Library publication authority. Legacy edits retain known
  provenance and require a current human decision; no historical approval is invented.
- **Remaining:** broader export scheduling/ceilings, expanded queue filters, authenticated
  staging/MCP/upgrade acceptance and Word/provider/pilot proof.
- **Where:** source merged into `dev` through [PR #12](https://github.com/Git-Matter/gitmatter/pull/12); broader plan exit gates remain open.

## MFA sign-off review

Plan 01 has historical local enrollment/recovery/audit runtime proof and the 2026-10-11 repository/UI
smoke review. The return-path open redirect found in that review was fixed with a shared helper and
regression test. Fresh authenticated acceptance and production release remain unverified. The
required credential skill has now been located and loaded; the user authorized AWS login, whose
browser sign-in remains pending. A reusable staging test account has not been created or stored.

## Done

No plan in this epic is complete. The shipped baseline the plans build on is tracked in
[`../../PLANS.md`](../../PLANS.md): scoped MCP tokens, audit export, per-matter metering, and the
clause library and playbooks through phase 2.

## Order

`02` → `03` → `04` → `05` → `06` → `07`. `01` runs alongside when a pilot or security review needs
it. `08` defines the gates every plan must satisfy.
