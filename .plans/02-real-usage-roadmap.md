# Real-usage product roadmap

Turn gitmatter's existing feature set into one reliable legal outcome before adding more broad
feature categories.

The first product slice is a third-party NDA review because gitmatter already has the required
building blocks: document upload and extraction, an approved clause library, playbooks, cited
tabular review, tracked-change DOCX editing, human edit resolution, audit history, export, and MCP
agent access.

## Outcome

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

Important gaps:

- Playbook findings do not yet form a complete handoff into approved-clause redlines.
- No matter-level approval policy or unified queue for pending agent work.
- Document extraction uses an in-memory queue; a process restart can leave work needing manual retry.
- Search only matches review and document titles, not document text, clauses, or review cells.
- Budgets warn and log but do not stop excessive spend.
- Tool documentation can drift from the catalog because it is maintained manually.
- Automated checks are strong at module level, but the critical lawyer journey lacks a repeatable
  browser-level acceptance suite.

## Delivery order

### Milestone 0 — establish product truth

Purpose: create a trustworthy baseline before changing the workflow.

Work:

- Build one sanitized NDA fixture pack: source DOCX, expected playbook findings, approved clauses,
  fallback clauses, expected redlines, and expected audit events.
- Add a browser acceptance script for the complete current path, even where steps still require
  separate screens.
- Generate the MCP tools reference from the runtime catalog, including jurisdiction-gated tools,
  instead of keeping a hard-coded tool count.
- Instrument the funnel without legal content or PII:
  `upload_started`, `extraction_ready`, `playbook_started`, `playbook_completed`,
  `finding_opened`, `redline_proposed`, `redline_resolved`, `document_exported`.
- Record duration, failure category, provider/model, token usage, document page/character count, and
  actor type. Never record document text, prompts containing client material, citations, keys, or
  file names in telemetry.

Exit gate:

- Baseline journey reproducible on local and staging.
- Each failed step has a visible user-facing state and a structured operational event.
- Funnel can answer where a pilot user stopped without exposing client content.

### Milestone 1 — close review-to-redline loop

Purpose: deliver the first complete legal outcome.

Work:

- Add a matter-level **Review contract** action. Ask for documents, approved playbook, model, and
  optional client position; create/run the review underneath.
- On each playbook finding, show source citation, matched playbook rule, severity, standard
  position, available fallbacks, and guidance.
- Add **Propose redline** from a finding. Resolve an approved clause/fallback, create the tracked
  DOCX edit through the normal commit path, and record clause id, clause version/commit, playbook
  rule id, source finding, and acting user/agent in commit metadata.
- Add **Escalate** for findings needing partner judgment. Milestone 3 supplies enforcement; until
  then escalation is visible workflow state and cannot masquerade as approval.
- Provide one review completion view: unresolved findings, pending tracked changes, rejected
  findings, escalations, export readiness, and audit-export action.
- Make generated output clearly distinguish a review report from the source/redlined document.

Reuse the phase-3 clause/playbook design in [`../PLANS.md`](../PLANS.md); do not create a parallel
redline engine.

Exit gate:

- NDA fixture completes from upload to downloadable tracked-change DOCX and audit export.
- Every generated finding has a source citation or an explicit `not found` outcome.
- Every proposed redline identifies the approved clause/fallback version used.
- No redline mutation bypasses `recordCommit()`.
- Web UI and a scoped MCP agent produce equivalent attributable history.

### Milestone 2 — durable background work

Purpose: prevent deploys, restarts, provider failures, or closed browser tabs from losing work.

Work:

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

Exit gate:

- Kill the web process during extraction and review; restart; both jobs resume or fail safely.
- Repeat the same job delivery; no duplicate artifact mutation appears.
- Provider timeout and rate-limit fixtures produce bounded retries and a clear final state.
- A browser reload reconnects to current progress.

### Milestone 3 — human approval and agent review queue

Purpose: make agent-assisted work acceptable under firm supervision.

Work:

- Add matter approval policy with separate controls for:
  - agent-proposed document edits;
  - red/yellow playbook findings;
  - tabular-cell writes;
  - workflow/playbook changes;
  - exports above a configured cost or document count.
- Implement append-only commit approvals: approver, decision, note, timestamp, target commit, and
  policy applied. Approval never rewrites prior history.
- Add one **Agent activity** queue inside each matter containing pending document edits, proposed
  review cells, workflow proposals, and escalations.
- Permit batch approval only when items share the same decision context. Preserve individual audit
  entries and source citations.
- Keep approval human-only by default. Agents may list pending work but cannot approve their own
  work.
- Show pending/approved/rejected state in document, review, history, and export surfaces.

Use the approval-gate and action-review-queue architecture in [`../PLANS.md`](../PLANS.md). Avoid
artifact branches until approval workflow proves branches are necessary.

Exit gate:

- Under `approval required`, agent mutations cannot change approved matter state before a human
  decision.
- Approver identity and note appear in history, `show_commit`, and audit export.
- Rejecting a proposal leaves approved state unchanged.
- Access tests cover viewer/editor/owner, tenant admin, matter-scoped token, and out-of-scope token.

### Milestone 4 — matter workspace and retrieval

Purpose: reduce navigation cost and make prior work reusable.

Work:

- Rework matter landing page around **Review contract**, **Ask documents**, **Draft document**,
  **Bulk extraction**, and **Export work**.
- Add recent work, pending approvals, failed jobs, unresolved escalations, and cost-to-date to the
  matter overview.
- Add permission-filtered Postgres full-text search across document text, review-cell summaries,
  clause bodies, playbook titles/rules, and matter metadata.
- Return ranked snippets with exact artifact links. Filter access in SQL before ranking,
  aggregation, counts, and pagination.
- Group global results by matter. Add matter filter and source-type filter.
- Support the concrete precedent query: “Where have we accepted this language before?” using text
  and structured review data first.
- Defer semantic/vector search until users demonstrate queries that full-text search cannot serve.

Exit gate:

- User can find a known clause or review value from another authorized matter using representative
  fixtures.
- Unauthorized matter produces no title, snippet, count, timing distinction, or pagination leak.
- First-time pilot user can start the golden workflow from matter page without being taught
  Reviews/Workflows/Library taxonomy.

### Milestone 5 — operational controls and pilot integrations

Purpose: give firm administrators enough control to permit sustained use.

Work:

- Add pre-run cost estimate for bulk review: document count/size, number of rules/cells, selected
  model, estimated token range, and configured limit.
- Add tenant, user, matter, MCP-token, and single-run hard caps. Fail before starting when estimated
  cost exceeds policy; stop safely at cell/job boundaries if actual use crosses a hard cap.
- Add admin usage view grouped by matter, user/agent, model/provider, and day; retain CSV export.
- Add email notifications for failed jobs, pending approvals, completed bulk work, budget threshold,
  and repeated agent authentication failures. Use digests where event volume can spike.
- Select integrations from pilot evidence. First candidates:
  - Microsoft Word round-trip quality and naming conventions;
  - SharePoint/OneDrive or a target firm's DMS import/export;
  - email intake and completion notification.
- Do not build a broad integration marketplace before one pilot integration has repeated weekly use.

Exit gate:

- Admin can predict, cap, attribute, and export spend for a matter.
- Over-limit job does not leave partial mutations presented as completed work.
- Notification contains identifiers and safe status only, never document content.
- At least one pilot-selected integration completes its real workflow end to end.

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

Each milestone records separate evidence:

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

## Likely code areas

- Golden workflow: `packages/core/src/ai/tabular/`, `packages/core/src/content/clauses.ts`,
  `packages/core/src/content/documents.ts`, `packages/core/src/tools/`, and matter/review/document UI.
- Durable work: new shared job schema/core module, extraction queue, tabular runner, exports, and
  server worker bootstrap.
- Approval: commit/access core, matter policy schema, document/tabular/workflow mutation paths,
  audit tools, and matter activity UI.
- Search: database indexes, shared access-filtered query, discovery tool, and global/matter UI.
- Controls: usage core/schema, provider catalog pricing, admin settings/reporting, and email.
- Product truth: tool catalog, generated docs, acceptance fixtures, and browser tests.
