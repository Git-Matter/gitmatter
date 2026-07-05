# Feature Plans

Implementation plans for 12 candidate features, grounded in the current codebase (schema in `packages/db/src/schema/`, commit spine in `packages/core/src/core/commit.ts`, access control in `packages/core/src/core/access.ts`, tool catalog in `packages/core/src/tools/catalog.ts`, MCP server in `apps/web/src/server/mcp/`).

Shared architectural facts these plans rely on:

- Every artifact mutation goes through `recordCommit()` — one linear chain per artifact (`commits.seq` monotonic, unique on `(artifactType, artifactId, seq)`, single `parentCommitId`).
- Diff/blame is computed on read by folding `field_changes` in seq order (`stateAtSeq`, `diffCommits`, `deriveBlame`).
- Access = tenant → client → matter → artifact, with `matter_members` roles (viewer < editor < owner) plus `artifact_shares`; guards are `hasMatterAccess` / `canAccessArtifact`.
- MCP tokens (`mcp_access_tokens`, `gc_` static / `gco_` OAuth) resolve to a single user; agent actions commit as `actorType: "agent"` with `agentLabel: "mcp:<label>"`.
- Metering exists: `usage_events` (tokens + tool calls), `audit_events` (security log). Email exists (Resend via `packages/core/src/platform/email.ts`); webhooks do not.

Suggested build order: 5 → 3 → 11 → 7 → 4 → 12 → 8+9 → 2 → 6 → 10 → 1 (roughly ascending risk; 5 unblocks enterprise, 1 is the deepest schema change).

Status (2026-07-02): 5 (scoped tokens), 3 (audit export), and 11 (per-matter metering) shipped. 8+9 shipped through phase 2: clause library (artifact type `clause`, fallback ladders, client overlays, admin approval) and playbooks (`workflows.type: "playbook"` with rules, executed via the tabular runner, `draft_playbook` generator, seeded NDA playbook). **Architecture decision (Option B): "Library" is the shared product surface and lifecycle — one Library page (Clauses | Playbooks tabs), one draft → admin-approved → deprecated lifecycle, `list_*/get_*/suggest_*/write_*` MCP naming — while storage stays per-kind (typed tables, no generic library_items). Extract a shared base only when a third/fourth kind proves the repetition.** Remaining from 8+9 phase 3: clause injection into redline/chat prompts, per-cell "propose redline with fallback" handoff, escalation tie-in (needs Plan 2).

---

## 1. Branching + merge for matters (draft branches on artifacts)

**Goal.** Let an associate (or agent) propose changes on a draft branch of an artifact; a reviewer sees the branch-vs-main diff and merges. Approval workflow falls out of merge review.

**Why it is hard today.** The spine is explicitly linear: `stateAtSeq` folds _all_ field_changes for an artifact by `seq`, and `seq` is unique per artifact. Branches break both assumptions.

**Design.**

- New table `branches`: `id`, `artifactType`, `artifactId`, `name` (unique per artifact), `baseCommitId` (fork point), `headCommitId`, `createdBy`, `status` (`open|merged|abandoned`), `mergedCommitId`, timestamps. A default implicit branch `main` is represented by the existing `documents.headCommitId` etc. — no row needed.
- `commits` gains nullable `branchId` (null = main). Keep `seq` monotonic per artifact (allocation order), but stop using it as the state-fold ordering for branches.
- Replace seq-fold with **parent-chain fold**: new `stateAtCommit(commitId)` walks `parentCommitId` back to root, folds field_changes along that chain. `stateAtSeq` stays for main-only callers (equivalent when no branches exist), but `diffCommits` and `deriveBlame` get commit-id variants.
- Merge = fast-forward when main hasn't moved since `baseCommitId`; otherwise compute three-way field diff (base vs branch head, base vs main head). Field-level granularity makes conflicts cheap: conflict only when _both_ sides changed the same `path`. Merge produces one commit on main with `op: "merge"`, `summary` recording branch name + resolved conflicts; store `mergeParentCommitId` on the commit for provenance (single extra nullable column — avoids a multi-parent join table).
- Live tables (documents.markdown, tabular_cells, document rows) reflect **main only**. Branch state is virtual — rendered from `stateAtCommit(branch.headCommitId)`. This keeps every existing read path untouched. For docx documents, branch versions are extra `document_versions` rows flagged with `branchId` (nullable column) so the OOXML engine keeps working.

**Steps.**

1. Schema: `branches` table, `commits.branchId`, `commits.mergeParentCommitId`, `document_versions.branchId`. `vp run --filter=@workspace/db generate`.
2. `commit.ts`: `createBranch`, `recordCommit` accepts optional `branchId` (advisory lock unchanged — still per artifact), `stateAtCommit`, `mergeBranch` (ff + three-way).
3. Tools: `create_branch`, `list_branches`, `merge_branch`, and `branchId` param on existing mutating tools (`write_cell`, `propose_document_edit`, `write_workflow`).
4. Web UI: branch picker on artifact pages, branch diff view (reuse existing diff rendering), merge dialog with conflict list. Merge requires matter `owner` role.
5. Verify: unit tests for parent-chain fold equivalence with seq fold on linear history; conflict/no-conflict merge tests; concurrent-commit test under the advisory lock.

**Touched.** `packages/db/src/schema/{commits,branches,documents}.ts`, `packages/core/src/core/commit.ts`, `packages/core/src/tools/*`, `apps/web/src/routes/_auth/{documents,reviews,workflows}/`.

**Risk.** Highest of the twelve. Ship behind a tenant-level feature flag; do documents-markdown + workflows first, tabular + docx second.

---

## 2. Signed commits / approval gates

**Goal.** Partner sign-off is recorded in the spine; "who approved this change" is answerable from history.

**Design.**

- New table `commit_approvals`: `id`, `commitId` FK, `approverId` (user FK), `decision` (`approved|rejected`), `note`, `createdAt`, unique(`commitId`, `approverId`). Append-only.
- Approval itself is _also_ a commit: `recordCommit` with `op: "approve"`, zero field changes (`skipIfNoChanges` bypassed via explicit flag), `summary: { targetCommitId, decision }`. That way approvals show up in `history` / `show_commit` without new read paths.
- Gate policy per matter: `matters` gains `approvalPolicy` (jsonb, e.g. `{ resolveEdits: "owner" }`). Enforcement point: `resolveEdits`/`resolveDocxEdits` in `packages/core/src/content/documents.ts` — before accepting a tracked change created by an agent, require an `approved` row from a user with matter role ≥ policy role.
- Cryptographic signing is optional phase 2 (sign commit hash with a per-user key); start with DB-attributed approvals — the audit story firms need first.

**Steps.**

1. Schema: `commit_approvals`, `matters.approvalPolicy`. Migrate.
2. Core: `approveCommit()` in `commit.ts` (writes approval row + approve-commit atomically); policy check helper in `access.ts`; wire into `resolveEdits`.
3. Tools: `approve_commit`, `list_pending_approvals`; extend `show_commit` output with approvals.
4. UI: approval badge in history view, approve/reject buttons on tracked-change cards (`ChatEditCards` / document viewer), matter settings toggle for policy.
5. Verify: test that agent-created edit cannot be resolved without approval when policy set; approval visible via `history` tool.

**Touched.** `packages/db/src/schema/{commits,matters}.ts`, `packages/core/src/core/{commit,access}.ts`, `packages/core/src/content/documents.ts`, `packages/core/src/tools/audit.ts`, document viewer components.

---

## 3. Audit export

**Goal.** One-click export of a matter's full audit trail (commits, field diffs, approvals, security events) as PDF/CSV. Cheapest high-value feature — all data exists.

**Design.**

- Read-only. New core module `packages/core/src/content/auditExport.ts`:
  - Gather: all artifacts on the matter (via `matter_documents`, `tabular_reviews.matterId`, `workflows.matterId`) → `listCommits` per artifact → `field_changes` per commit → join actor names; plus matter-scoped `audit_events` (document.upload/download etc.) and `usage_events` summary.
  - Render: CSV via manual serialization (no dep needed); DOCX via existing `docx` lib (already used by `generate_docx`) — firms prefer DOCX/PDF letterhead-style reports; PDF phase 2 (or print-to-PDF from a rendered HTML route).
- Endpoint: `GET /api/matters/:id/audit-export?format=csv|docx` in the Hono app, guarded by `hasMatterAccess(userId, matterId, "viewer")`. Record an `audit_events` row `tenant.export`-style (`matter.audit_export`) on each export.
- MCP tool `export_audit` returning a download URL (or inline CSV for small matters).

**Steps.**

1. Core gather + render module with tests (fixture matter with mixed human/agent commits).
2. Hono route + rate limit; audit-event on export.
3. UI: "Export audit trail" button on matter page.
4. Verify: export a seeded matter; check agent commits show `agentLabel`, human commits show name/email; CSV row count matches commit+event count.

**Touched.** `packages/core/src/content/auditExport.ts` (new), `apps/web/src/server/http/routes/`, matter page. No schema change.

---

## 4. Revert / time-travel view

**Goal.** View an artifact at any commit and restore it. Spine already supports read (`stateAtSeq`); missing mutation + UI.

**Design.**

- Core `revertToSeq(artifactType, artifactId, targetSeq, actor)` in `commit.ts`: compute `diffCommits(target → head)`, invert it, apply as **one new commit** (`op: "revert"`, `summary: { revertedToSeq }`). History never rewrites — revert is forward-only, consistent with the spine's append-only contract.
- Per artifact type the apply callback differs:
  - Workflow: write inverted field values back to `workflows` row + `fieldCommits` stamps (mirror `write_workflow` apply).
  - Tabular: upsert cells via existing `commitCell` semantics.
  - Document (markdown mode): set `documents.markdown` to state at target.
  - Document (docx mode): restore = new `document_versions` row cloning the target version's `storagePath` (files are immutable snapshots; guard against tombstoned versions where `storagePath` is null — refuse with a clear error).
- Time-travel view: read-only render of `stateAtSeq(seq)` behind a history slider/dropdown on the artifact page; diff highlighting vs head reuses `diffCommits`.

**Steps.**

1. `stateAtSeq` already exists — add `revertToSeq` + per-type apply strategies in the modules that own each artifact (`platform/workflow.ts`, `ai/tabular/runner.ts`, `content/documents.ts`) so ownership stays local.
2. Tool `revert_artifact` (matter editor+ required); route + UI slider on history panel.
3. Verify: revert then re-revert round-trips; docx revert with tombstoned version errors cleanly; revert commit appears in blame as the new last-writer.

**Touched.** `packages/core/src/core/commit.ts`, `platform/workflow.ts`, `ai/tabular/runner.ts`, `content/documents.ts`, tools, artifact history UI. No schema change.

---

## 5. Agent permissions per matter (scoped MCP tokens)

**Goal.** A token can be restricted to specific matters and a maximum role. Today tokens inherit the full user; firms need least-privilege agents before real adoption. **Highest-priority feature.**

**Design.**

- Schema: `mcp_access_tokens` gains `allowedMatterIds` (jsonb `string[] | null`, null = all user's matters) and `maxRole` (`viewer|editor|owner`, default `editor`).
- OAuth (`gco_`) tokens: add the same two claims to the HMAC-signed payload in `packages/core/src/platform/oauth.ts`; consent screen shows requested scope. Legacy tokens = unscoped (backwards compatible).
- Enforcement in **one place**: `Actor` gains optional `scope?: { matterIds: string[] | null, maxRole: MatterRole }`. `hasMatterAccess` / `canAccessArtifact` in `access.ts` take the actor (not bare userId) and clamp: effective role = `min(existing effective role, scope.maxRole)`; matter not in `matterIds` → no access. Because _every_ tool already funnels through these guards, no per-tool changes are needed — this is the key leverage point.
- `create_matter` / `create_client` refuse when the token is matter-scoped (creation exceeds scope).
- Mint UI: matter multi-select + role cap on the ConnectAgent settings card; token list shows scope.

**Steps.**

1. Schema migration (two columns, jsonb + text enum).
2. `access.ts`: actor-aware guards + clamp; thread `Actor` through `resolveMcpAccount` → `buildMcpServer` → `buildToolCatalog` (actor already flows here — extend the type).
3. OAuth claims + validation; keep 60s token cache keyed to include scope.
4. UI mint dialog + token list; audit event `mcp_token.mint` metadata gains scope.
5. Verify: scoped token cannot list/read/mutate out-of-scope matter (test each tool family once — guards are shared); viewer-capped token cannot `write_cell`; unscoped legacy token unchanged.

**Touched.** `packages/db/src/schema/keys.ts` (mcp tokens), `packages/core/src/core/access.ts`, `packages/core/src/platform/{mcp-tokens,oauth}.ts`, `apps/web/src/server/mcp/server.ts`, ConnectAgent settings UI.

---

## 6. Agent action review queue

**Goal.** Agent mutations land as proposals; a human approves or discards in batch. Turns the spine into a human-in-the-loop gate.

**Design — extend the pattern that already exists, don't generalize commits.** Documents already do this: `propose_document_edit` creates `document_edits` rows with `status: "pending"` and humans resolve them. Generalizing a "proposed commit" would break the linear fold (a rejected commit can't be un-folded). So:

- Tabular: `tabular_cells.status` gains `proposed`. Agent `write_cell`/`run_cell` with matter policy "review required" writes content to a new `proposedContent` jsonb column (head content untouched), status `proposed`. Approve = commit moving proposedContent → content; reject = clear.
- Workflows: `write_workflow` under policy writes to a new `workflow_proposals` table (`workflowId`, `fields` jsonb, `proposedBy`, `status`); approve applies via the normal `recordCommit` path attributed `op: "apply_proposal"` with the agent as actor and the approver in `summary`.
- Policy lives on the matter: reuse `matters.approvalPolicy` from Plan 2 (`{ agentMutations: "review" | "direct" }`). One policy object serves both features.
- Review queue UI: per-matter "Agent activity" tab listing pending document edits + proposed cells + workflow proposals, batch approve/reject. MCP tools: `list_proposals`, nothing else — approval is human-only (UI), by design.

**Steps.**

1. Schema: `tabular_cells.proposedContent` + status value; `workflow_proposals` table; (approvalPolicy from Plan 2). Migrate.
2. Core: policy check at the top of agent-actor mutation paths (`runner.ts`, `platform/workflow.ts`); approve/reject functions committing through `recordCommit`.
3. UI queue tab + notification count badge.
4. Verify: agent write under policy leaves head state unchanged; approve produces commit attributed to agent with approver recorded; reject leaves no commit.

**Touched.** `packages/db/src/schema/{tabular,workflow}.ts`, `packages/core/src/ai/tabular/runner.ts`, `packages/core/src/platform/workflow.ts`, matter UI. Depends on Plan 2's policy column (or ship the column here first).

---

## 7. Webhooks / notifications

**Goal.** Commit on a matter → Slack/email/webhook to the staffed team. Makes agent activity visible.

**Design.**

- Schema: `webhooks` (`id`, `tenantId`, `matterId` nullable = tenant-wide, `url`, `secret` (encrypted, AES-GCM like `user_api_keys`), `events` jsonb string[], `active`, `failCount`, `disabledAt`) and `notification_prefs` (`userId`, `matterId`, `channel` (`email`), `events` jsonb).
- Dispatch point: **after** `recordCommit`'s transaction commits (never inside — a slow webhook must not hold the advisory lock). Add an in-process post-commit hook: `recordCommit` returns, caller-side `emitSpineEvent({ commit, changes })` pushes onto an in-memory queue drained by a background loop (setInterval worker in the Hono server; no new infra). At-least-once is not guaranteed across restarts — acceptable v1; durable outbox table is phase 2 (`webhook_deliveries` with status, enabling retry after restart — recommend building the table from day one and treating the in-memory loop as its consumer).
- Delivery: POST JSON `{ event, tenantId, matterId, artifact, commit: { id, actor, agentLabel, message, op }, changesSummary }` with `X-Gitmatter-Signature: hmac-sha256(secret, body)`. 3 retries, exponential backoff; auto-disable after N consecutive failures (audit event).
- Email channel reuses `packages/core/src/platform/email.ts` (Resend) with a new template "activity digest" — batch per user per 5-minute window to avoid mail storms during agent runs.
- Slack = user pastes an incoming-webhook URL (it's just a webhook with a payload adapter). No OAuth app needed for v1.

**Steps.**

1. Schema (`webhooks`, `webhook_deliveries`, `notification_prefs`) + migrate.
2. Core: `platform/webhooks.ts` (CRUD, sign, deliver, retry); event emission from the 4 `recordCommit` call-site modules (or a thin wrapper `recordCommitAndNotify` to keep it in one place).
3. Hono: webhook CRUD routes; settings UI (matter settings + tenant admin).
4. Verify: commit fires delivery with valid HMAC (test receiver); failure → retry → disable path; email digest batches.

**Touched.** `packages/db/src/schema/webhooks.ts` (new), `packages/core/src/platform/webhooks.ts` (new), `packages/core/src/core/commit.ts` (or wrapper), settings UI.

---

## 8 + 9. Clause Library + Playbooks (unified)

**Goal.** The firm's institutional knowledge as two linked, audited artifacts: a **clause library** ("what language do we use?") and **playbooks** ("how do we review/negotiate?"). Playbook rules reference library clauses as fallbacks; review runs a playbook and flags deviations; one click proposes the conforming redline. The feature legal buyers ask for by name (Harvey, Spellbook, Ironclad all ship a version). gitmatter's edge: both artifacts live on the audit spine (field-level blame on every rule/clause edit) and are readable by any connected agent over MCP — not a black box inside one vendor's UI.

### Lawyer use cases

Clause library:

1. **Approved house language** — standard governing-law/indemnity/confidentiality/LoL clauses; drafting (chat, `generate_docx`, agents) pulls from the library instead of improvising. Consistency across associates and agents.
2. **Fallback ladders** — ordered concession positions per clause type (cap at 12 months' fees → 24 months → uncapped for IP/confidentiality carve-outs only). The negotiator knows the next retreat position without asking a partner.
3. **Jurisdiction variants** — same clause, per-jurisdiction versions (GDPR Art-28 vs CCPA; AU vs US non-compete); `jurisdictionMatches` in `packages/registry` already models the filter.
4. **Risk-rated alternatives** — clauses tagged acceptable/negotiable/escalate with commentary on _when_; juniors learn the why, agents cite it in reasoning.
5. **Client overlays** — client-scoped clauses override firm defaults ("client X never accepts arbitration").
6. **Precedent recall** — entries link back to source matters ("what did we agree last time").
7. **Versioned + attributed** — clause edits are commits with blame; knowledge management and malpractice defense in one.

Playbooks:

1. **Review checklists per document type** — NDA/MSA/DPA/lease: required, prohibited, preferred terms → deviation report on inbound paper.
2. **Auto-redline with fallback** — rule violated → tracked change substituting the library fallback; human accepts/rejects.
3. **Deviation severity + citation** — verdict with quoted offending language (existing cell `flag` + `citations` shape).
4. **Escalation rules** — what an associate may concede vs partner sign-off; ties into approval gates (Plan 2).
5. **Intake triage** — red-count on inbound paper decides staffing effort.
6. **In-house counsel mode** — review under the _client's_ playbook; playbooks are shareable artifacts (workflow sharing exists).
7. **Regulatory checklists** — e.g. GDPR Art 28(3) mandatory clauses; missing = red.
8. **Due-diligence sweeps** — playbook over a data room (change-of-control, assignment, exclusivity, MFN) → one review grid.

### Authoring model (Harvey-inspired)

The unit lawyers think in is one self-contained rule per clause type:

| Field               | Example (limitation of liability)                          |
| ------------------- | ---------------------------------------------------------- |
| clauseType          | Limitation of liability                                    |
| standardPosition    | "Cap at 12 months' fees paid; mutual."                     |
| fallbacks (ordered) | 1. 24 months' fees 2. Uncapped for confidentiality/IP only |
| unacceptable        | "Uncapped liability for us; any cap on their indemnity"    |
| guidance            | Why, when to escalate, who approves deviations             |

Review verdict per rule is three-way — **acceptable / needs review / unacceptable** — mapping 1:1 onto the existing tabular flags (green/yellow/red), with reasoning + quoted language per cell. Keep playbooks one contract type each, ≤ a few hundred rules.

Lawyers do not fill in blank forms. Four authoring flows, in priority order:

1. **Conversational** — "help me make an NDA playbook"; the assistant proposes rules, asks clarifying questions (side of table, risk tolerance), lawyer edits. Driven by `write_workflow` in the existing chat tool loop.
2. **From standard paper** — upload the firm's template; one extraction pass drafts rules from what the template says. Optional extra negotiated examples are mined for _fallbacks_ (concessions actually accepted before).
3. **Convert an existing guide** — most firms have a Word/PDF negotiation guide; document extraction → structured rules.
4. **From template** — seeded system playbooks (NDA, MSA) customized via the rules editor. The manual editor is the secondary UX, not the primary one.

### Design

Library — new artifact type `clause`:

- Table `clauses`: `id`, `tenantId`, `matterId` nullable (null = firm-wide), `clientId` nullable (client overlay), `title`, `body` (markdown), `category`, `jurisdiction`, `riskRating` (`acceptable|negotiable|escalate`), `guidance`, `tags` jsonb, `status` (`approved|draft|deprecated`), `sourceMatterId` nullable (precedent link), `createdBy`, `headCommitId`, `fieldCommits` jsonb, timestamps. Register in `HEAD_TABLE` (`commit.ts`), `ArtifactType`, and `canAccessArtifact` (firm-wide: tenant members read, tenant admin writes; matter-scoped: matter roles).
- Fallback ladders = ordered sibling clauses linked by `parentClauseId` + `fallbackRank` (rank 0 = standard position), so each variant is individually versioned and blamed.
- Retrieval into drafting: when `propose_document_edit` or assistant drafting runs, fetch top-K clauses by category/jurisdiction (keyword + `jurisdictionMatches` v1; FTS ranking with Plan 10) and inject: "Prefer these approved clauses; cite clause id." Used clause ids recorded in commit `summary`.
- Tools: `list_clauses`, `get_clause`, `write_clause`, `suggest_clauses`.

Playbooks — extend workflows (`type: "playbook"`), no new artifact:

- New jsonb column `rules`: `Array<{ id, clauseType, standardPosition, fallbacks: Array<string | { clauseId }>, unacceptable?, guidance?, severity (red|yellow) }>`.
- Execution reuses the **tabular runner**: `runPlaybook(playbookId, documentIds, matterId)` materializes a tabular review (rules → columns, `workflowId` already exists on reviews) and calls `runReviewStreaming`. Existing green/grey/yellow/red cell flag = the verdict. Zero new engine.
- Per-rule prompt in `ai/prompts/tabular.ts`: standard position + fallbacks + unacceptable → "verdict, quote the offending language, name which position (standard/fallback-N) the clause matches."
- Review page: playbook summary header (X unacceptable / Y needs-review), per-cell "propose redline" chaining into `propose_document_edit` with the standard position (or chosen fallback) as replacement text.
- Generators (authoring flows 2–3): `generatePlaybookRules(documentId)` — one structured-output pass over an extracted document producing draft `rules`; exposed in UI ("Create from document") and as a `draft_playbook` tool for the conversational flow.
- Tools: `run_playbook`, `draft_playbook`; `write_workflow` accepts `rules`. Seed NDA + liability system playbooks via `seedBuiltinWorkflows`.

### Steps

Phase 1 — library:

1. `clauses` schema + `ArtifactType`/`HEAD_TABLE`/access wiring + migrate.
2. `content/clauses.ts` CRUD through `recordCommit` (workflow.ts fieldCommits pattern), fallback-ladder queries.
3. MCP tools + library page under `_auth/`; clause picker in document viewer.
4. Verify: clause edit produces blame; ladder ordering stable; deprecated excluded from suggestion.

Phase 2 — playbooks:

1. `workflows.rules` + type value; migrate.
2. `runPlaybook` + rule prompt; `generatePlaybookRules`; seed system playbooks.
3. Tools + UI (rules editor on workflow page; "create from document"; review page summary header).
4. Verify: seeded NDA playbook on fixture doc yields expected red flags with citations; rule-edit blame (`field/rules/<id>`).

Phase 3 — closing the loop:

1. Clause injection into redline/chat prompts + commit-summary traceability.
2. Per-cell "propose redline with fallback" handoff.
3. Escalation tie-in once Plan 2 (approval gates) exists.

**Touched.** `packages/db/src/schema/{clauses (new),workflow}.ts`, `packages/core/src/core/{commit,access}.ts`, `packages/core/src/content/clauses.ts` (new), `packages/core/src/ai/tabular/` + `ai/prompts/tabular.ts`, `packages/core/src/tools/`, redline prompt path in `content/documents.ts`, new library route + workflow/review UI.

---

## 10. Cross-matter search

**Goal.** "Show all matters where we agreed to 60-day payment terms" — search across documents and extracted cells, access-filtered.

**Design.**

- Postgres FTS, no new infra. Migration adds generated `tsvector` columns + GIN indexes:
  - `documents.searchVector` = `to_tsvector('english', title || ' ' || markdown)`.
  - `tabular_cells.searchVector` over `content->>'summary'` and `content->>'reasoning'`.
  - `clauses` too if Plan 8 shipped.
- **Access filtering is the hard part, do it in SQL**: search query joins the requester's accessible-matter set (`matter_members` where userId, union artifacts owned/shared) so results are filtered before ranking — never post-filter in JS (leaks counts, breaks pagination). Reuse the same predicates `canAccessArtifact` uses, expressed as a reusable Drizzle subquery in `access.ts`.
- The existing `search` MCP tool (`tools/discovery.ts`) currently does keyword search over the user's reviews/documents — upgrade its implementation to FTS + rank + snippet (`ts_headline`) rather than adding a parallel tool. Add `matterId?` filter param and result grouping by matter.
- UI: global search bar (cmd-k) → results grouped by matter → deep links to document position / review cell. Extracted-cell hits are the killer result type ("60-day payment terms" typically lives in a cell summary).
- Semantic/vector search is explicitly phase 2 (needs pgvector + embedding pipeline + per-provider embedding keys); FTS covers the quoted-terms use case firms actually type.

**Steps.**

1. Migration: tsvector generated columns + GIN (raw SQL in a drizzle migration).
2. `access.ts`: accessible-matters subquery helper; `discovery.ts`: FTS implementation with ranking + headline.
3. Hono search route + cmd-k UI.
4. Verify: user A cannot see hits in matters they're not staffed on (test both directions); ranking sane on fixture corpus; pagination stable.

**Touched.** `packages/db` (migration), `packages/core/src/tools/discovery.ts`, `packages/core/src/core/access.ts`, `apps/web` search UI.

---

## 11. LLM usage metering per matter

**Goal.** Token/tool usage attributable to a matter so firms can bill it as a client disbursement. `usage_events` already records provider/model/tokens per user/tenant/token — it just lacks matter attribution and a reporting surface.

**Design.**

- Schema: `usage_events.matterId` (nullable text) + index on (`tenantId`, `matterId`, `createdAt`).
- Threading: `recordLlmUsage` (chat.ts fire-and-forget) and `recordToolCall` (usage.ts) gain optional `matterId`. Sources: chat sessions bound to a matter (chats.artifactType/artifactId → resolve matter), tabular runs (`tabular_reviews.matterId`), redline (`documents.matterId` / matter_documents), MCP tool calls (tool args carry matterId or the catalog's resolved default matter). Central helper `resolveUsageMatter(context)` so attribution logic lives once.
- Reporting: aggregate endpoint `GET /api/matters/:id/usage` (per model, per user/agent, per day) + tenant admin rollup across matters; CSV export. Dollar cost: add a static price table per model in `packages/registry` (pure data — fits the package's role) and compute cost at read time, so historic rows reprice correctly when the table updates; snapshotting cost-at-time-of-use can come later if firms require it.
- Budget hook: optional `matters.usageBudgetTokens`; `recordLlmUsage` path emits existing-style `budget.exceeded` audit event when crossed (warn, never block mid-stream).

**Steps.**

1. Migration (one column + index).
2. Thread matterId through the 3 recording paths + helper; registry price table.
3. Report endpoint + matter usage tab + CSV.
4. Verify: run a tabular review and a matter chat, confirm rows carry matterId; aggregate matches event sum; unattributable events (no matter) land with null and appear in a "general" bucket.

**Touched.** `packages/db/src/schema/usage.ts`, `packages/core/src/platform/usage.ts`, `apps/web/src/server/http/routes/chat.ts`, `packages/core/src/ai/tabular/runner.ts`, `packages/registry/src/` (price table), matter UI.

---

## 12. Conflict check

**Goal.** New matter intake checks the adverse parties against existing clients and existing matters' adverse parties. Table stakes for legal ops — and half-built: `matters` already has `adverseParties` (jsonb string[]), `conflictCleared` (bool), `conflictNotes`.

**Design.**

- Core `platform/conflicts.ts`: `checkConflicts(tenantId, { clientName, adverseParties })` returns hits:
  - Direct: an adverse party matches an existing `clients.name` in the tenant (you'd be against your own client).
  - Positional: the new client matches another matter's `adverseParties` (you were against them before).
  - Matching v1: case/whitespace/punctuation-normalized comparison + `pg_trgm` similarity (one `CREATE EXTENSION IF NOT EXISTS pg_trgm` migration) with a threshold — legal names vary ("Acme Corp" vs "ACME Corporation"). Every hit returns the matched matter/client + similarity score; humans decide.
  - **Tenant-wide check, membership-filtered display**: the check must scan all clients/matters in the tenant (that is the point of a conflict check), but the result for a non-member shows only "potential conflict — contact <lead attorney>" without matter details, preserving matter confidentiality.
- Flow: `create_matter` (tool + UI dialog) runs the check; hits require explicit acknowledgment — matter is created with `conflictCleared: false` + `conflictNotes` prefilled with hits; clearing requires tenant admin or matter owner and writes an `audit_events` row (`matter.conflict_cleared`).
- Tool: `check_conflicts` (read-only) so agents can run intake screening.

**Steps.**

1. Migration: pg_trgm extension + trigram indexes on `clients.name`; (no table changes).
2. Core module + normalization tests (fixture name variants).
3. Wire into `create_matter` tool + CreateMatter dialog (show hits, require acknowledge); clearing flow + audit event.
4. Verify: seeded tenant with overlapping names produces expected direct + positional hits; non-member sees redacted hit; clearing audited.

**Touched.** `packages/core/src/platform/conflicts.ts` (new), `packages/core/src/tools/matters.ts`, `packages/db` (extension migration), matters UI, `audit_events` enum value.

---

## Cross-cutting notes

- **Every mutating feature goes through `recordCommit`** — no plan above writes an artifact table directly. That is the product's core invariant.
- **Migrations**: each plan that touches schema runs `vp run --filter=@workspace/db generate` and checks the generated SQL in.
- **Dependencies between plans**: 6 depends on 2 (approvalPolicy); 8+9 phase 3 (escalation) ties into 2; 10 indexes 8+9's clauses; 8+9 and 5 are independent quick-startable.
- **Validation baseline for all**: `vp check`, `vp run typecheck`, `vp test` green; new core logic gets unit tests next to the module it lives in.
