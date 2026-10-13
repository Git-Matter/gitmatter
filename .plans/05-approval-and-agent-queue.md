# Human approval and agent review queue (M3)

Make agent-assisted work acceptable under firm supervision: configurable matter approval policy,
append-only decisions, and one Agent activity queue per matter.

**Status: In progress** (source coverage reviewed 2026-10-13; final integrated checks and release
gates open).

The existing document guard remains: `resolveEdits` rejects
`actor.type === "agent"` in `packages/core/src/content/documents.ts`. Configurable policy,
append-only decisions, and the Agent activity queue now have source implementation. Apply the
[shared contracts](workflow-contracts.md). This specification refines sections 2 and 6 of
[`../PLANS.md`](../PLANS.md); their candidate designs are not separate approval systems.

## Implementation progress (2026-10-13)

- **Implemented source:** audited matter policy for agent cells and finding/escalation
  decisions; staged cell content; exact append-only human decisions; actor-bound idempotency;
  concurrent decision protection; atomic compatible batches; queue/settings/decision diff UI; shared
  core publication guards for firm playbooks; typed matter-workflow create/update proposals;
  document editor/owner decisions with a separate accepted baseline and append-only evidence;
  compatible cell batch selection/confirmation; exact single-DOCX clean-export requests and
  requester-bound approved retrieval. Document resolution remains human-only. Legacy pending edits
  retain factual provenance and require current human resolution before becoming an accepted
  baseline; migration does not fabricate historical approvals.
- **Remaining source:** broader export manifests, document-count/provider-cost ceilings and large
  export approval scheduling. The implemented renderer covers exactly one stored DOCX with zero
  incremental model cost; its policy UI exposes that supported gate only. Expanded queue filters
  and cross-matter coordinated approval remain outside the NDA slice.
- **Proof still open:** authenticated browser/mobile/keyboard, staging/MCP matrix, upgrade/rollback,
  Word/provider and pilot acceptance. Cell approval tests do not prove the broader approval model.

## Audience, outcome, and scope

An associate sees what an agent proposed and prepares a decision; a partner sees exact wording,
source, approved firm position, and rationale before signing off. A matter owner configures policy.
Success means approved state cannot change without the required human decision, and history answers
who proposed, who decided, what they saw, and which policy applied.

Start with typed proposals for document edits, review/tabular cells, workflow/playbook changes, and
escalation decisions. Include policy-gated export requests. Reuse existing linear commits rather
than generic pending commits or artifact branches. Cryptographic signatures, multi-stage committee
routing, email approvals, and configurable business-process builders are deferred.

## Policy contract and authority

Add a versioned `matters.approvalPolicy`, with independently selectable gates:

| Action                              | Policy choice                                                                | Minimum decision authority                                   |
| ----------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------ |
| Agent-proposed document edits       | Human resolution always; optional owner approval                             | Editor with document write access, raised to owner by policy |
| Red/yellow findings and escalations | Human disposition or required owner decision                                 | Eligible human editor/owner according to gate                |
| Agent review/tabular cell writes    | Direct or human review required                                              | Editor, or owner when configured                             |
| Matter workflow/playbook changes    | Direct or human review required                                              | Editor/owner within the matter                               |
| Exports                             | Allow within limits or require approval above configured cost/document count | Role configured for that matter                              |

“Direct” never grants extra access and never lets agents resolve document edits. Existing human-only
resolution is an invariant in every mode. Risk labels follow the playbook rule and cannot be lowered
by an agent to evade a finding gate. Direct agent writes are still commits with agent attribution.
Human content editing remains available to authorized editors; mandatory escalation/export rules
apply regardless of who initiated the action so a human route cannot bypass them.

Only a current human matter owner can change matter policy. Firm-wide Library publication still
requires existing tenant-admin approval; matter policy cannot grant that power. A tenant admin
without matter access cannot read its queue or approve its content. Artifact ownership alone cannot
satisfy a matter-owner gate.

A document can be linked to multiple matters through `matterDocuments`; do not rely only on its
origin `documents.matterId`. Compute policy over every affected current membership for shared-content
mutations. V1 fails closed when that set crosses the actor's authorized scope or requires approvals
from distinct matter contexts: offer an authorized independent document copy rather than allow
one matter's decision to change another's approved text. Return a generic additional-policy message
without leaking hidden matter names. Unlinking a governed document must not bypass pending policy;
retain its captured context until decisions are invalidated/revised. Cross-matter coordinated
approval is deferred.

## Queue and decision flow

1. **Agent activity in the matter.** Show Needs decision first, with filters for kind, document,
   author, and risk. Each row includes proposal type, target, concise change description, proposer,
   age, and blocking reason. Derive the pending count from readable items; no hidden-matter counts.
   Empty state says there is nothing awaiting review, not that no agent has ever worked here.
2. **Inspect one proposal.** Open a side panel beside the source/document with exact before/after,
   finding quotation/version, playbook/clause provenance, agent rationale, and applicable policy.
   Distinguish proposal draft from approved content. History and prior decisions expand on demand.
   On mobile, switch Proposal / Source; do not hide the decision context below a narrow diff.
3. **Decide.** Eligible humans can Approve/apply or Reject. Reject and escalation resolution require
   a note; approval note is optional unless policy requires it. Show the effect before applying.
   A non-approver sees the required role and can prepare/escalate, with no enabled approval control.
   A stale proposal offers Review current version / Create revised proposal, never blind approval.
4. **Confirm result.** Display actual commit/decision state and actor. On network uncertainty,
   recover the request receipt before allowing another decision. A succeeded worker is not an
   approval. Resolved items remain available under history filters.
5. **Review a batch.** Allow only items sharing matter, kind, policy revision, source/base context,
   and required decision authority. Show exact item count and decision effect in one confirmation.
   Proposed v1 cap is 50 items; server enforces it. Validate every item atomically; if one is stale
   or unauthorized, apply none and identify only failures the user may read. Preserve individual
   decision entries. Overlapping document edits cannot be batch-applied unless the engine validates
   the combined resulting DOCX; otherwise require separate decisions.

Keyboard users can inspect source and diff, enter a note, and decide without losing selected item.
Risk and approval status have text labels. Long clauses can expand. Permissions, server conflicts,
partial job results, and empty filters have distinct states rather than a disabled unexplained list.

## Proposal lifecycle and approval binding

| State     | Allowed next state                  | Approved content effect                              |
| --------- | ----------------------------------- | ---------------------------------------------------- |
| Pending   | Applied, rejected, withdrawn, stale | None                                                 |
| Applied   | Terminal                            | Approved content changed in the decision transaction |
| Rejected  | Terminal                            | None; rejection retained                             |
| Withdrawn | Terminal                            | None; withdrawal retained                            |
| Stale     | Terminal; create a new revision     | None                                                 |

A correction creates a new immutable proposal revision linked to the prior one. Never rewrite text
under an approval. Withdraw is allowed to the authorized proposer or an eligible human before a
terminal decision and creates a lifecycle commit. Source changes, incompatible policy changes,
revoked clause approval, or material finding reruns invalidate the affected proposal.

Each append-only decision binds proposal id/revision/commit, canonical proposed-content hash, base
artifact content revision, source version, captured and current policy revisions, approver, decision,
note, and timestamp. Applying decisions rechecks live permission and content under locks. Two
reviewers race: one decision applies; the other receives the terminal result/conflict, with no second
mutation. The decision idempotency key makes a retransmitted identical request safe.

A proposal lifecycle commit itself advances audit head. Therefore distinguish the base approved
content revision from audit head: unrelated proposal/audit entries must not falsely stale all other
proposals. Track the exact relevant content/policy paths and source version; actual conflicting
content changes invalidate approval. Document tracked drafts additionally validate expected draft
version and edit overlap, as specified in plan 03.

## Typed staging and data model

- **Documents:** retain pending `document_edits` and immutable draft versions. Add an explicit
  accepted/approved baseline pointer or equivalent version manifest before claiming that policy
  protects approved document state. `currentVersionId` currently represents the latest tracked
  draft; it must not be silently redefined. Views/exports distinguish reviewed source, tracked
  draft, and approved baseline. Applying/rejecting edits creates the normal resolution version and
  atomically records the decision; unapproved changes cannot leak into clean export.
- **Tabular/review:** store typed proposed content/citations separately from accepted cell content,
  with proposal identity/lifecycle. Keep inference status separate from approval status; adding a
  single `proposed` execution status is insufficient. Proposal diff paths never overwrite accepted
  cell paths. Apply copies validated staged content into accepted fields through `recordCommit`.
- **Workflow/playbook:** typed proposal records store proposed fields/rules, base revision,
  provenance, actor and lifecycle. Apply uses the existing workflow mutation path. Firm-wide
  publication retains its admin gate even if an owner approves matter use.
- **Escalations:** decisions link finding revision and reviewed source; resolution records selected
  position/rationale and satisfies the specific policy gate. Closing a queue row is not enough.
- **Exports:** an approval authorizes exact output kind, document version set, audit cutoff,
  document count and cost ceiling, under captured policy. Reusable access permission is not an
  export approval. Replaying one approved request returns its same result; different inputs or
  exceeding the approved ceiling require a new decision. Unknown required cost estimates fail
  closed; plan 07 supplies additional estimation and cap controls.
- **commit_approvals:** append-only decision metadata linked to proposal and decision/application
  commits. Enforce one terminal outcome per proposal revision plus request uniqueness. Bind note,
  hash and policy snapshots; no destructive update of prior decisions. A future multi-approver model
  needs a new contract rather than overloading a unique commit/approver pair.
- **Policy history:** add a `matter` audit artifact/head and access handling for policy commits.
  Scope its first operations to policy revisions; unrelated matter features need no redesign.
  Include contracts, `HEAD_TABLE`, history/blame and audit-export support;
  do not write policy straight to JSON and rely on the buffered security log. Existing matters
  receive an explicit migration baseline without fabricating historical approvals.

Required decisions and application commits share one transaction using plan 04's composition.
For document batches, persist one validated output version plus the individual decision records.
Commit attribution is the human who applies/rejects; metadata links original agent and proposal.
Rejection is durable audit work even though approved content is unchanged.

## Core, tools, and policy changes

Implement shared proposed operations `getApprovalPolicy`, `setApprovalPolicy`, `listProposals`,
`getProposal`, `decideProposal`, and `decideProposalBatch`, plus typed staging at every existing
mutation entry point. Apply the same guards to chat, direct API, MCP and workers. Agent callers can
list/read authorized proposals and create/withdraw their own; approval is human-only in core,
regardless of the originating user's owner role. Any human-only decision tool is excluded from
agent tool catalogs; hiding a button or tool is insufficient enforcement.

Decision input includes request id, proposal id/revision/hash, expected base content revision,
policy revision, decision, and note; the server loads all evidence itself rather than trusting
client-supplied policy or role. Return decision/application commit ids or a typed conflict.
`listProposals` uses permission-filtered server queries, bounded page size, stable cursor ordering,
and kind/status/risk filters. Index matter + lifecycle + timestamp; queue counts use the same
authorization predicate. Avoid loading all proposals into the client to hide unauthorized rows.

Changing policy records actor/revision/reason and summarizes affected pending work. Never silently
grandfather queued jobs. At claim/apply, evaluate captured and current policy: weakening policy does
not auto-apply pending proposals; strengthening requires re-review against the new requirement.
Already applied history stays intact. Pending decision context displays “Policy changed” and needs
explicit revision/revalidation. Library deprecation similarly requires new clause selection for
new applications while retaining prior evidence.

Revoked membership/token scope blocks new staging/application and retrieval. A terminal approved
artifact is still readable only through normal access checks. No notification, queue count,
provenance detail, or decision note may disclose another matter. Error/log/analytics handling follows
the shared content-free contract.

## Delivery slices and migration

1. Introduce audited policy revisions, proposal/decision contracts, typed staging, and accepted-state
   semantics. Default migration preserves current behavior: agent document resolution remains
   forbidden and other writes remain direct until the firm enables their gates.
2. Enforce policy in shared core paths and workers; add atomic decision/application and exact export
   authorization. Test server bypasses before exposing settings that promise enforcement.
3. Add matter policy settings, queue, decision panel, statuses across document/review/history, and
   safe batch flow. Extend `show_commit`, history, and audit export with decisions/provenance.
4. Migrate existing pending document edits as legacy proposals with factual known provenance;
   missing binding data requires human review, never automatic approval. Stage upgrade/restart tests.
   Rollback must retain gated proposals and approved baselines; disable mutations if old code cannot
   enforce the stored policy, rather than revert to direct writes.

## Acceptance and exit gate

- **Gate all entry points:** under review-required policy, UI/chat/MCP/worker agent writes leave
  accepted document/cell/workflow content unchanged and create attributable proposals. Direct
  mode retains attribution and cannot enable agent document resolution.
- **Exact decision:** a human approves the displayed revision. Content, decision, diff, actor,
  policy, and provenance commit atomically and appear in history, `show_commit`, and audit export.
  Modified content/hash/source before submission returns stale and applies nothing.
- **Reject/withdraw:** approved content remains unchanged; lifecycle commits and notes remain
  visible. A later revised proposal does not inherit prior approval.
- **Concurrent/replayed decisions:** two reviewers and duplicate request delivery produce one
  terminal application. Inject DB/storage failure; no approval exists for missing/unapplied bytes.
- **Authority matrix:** viewer cannot mutate; editor can stage and decide only permitted gates;
  owner manages policy; tenant admin retains Library authority but no confidential matter override.
  Test restricted role, out-of-scope and revoked tokens, including agents owned by a matter owner.
- **Cross-matter source:** a governed shared document cannot evade policy via another matter,
  unfiled route, or unlink operation. Denial reveals no hidden matter content or membership.
- **Policy/source drift:** stronger and weaker policy changes both require explicit pending-context
  review; workers cannot apply an old authorization. Library deprecation and finding rerun invalidate
  affected pending decisions, while applied history and other unrelated proposals stay intact.
- **Batch:** compatible items yield individual decisions atomically; a stale, overlapping or
  unauthorized item prevents the batch. Incompatible context and cap overflow are rejected.
- **Exports:** pending text stays visibly draft; clean export uses accepted baseline. Changed
  document set, cost ceiling or policy cannot reuse old export approval through any transport.
- **Browser proof:** complete one proposed redline and one cell proposal via keyboard/mobile and
  desktop, verify notes/diffs/role explanations/reconnect, and record authenticated staging evidence.
  Pass migrations, repository checks, and scoped MCP parity before closing the plan.

## Code areas and dependencies

Core commit/access/policy, document/tabular/workflow mutation paths, tools/audit, DB matter/policy/
proposal/approval schemas, contracts, and matter activity/settings/history UI.

Enforces [03's escalations and export readiness](03-review-to-redline-loop.md), uses
[04's transaction/worker boundaries](04-durable-background-work.md), and feeds
[06's matter workspace](06-matter-workspace-and-search.md). Evidence tiers come from
[08](08-pilot-program-and-release-proof.md).
