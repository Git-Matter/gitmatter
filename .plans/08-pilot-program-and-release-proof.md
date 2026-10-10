# Pilot program, measures, and release proof

Shared framing and evidence rules for the product plans in this directory. Individual plans link
here instead of repeating it.

This file replaces the single `02-real-usage-roadmap.md` document, split into one plan per concern
(`02`–`07`) on 2026-09-16. The `(M0)`–`(M5)` labels in the plan titles keep the original delivery
order: `02` → `03` → `04` → `05` → `06` → `07`.

**Status: Reference** (verified 2026-09-16) — shared framing and gates; no delivery work of its own.

## Outcome

Turn gitmatter's existing feature set into one reliable legal outcome before adding more broad feature
categories.

The first product slice is a third-party NDA review because gitmatter already has the required
building blocks: document upload and extraction, an approved clause library, playbooks, cited
tabular review, tracked-change DOCX editing, human edit resolution, audit history, export, and MCP
agent access.

A lawyer can complete this job without understanding gitmatter's internal feature taxonomy:

1. Open a matter and upload a third-party NDA.
2. Run the firm's approved NDA playbook.
3. Review cited findings grouped by severity.
4. Turn a finding into a tracked change using the firm's approved clause or fallback.
5. Accept, reject, or escalate each proposed change.
6. Download a Word document with tracked changes and an audit report.
7. Reopen the matter later and reproduce who proposed, approved, rejected, or exported each change.

The same path must work when started in the web UI or by a matter-scoped MCP agent. Agent work must
remain attributable and subject to the same approval policy.

## Product hierarchy

Present product around legal jobs, not implementation objects:

- **Primary job:** review a contract against firm policy and produce a defensible redline.
- **Supporting jobs:** ask matter documents, run bulk extraction, draft a document, export work.
- **Knowledge:** approved clauses, fallback ladders, and playbooks.
- **Trust controls:** citations, approvals, history, scoped agent access, cost controls.
- **Access channels:** web UI, ChatGPT, Claude, Claude Code, and Codex over the same tool catalog.

Keep Library, Reviews, Workflows, Assistant, and MCP available as advanced surfaces. Matter pages
should lead with the jobs above.

## Current baseline

Already implemented:

- Client and matter organization, matter members, adverse parties, and conflict checking.
- PDF/DOC/DOCX upload, extraction status, manual retry, version download, and DOCX tracked changes.
- Tabular review with per-cell citations and streaming progress.
- Clause Library with firm/client/matter scope, fallbacks, lifecycle, and admin approval.
- Playbook drafting, approval, execution through the tabular runner, and seeded playbook support.
- Human and agent audit history, field-level diff/blame, matter audit export, and scoped MCP tokens.
- Per-matter usage metering and multi-provider BYO-key support.
- Native subscription-agent flow: a matter "review with your own AI" handoff, agents read documents,
  save cited cells, and propose tracked edits, with structured tool results, artifact links, and
  partial-failure signals; agents cannot accept or reject document edits.
- Generated and pasted documents appear in the matter with readable content and creation audit
  records. The MCP tools reference is generated from the runtime catalog with a CI drift check.

Important gaps, each owned by a plan:

- Playbook findings do not yet form a complete handoff into approved-clause redlines
  ([`03-review-to-redline-loop.md`](03-review-to-redline-loop.md)).
- No configurable matter-level approval policy or unified queue for pending agent work. Accepting or
  rejecting document edits is already human-only, but red/yellow findings, cell writes, and workflow
  changes are not governed by policy ([`05-approval-and-agent-queue.md`](05-approval-and-agent-queue.md)).
- Document extraction uses an in-memory queue; a process restart can leave work needing manual retry
  ([`04-durable-background-work.md`](04-durable-background-work.md)).
- Search only matches review and document titles, not document text, clauses, or review cells
  ([`06-matter-workspace-and-search.md`](06-matter-workspace-and-search.md)).
- Budgets warn and log but do not stop excessive spend
  ([`07-operational-controls.md`](07-operational-controls.md)).
- Automated checks are strong at module level, but the critical lawyer journey lacks a repeatable
  browser-level acceptance suite ([`02-establish-product-truth.md`](02-establish-product-truth.md)).

## Pilot program

Run with a small design-partner cohort and representative, sanitized documents before calling the
workflow production-ready.

Suggested cadence:

1. Observe first-run setup and one NDA review without coaching.
2. Record task outcome, time, corrections, abandoned steps, missing context, and trust concerns.
3. Review every generated finding/redline with a lawyer; classify false positive, false negative,
   citation failure, policy mismatch, or acceptable result.
4. Fix the highest-frequency workflow failure before expanding document types.
5. Repeat with the same user. Weekly repeat use matters more than first-session enthusiasm.

Pilot expansion order:

1. Third-party NDA.
2. MSA review using one firm's approved playbook.
3. Due-diligence bulk extraction.
4. Document generation from approved precedent.

Do not expand because an engine can technically support a document type. Expand only after a firm
supplies a playbook, expected outputs, and reviewer capacity.

## Measures

Primary:

- Percentage of uploaded pilot documents reaching an approved/exported result.
- Median time from upload to first usable cited review.
- Percentage of findings opened, resolved, escalated, or dismissed.
- Percentage of proposed redlines accepted unchanged, accepted after edit, or rejected.
- Weekly repeat use by the same lawyer and firm.

Trust and quality:

- Citation precision on reviewed findings.
- False-negative rate on fixture playbook requirements.
- Redline round-trip success in Microsoft Word.
- Percentage of agent mutations requiring human correction.
- Audit-export completeness against source commits and approvals.

Reliability and cost:

- Job success, retry, stale-lease recovery, and duplicate-mutation rates.
- P50/P95 extraction and playbook duration by document size.
- Cost per completed document and per accepted redline.
- Provider error and rate-limit rate.

Guardrails:

- No legal text, prompts containing legal text, provider keys, or citation passages in telemetry.
- No out-of-scope search or MCP access found by automated authorization tests.
- No completed-state UI when durable job or export is partial.

## Release proof

Each plan records separate evidence:

1. **Source proof:** schema, access guards, commit-path use, and focused tests.
2. **Repository proof:** `vp check`, `vp run typecheck`, and `vp test` pass.
3. **Runtime proof:** fixture completes against running local stack, including Postgres and object
   storage.
4. **Staging proof:** deploy record, migration state, background-job recovery, browser acceptance,
   and scoped MCP acceptance.
5. **Pilot proof:** representative user completes task and output receives legal review.
6. **Production proof:** intended release deployed, live health verified, and monitored workflow
   completes without privileged developer intervention.

A passing unit suite does not prove browser behavior, Word compatibility, staging deployment, or
pilot acceptance.

## Deferred until evidence supports them

- Artifact branches and merge UI.
- Cryptographic commit signing beyond attributable database approvals.
- Semantic/vector search.
- Broad Slack/webhook/integration marketplace.
- More legal-research providers without a pilot use case.
- Autonomous approval or autonomous finalization of legal work.
- Customer metrics, testimonials, or compliance claims without measured evidence.
