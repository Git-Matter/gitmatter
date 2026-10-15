# Review setup and Word intake

**Status: Runtime-verified (local, bounded synthetic scope)** as of 2026-10-15. Authenticated staging,
broader Word/provider quality and pilot/release proof remain open. See
[the implementation evidence](evidence/2026-10-14-review-setup-and-word-intake.md).

[Sign-off checks on 2026-10-15](evidence/2026-10-15-review-workflow-signoff.md) cover the actual local
account/guide, live provider runs, native Word save/reopen and re-import. A discovered citation-page
defect was corrected without rewriting audit history. Staging registry authorization and a final
citation-label visual recheck remain open; the latter awaits an unlocked Mac.

Capture a firm's actual review instructions, guide a new lawyer through the first completed review,
and inspect incoming Word changes before allowing tracked editing or clean-output claims. These
three additions extend plans 02 and 03; the audit, approval and current-scope requirements remain
shared with plans 04–07. The [product research](research/2026-10-14-product-priorities.md) supplies the
evidence and tradeoffs.

## User outcome

1. Select an accessible matter and choose application model calls or the firm's connected agent.
2. Select an approved firm standard and upload the actual NDA.
3. Confirm the represented party, disclosure role, agreement structure, business purpose and
   governing-law context, including explicit unknowns.
4. See what the application inspected in the Word source and what is outside its text view.
5. Prepare a review with those inputs frozen, review cited findings, record human decisions and
   obtain the supported Word output or report.

The guided path never runs a paid model call or approves a standard automatically. A person makes
each execution and approval decision. Existing advanced Assistant, Library and matter workflows
remain available.

## Captured review instructions

Use a shared strict, bounded schema in `packages/contracts`. Capture represented party, the
client's receiving/disclosing/both/unknown role, mutual/unilateral/unknown NDA structure, business
purpose, governing-law context and optional additional instructions. Role and agreement structure
are separate. Unknown text values remain null; never infer legal instructions from a matter title.

New instructed reviews use snapshot revision 2. Existing revision 1 snapshots retain their
historical source and rules, with instructions explicitly not captured. Canonical request identity
includes normalised instructions, so a changed context cannot reuse the original request receipt.
Store preparation through the audit spine. A later instruction change prepares another review.

Cell, row and durable execution use the same captured context. Approved firm positions, clause
overrides, permission checks and human approval still apply. Unknown or conflicting inputs can
produce an inconclusive finding; a green flag must not erase an explicit inconclusive outcome.
UI, HTTP, MCP and reproducible reports expose the same captured inputs.

## Guided first review

Derive progress from current authorised server data. The shared read-only status covers selected
document-storage region, accessible matters, configuration-only provider readiness, historical
connection activity, approved nonempty firm playbooks, source preparation, captured instructions,
findings, pending human work and output readiness. A checklist click is never proof of completion.

Presence of a configured provider is not proof its credentials or service work. Recent connection
activity is historical, not proof an agent is online now. Show no credential values and do not
decrypt keys simply to populate readiness. Application spend controls do not cover an external
agent's subscription. Distinguish document storage from database, backup and provider processing.

An eligible human firm administrator approves a firm standard. Global system templates do not
count as the firm's approved standard. Reuse the current Library, settings and upload paths;
selection and pagination must respect current matter/document permissions. Expose incomplete
bounded lists rather than claiming no usable work exists.

Model or agent choice steers the next screen. A preferred model must still be configured and
available in the selector; an unavailable or pending choice blocks paid controls until an explicit
selection. Agent mode provides a clear tool handoff and requires an explicit switch before using
application model calls. It grants no additional permissions.

## Incoming Word inspection

Use one bounded shared inspector in `core/content/docx`. Store byte-bound inspection metadata with
each immutable version publication. Inspect legacy versions read-only; no GET backfills legal
metadata or invents a historical attestation. Preserve original bytes and source downloads.

Detect insertion/deletion markers across body and other Word XML parts, plus move, formatting,
extended-property and conflict revisions. Check archive structure and actual expanded size, reject
unsafe XML, and expose limited or uninspectable coverage. Body text uses supported paragraphs with
insertions included and deletions omitted. Headers, footers, notes, comments, layout and unsupported
rich body content are outside this review view. This extraction does not accept Word revisions.

Allow app-managed body changes only when every current pending binding matches the exact revision
content and audited version provenance. Uploaded/replaced wrappers do not become app proposals
because their IDs resemble existing edits. Compare actual operation bytes with a known recorded
source hash. Unsupported, incoming, incomplete or mismatched content cannot be proposed, resolved
or exported as clean through the application; direct users to inspect/resolve it in Word and upload
a new source.

Completion, report and export readiness use the same inspection rules. Cached inspection describes
the captured version; actual clean-export preparation and mutation guards verify current bytes.
Inspection never represents legal acceptance or universal DOCX compatibility.

## Engineering boundaries

| Workstream          | Ownership                                                                          | Integration                                                           |
| ------------------- | ---------------------------------------------------------------------------------- | --------------------------------------------------------------------- |
| Review instructions | Shared schema, snapshots/prompts/fingerprints, setup and frozen context view       | HTTP/MCP preparation, report and typed API                            |
| Guided review       | Read-only progress, first-review route, onboarding and matter entry                | Current authority, existing settings/upload, explicit execution route |
| Word inspection     | Shared inspector, version metadata, original-byte guards and notices               | Completion/export/report truth, schema migration                      |
| Coordination        | Existing plan updates, API/barrels, migration generation, global checks and review | One integrated revision with separate source/runtime/release evidence |

## Acceptance checks

- Different receiving/disclosing instructions remain distinct, normalised and immutable; legacy
  inputs stay unknown. Reusing a request with changed instructions conflicts.
- Cell, row and durable prompts and execution fingerprints contain the captured context; reports
  reproduce it without logging legal instructions to telemetry.
- Setup uses the same authorised firm-playbook list as the guide. Hidden, retired, system-only and
  inaccessible choices cannot create false readiness.
- Permission changes and out-of-scope requests cannot expose another matter, source or connection.
  Read progress does not create accounts, run models or publish legal content.
- Incoming body/non-body revisions, move/format/conflict markers, malformed/oversized archives,
  source-byte swaps and forged registry IDs fail safely. Supported app-generated multiple proposals
  and partial human decisions continue to work.
- UI shows explicit unknowns, invalid inputs, pending/failed preparation, current-draft inspection,
  captured-source differences and blocked output on desktop/mobile and keyboard paths.
- Run required format/lint/types/tests, web build, generated-reference/fixture and migration drift
  checks. Record authenticated, staging, real Word and legal-quality proof separately.

## Later product additions

Add a named reviewer/due-date handoff to plan 05, a personal work list to plan 06 and authorised
notifications to plan 07. Assignment does not grant access or replace the required approval role.
Prototype a deliberately selected partner/client brief from the existing report under plan 03;
preview shared content so internal strategy is excluded by default.

Full counterparty revision reconciliation, a native Word add-in and one external integration remain
pilot decisions. Measure actual NDA frequency, completed/usable Word work, human verification effort,
repeat use and willingness to pay under plan 08 before expanding the contract types or platform.
