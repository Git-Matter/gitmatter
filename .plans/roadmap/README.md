# Epic: real-usage legal workflow

Turn gitmatter's existing feature set into one reliable, pilot-ready legal workflow: a third-party
NDA review that runs from upload to a cited review to an approved-clause tracked change to an exported
redline, with every step attributable whether it was started in the web UI or by a matter-scoped MCP
agent.

This epic tracks progress. It is not a plan itself; each concern has its own plan file.

- Goal, product hierarchy, current baseline, measures, and release-proof tiers:
  [`../08-pilot-program-and-release-proof.md`](../08-pilot-program-and-release-proof.md)
- Plan index and status vocabulary: [`../README.md`](../README.md)
- Status reviewed: 2026-10-11 for plans 01–02; other plan statuses retain their 2026-09-16 evidence.

## Plan status

Numbers are delivery order, not progress rank — a low number is not further along than a high one.

| Plan                                             | Concern                                                                 | Status                   |
| ------------------------------------------------ | ----------------------------------------------------------------------- | ------------------------ |
| [`01`](../01-mfa-better-auth.md)                 | Opt-in TOTP and backup-code MFA                                         | Runtime-verified (local) |
| [`02`](../02-establish-product-truth.md)         | NDA fixture pack, browser acceptance, MCP reference, funnel events      | In progress              |
| [`03`](../03-review-to-redline-loop.md)          | Review contract → cited findings → proposed redline → export            | Planned                  |
| [`04`](../04-durable-background-work.md)         | Database-backed job/outbox replacing the in-memory extraction queue     | Planned                  |
| [`05`](../05-approval-and-agent-queue.md)        | Matter approval policy, append-only approvals, Agent activity queue     | In progress              |
| [`06`](../06-matter-workspace-and-search.md)     | Job-led matter page and permission-filtered full-text search            | Planned                  |
| [`07`](../07-operational-controls.md)            | Cost estimates, hard caps, admin reporting, notifications, integrations | Planned                  |
| [`08`](../08-pilot-program-and-release-proof.md) | Shared framing, measures, release-proof tiers                           | Reference                |

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
- **Remaining:** execute full authenticated browser script locally and on staging, verify actual
  analytics delivery, and record Word/provider/pilot evidence separately.
- **Where:** branch `feat/native-agent-workflow`, draft
  [PR #10](https://github.com/Git-Matter/gitmatter/pull/10).

### 05 Approval and agent queue

- **Done:** accepting or rejecting document edits is human-only — `resolveEdits` refuses
  `actor.type === "agent"` (`packages/core/src/content/documents.ts`).
- **Remaining:** configurable matter approval policy, append-only commit approvals, Agent activity
  queue.
- **Where:** the human-only guard is on branch `feat/native-agent-workflow` (draft PR #10); the rest
  is unstarted.

## MFA sign-off review

Plan 01 has historical local enrollment/recovery/audit runtime proof, current repository checks,
current authenticator/backup-code UI smoke, and no schema drift. The return-path open redirect found
in this review was fixed with a shared helper and regression test. Fresh authenticated acceptance is
pending because the repository-required credential skill is unavailable; production release is
unverified. The prior Planned entry was stale.

## Done

No plan in this epic is complete. The shipped baseline the plans build on is tracked in
[`../../PLANS.md`](../../PLANS.md): scoped MCP tokens, audit export, per-matter metering, and the
clause library and playbooks through phase 2.

## Order

`02` → `03` → `04` → `05` → `06` → `07`. `01` runs alongside when a pilot or security review needs
it. `08` defines the gates every plan must satisfy.
