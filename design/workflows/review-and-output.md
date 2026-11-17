# Inspect findings, decide and deliver

Person: reviewer, editor, owner, or read-only matter member. Object: exact review, captured document,
finding revision and proposed change. Entry: review table or document; return destination: same
row/filter/document context. Terminal: a named, attributable disposition and correctly identified output.

References: Legora cell evidence + Airtable record inspector + Figma pinned context + GitHub review.
Output confirmation also uses GOV.UK check answers and Stripe's durable-state distinction.

## State and action contract

1. Scan a table with consistent question/data types and explicit processing state.
2. Open a finding without losing the table's selected row, filters or scroll position.
3. Read the source quotation and captured version beside summary, applicable standard and proposal.
4. If the current draft differs, label it and preserve access to the reviewed source. Do not imply
   the current location is the exact old source location.
5. Separate “leave unchanged”, “escalate”, “propose change”, “approve finding”, and “accept tracked
   edit”. Use the actual server permission and revision gates for every action.
6. Preserve rationale and selected quote while a request is pending or rejected. Success requires
   the durable mutation/commit; a pending request is not an approval.
   Comparison keeps local drafts per review, document, column and finding revision. A newer finding
   starts with fresh inputs and exposes earlier unfinished input for comparison; it never silently
   applies the old rationale to new evidence. Navigation can retain or deliberately discard local
   input. Discard is disabled while the audit mutation is pending. An unchanged proposal retry keeps
   its request identity even after inspecting another finding.
7. Provide a correctly named tracked draft, source-bound report or clean output. Explain unresolved
   findings, edits, stale sources or required exact export approval at the output action.

## Recovery and accessibility

A missing/invalid citation blocks the action requiring evidence and explains how to recover.
Partial findings do not become a completed review. An uncertain paid run requires inspection before
retry. A drawer must have a programmatic title/description, readable semantic state colors,
keyboard close, correct focus return, and a narrow-screen reading layout.

Current owners: `ContractReviewWorkspace`, `CellDetailDrawer`, `ContractReviewActions`,
`ContractReviewCompletion` and document views. Existing synthetic scenarios cover partial, failed,
invalid, stale, complete, viewer, legacy, incoming Word and limited/unavailable Word inspection.

## Acceptance tasks

- Review a finding → open captured source → return to the same finding and table context.
- Propose from an approved clause/verified quotation; accept or reject the exact current revision.
- Stale source, invalid citation and viewer each reveal the right explanation without an unsafe action.
- A partial run shows which unit failed and never reports an invented whole-review success.
- Request output before/after required decisions; labels identify which file will be produced.
- Close the inspector with Escape and return focus to its originating item; repeat at 390px.

## Verified walkthrough and boundary

Six [CLI entry points](../../test/acceptance/design-workflows/README.md) and the
[replay record](../evidence/review-and-output.json) cover comparison/source/mobile return, failed and
pending saves, revised-finding recovery, the inspector/source focus round trip, permission and safety
states, proposal acceptance/rejection, manual document-input protection and clean-output approval.

The walkthrough combines Legora's evidence context, Airtable's inspector, Figma's precise return
context, GitHub's version-bound decisions and Stripe's explicit pending/applied lifecycle. Each is
adapted to gitmatter's audit and permission model; no private vendor app was copied or claimed tested.

Finding and document drawers have programmatic names/descriptions; the inspector round trip passes
at 1440px and 390px. Safe Word inspection is concise with expandable coverage. Incomplete, incoming
or unsupported Word revisions retain visible blocking explanations. Draft proposals and accepted
findings remain distinct, and deciding one finding does not falsely complete the remaining review.

These are internal cognitive walkthroughs of production React components with fictional API state.
They establish the listed interaction contracts, not representative-user usability, real authorization,
legal correctness, native Word transformations or production release acceptance. The output fixture
downloads fixed source bytes, deliberately not represented as a real clean export.

### Table-first representation

The review route starts with the matrix. Cell selection is URL-addressable, desktop inspection is
nonmodal and mobile inspection is modal. The explicit Document view preserves the workbench.
One revision-keyed draft store covers both views, with a single exit guard. Changing view or finding
is local navigation; it does not queue inference, publish, approve or complete legal work. Source
version identity remains visible, and flags remain distinct from human decisions.

Replay `review-table.js` for table default, cell comparison, shared rationale/proposal inputs,
source return, Escape/focus, responsive draft retention and zero execution attempts. Existing
workbench checks explicitly select Document and continue to cover denied, invalid, stale, failed,
resumed and output states.
