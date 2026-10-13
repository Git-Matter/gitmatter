# Close the review-to-redline loop (M1)

Deliver the first complete legal outcome: open a matter, run the firm's approved playbook on a
third-party NDA, read cited findings, propose a tracked change using an approved clause or fallback,
and export a redline with its audit trail.

**Status: In progress** (source and local checks verified 2026-10-13; staging and release
gates open).

The subscription-agent handoff already supplies a matter “review with your own AI” entry point,
cited cells, and proposed tracked edits. The connected Review contract action and finding-to-redline
flow now have connected source implementation below. Apply the [shared contracts](workflow-contracts.md)
throughout.

## Implementation progress (2026-10-13)

- **Implemented source:** immutable playbook/document/clause snapshots; explicit finding
  outcomes and quotation checks; audited human dispositions; version-bound/idempotent approved-clause
  redlines including anchored insertion; completion/readiness; guarded clean export snapshots; matter
  setup and finding actions. Responsive source/findings composition, quotation highlighting,
  approved-language preview, failed-rule retry, review-report/manifest downloads and expandable
  provenance are connected. Reviewed source and current draft are distinguished. Scoped approved
  Library reads require a verified matter context. Synchronous provider output is bound to its
  prepared source, rules and base cell revision before audited publication.
- **Supported boundary:** exact clean export covers one completed DOCX and makes no model call.
  Broader export scheduling/ceilings remain in plans 04–05. Final integrated checks and any findings
  from authenticated acceptance must be resolved before calling this source path ready.
- **Proof still open:** authenticated browser/staging, actual Word round-trip, representative provider
  quality, and pilot acceptance. Source/local integration does not close this plan.

## Audience, outcome, and scope

An associate reviews an incoming NDA against the firm's approved positions; a partner resolves
escalations; a scoped agent can do the same preparation through MCP. Success is a source-linked
review, intentional human decisions, and an export whose versions and changes can be explained.

The first release covers DOCX NDAs, one approved playbook, and selected matter documents. Each
document has independent findings and export readiness. Reuse the tabular runner, Library, tracked
DOCX engine, and audit export. Other formats may be reviewed where already supported, but disable
DOCX redlining with an explanation when editable DOCX is unavailable. Bulk portfolio analysis,
automated negotiation, and new redline engines are outside this slice.

## User journey and screen contract

1. **Start from the matter.** “Review contract” opens a compact setup panel: select/upload documents,
   choose an approved playbook, choose an entitled model, optionally state the client's position.
   Keep matter context visible. A viewer can inspect a review; an authorized editor can start one.
   Distinguish no documents, extraction pending/failed, no approved playbook, and unavailable model,
   with the corresponding upload/retry/Library/model action.
2. **Confirm inputs.** Show document versions, playbook revision, model, and any available cost
   estimate. Do not invent an estimate when the pricing path cannot calculate one. Start persists
   a review and input snapshot before inference; duplicate submission returns the same run. Until
   plan 04, explain that interrupted execution may need a retry.
3. **Read findings beside the document.** The list shows rule, risk, outcome, and disposition.
   Selection opens explanation, source quotation/location, standard position, fallbacks, and
   guidance. Citation jumps target the reviewed source version. If the document changed, show a
   notice and let the user open reviewed or current text. Provenance expands on demand.
4. **Choose a response.** Each finding offers “Propose redline”, “Leave unchanged” with rationale,
   and “Escalate” with note. Generated explanations are not human dispositions. Selecting a
   standard/fallback opens the exact original/replacement preview and approved clause revision.
   Missing clauses require a user-selected insertion anchor; multiple matches require selection.
   Never replace an arbitrary occurrence or pre-accept a proposal.
5. **Decide on a tracked change.** Use existing edit cards and accept/reject controls. Show “Proposed
   by” and “Resolved by” separately. Rejection returns the finding to needs attention and retains
   history; a replacement proposal is new work. Escalations remain open until a human records a
   decision. Plan 05 supplies the role and policy enforcement.
6. **Complete and export.** One completion panel lists unresolved findings, failed rules, pending
   edits, rejected proposals needing follow-up, and escalations. Derive readiness from persisted
   state. Offer distinct outputs below; downloading a review report does not resolve the document.

On mobile, explicitly switch Document / Findings, preserving selected finding/citation and focus.
Partial findings remain usable when another rule fails. Loading preserves layout. A permission
change produces a safe read-only/denied state, not an empty successful review.

## Findings and completion states

Keep three dimensions rather than one overloaded status:

| Dimension         | Values                                                                 | Meaning                              |
| ----------------- | ---------------------------------------------------------------------- | ------------------------------------ |
| Execution         | pending, running, succeeded, failed, cancelled                         | Whether the rule ran successfully    |
| Finding outcome   | conforms, deviates, not_found, inconclusive                            | What a successful review established |
| Human disposition | needs_attention, left_unchanged, redline_proposed, resolved, escalated | What the team decided                |

Risk remains a separate playbook value. `not_found` means completed search of prepared source,
with scope recorded; extraction failure cannot produce it. `inconclusive` requires judgment, not
fabricated support. Text citations store document/version, stable location where available, and
exact quote. Mismatched quotes fail validation and become inconclusive. Absence findings explicitly
state that no supporting quotation exists and identify the searched document/rule.

Accepting a redline resolves its finding only if reviewed source and proposed change still match.
Manual, unlinked edits do not silently resolve findings. Leaving a deviation unchanged requires a
human rationale; escalation requires an explicit resolution. Before plan 05, record decisions
without claiming a partner-role policy has been enforced. A succeeded inference run and a completed
human review are separate milestones.

## Proposed data and core contracts

- **Review snapshot:** run/review/matter ids, initiating actor, document version/source head,
  playbook id/commit plus immutable rules, clause/fallback ids/commits/bodies, model id, optional
  client position, timestamps. Keep confidential inputs in the review domain, not analytics/job
  errors. Retry uses the snapshot; changed inputs start a new run. Newly added rules do not join
  an existing run. Preserve an explicit seed revision for seeded Library items without commits.
- **Finding provenance:** stable finding id linked to cell, run, document version, rule, outcome,
  citations, severity, generation commit, disposition history. A cell rerun creates a finding
  revision; it cannot rewrite provenance under an existing redline.
- **Proposal provenance:** finding id/revision, reviewed source, expected draft head, rule/playbook
  snapshot, approved clause/fallback commit, anchor, actor, resulting edit/version/commit ids.
  Include references in commit metadata and audit export.
- **Operations:** proposed `startContractReview`, `getReviewCompletion`, `proposeFindingRedline`,
  `setFindingDisposition`, and existing document resolution/export operations. UI/MCP adapters
  expose the same core behavior. Dispositions commit against the review artifact.
- **Concurrency:** inside the commit transaction, validate expected draft head, finding revision,
  anchor compatibility, and clause availability. Known tracked edits from this run may advance the
  draft: preserve source-to-draft locations and allow another non-overlapping proposal after fresh
  preview. Overlapping edits, arbitrary source changes, or unresolvable mappings return
  `stale_source` with rerun/review-current actions. Do not require rerunning the whole playbook merely
  because its first non-overlapping redline was proposed.
  Deprecated or inaccessible clauses cannot be newly proposed; historical proposals retain their
  snapshots. Use request idempotency from the shared contract to prevent duplicate edits.

Inline playbook standards can explain a finding. The approved-clause redline action requires a
linked approved Library version; an unapproved inline fallback first enters the existing Library
approval lifecycle. Generated or draft wording cannot be labelled firm-approved.

The reviewed source version, current tracked draft, and export version are distinct. Citation reads
use the first; redline application checks the second; output records the third. Export captures one
immutable snapshot so concurrent editing cannot mix one version's text with another version's audit.

## Export contract

| Output              | Gate                                                                                                                               | Required content/label                                                                  |
| ------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Tracked-change DOCX | Editable source; generation succeeds; applicable export policy permits                                                             | Preserve pending edits; label “Draft redline” while findings/decisions remain open      |
| Clean DOCX          | Required rules succeeded; deviations have human dispositions; no pending edits/unresolved escalations; applicable policy satisfied | Accepted text at selected version, exporter and snapshot reference                      |
| Review report       | Findings exist and are readable                                                                                                    | Findings, limitations, source/playbook versions and dispositions; label “Review report” |
| Audit export        | Current matter read access and applicable export policy                                                                            | History, diffs, provenance, decisions and version references at captured cutoff         |

Clean export never accepts an edit as a side effect. An incomplete review can export a labelled
draft or partial report. Plan 05 may restrict those outputs; direct API/MCP requests enforce the
same gates. Before policy ships, show no enforced-approval badge. An export manifest connects output
version and audit cutoff without claiming cryptographic certification.

## Failure handling and permissions

- Preparation failure blocks that document and offers extraction retry. Provider/rate-limit failure
  retains completed findings and offers failed-rule retry against the same snapshot. Plan 04 adds
  recovery across process death. Do not rerun successful cells by default.
- Storage failure creates no version/edit/commit referencing missing bytes. DB failure after staging
  leaves a reclaimable unreferenced object. Display “Proposed” only after the edit and commit exist.
- Verify matter, review, document, playbook, and clause access with full token scope. Review read
  access does not confer source document write access. Agent resolution of edits stays forbidden.
- Deleted sources or revoked access block new mutations. Historical snapshots obey retention and
  read authorization; provenance cannot become an alternate path to confidential content.
- Failed analytics/audit-download delivery does not undo legal mutations. Failed exports have their
  own retry state and cannot appear as successful downloads.

## Delivery slices

1. Add snapshots, validated outcomes/citations, core disposition contracts, and server-derived
   completion/readiness. Migrate only the required review-domain fields.
2. Add Review contract setup and document/findings surface using existing matter/review components.
3. Connect finding → approved clause preview → tracked edit, including missing/ambiguous anchors,
   concurrency, provenance, and scoped MCP parity.
4. Add completion/output actions and audit provenance; execute NDA acceptance. Durable execution
   and policy enforcement remain the subsequent plans.

## Acceptance and exit gate

- **Happy path:** given plan 02's NDA and approved clauses, an editor starts review, opens findings,
  selects the intended fallback, proposes edits, and a human resolves them. DOCX contains expected
  OOXML changes; audit identifies source, rule, clause revision, proposer and resolver. Exercise
  authenticated browser and scoped MCP paths.
- **Missing/ambiguous text:** absence has explicit scope and insertion requires an anchor. Two
  matching passages require selection; only that passage changes.
- **Stale inputs:** conflicting source modification blocks proposal creation. Two non-overlapping
  findings on one document can produce two proposals from the same reviewed snapshot. Publishing
  another clause version does not substitute it into an existing proposal/report.
- **Partial failure:** a failed rule leaves siblings visible and blocks clean export. Retry cannot
  duplicate edits or decisions. Invalid quotes never appear as verified.
- **Decisions:** rejection retains history and needs an explicit follow-up disposition. Escalation
  creates no approval badge. Clean export cannot conceal pending edits or unresolved findings;
  draft export states its limitations.
- **Authorization:** viewer/editor/owner, unrelated tenant admin, scoped and out-of-scope agents
  have correct access. An agent cannot accept/reject edits.
- **Output proof:** inspect tracked/clean DOCX in Word; verify citation jumps, mobile/keyboard flows,
  and snapshot consistency during concurrent editing. Record local/staging/provider/pilot evidence
  separately and pass required repository checks.

Every mutation has a normal commit; every approved-clause proposal identifies the exact revision.
Close the plan only when the connected journey and scenarios have recorded evidence.

## Code areas and dependencies

`packages/core/src/ai/tabular/`, `content/{clauses,documents}.ts`, shared core/tools/contracts,
relevant DB schema/migrations, and matter/review/document UI. Reuse phase 3 of
[`../PLANS.md`](../PLANS.md).

Depends on [02's fixture/browser script](02-establish-product-truth.md).
[04](04-durable-background-work.md) adds durability; [05](05-approval-and-agent-queue.md) enforces
escalation and proposal policy.
