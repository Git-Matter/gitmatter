# Review setup and Word intake evidence

Date: 2026-10-14. Extends plans 02 and 03 under
[the accepted scope](../review-setup-and-word-intake.md). This records source and local proof;
it does not sign off authenticated staging, provider quality, Microsoft Word fidelity or release.

## Implemented behavior

- Review preparation captures represented party, disclosure role, NDA structure, purpose,
  governing-law context and optional instructions. Explicit unknowns remain unknown. New instructed
  snapshots use revision 2; historical revision 1 snapshots retain their original meaning.
  Context is immutable, audited, included in request identity, and shared by cell, row, durable
  execution, HTTP, MCP, the review workspace and reports. An explicit inconclusive result survives
  flag normalization.
- The first-review guide derives progress from currently authorized server data. It checks storage
  selection, configuration-only provider/connection metadata, approved firm standards, prepared
  sources, saved instructions, findings, human decisions and Word readiness. Bounded searches disclose
  incomplete results. It neither decrypts credentials nor treats connection history as an online
  guarantee. Existing settings, uploads, Library and Assistant paths remain available.
- Choosing a connected agent opens an explicit tool handoff. The production review controller does
  not request application model catalogs or estimates in this mode and blocks its paid execution
  controls until the user switches routes. Unavailable or unverified preferred models block Run
  until explicit selection of an available model.
- Shared DOCX inspection checks bounded archive/XML structure and revision markers across body and
  other Word parts, including move, format, extended-property and conflict changes. Inspection is
  byte-bound and published with immutable versions. Legacy reads inspect without writing history.
  App-managed body edits require matching content bindings and audited version provenance.
- Proposals, Word-edit resolution and clean output reject incoming, unsupported, incomplete,
  forged or mismatched sources. Export preparation verifies actual bytes inside the consistent
  capture. Human finding decisions remain independent of Word safety. Original downloads remain
  available; notices explain supported-body extraction and its coverage limits.

## Repository checks

| Check                                                 | Result                                                      |
| ----------------------------------------------------- | ----------------------------------------------------------- |
| `vp install`                                          | Passed before implementation                                |
| `vp test`                                             | 58 files, 314 tests passed                                  |
| `vp check`                                            | Passed after final UI changes: format, lint and type checks |
| `vp run typecheck`                                    | All 6 package tasks passed after final UI changes           |
| Fixture TypeScript project                            | Passed after final UI changes                               |
| Web production build                                  | Passed; existing bundle-size/dynamic-import warnings        |
| Generated MCP reference and NDA fixture checks        | Passed                                                      |
| Drizzle generation and repeated drift check           | Passed; no remaining schema changes                         |
| Local migration application                           | Passed                                                      |
| Independent integration review and `git diff --check` | No blocking findings; passed                                |

Migration `0018_warm_mauler.sql` adds nullable `document_versions.word_inspection` JSONB. No legacy
attestation is backfilled. Deployment must apply the migration before running the updated server.

New focused regressions cover instructions and idempotency, guide permissions and search bounds,
DOCX archive/revision inspection, source binding and provenance, proposals, extraction, completed
finding decisions with blocked clean output, reports and export authorization. The actual MCP
transport also verifies instructed preparation, completion/report context and changed-request
rejection. Engine integration tests use actual generated DOCX bytes; selected storage adapters are
mocked. The broader suite includes existing real database and object-storage journeys.

## Browser evidence

The isolated acceptance fixture mounts the production guide, setup, review controller, workspace
and Word notices. Its API data and permissions are fictional, it has no authenticated session,
execution endpoints fail closed, and downloaded Word bytes are fixed. Browser interactions verified:

- Known-but-empty instructions disable preparation with a useful message; explicit unknowns remain
  selected. Static role/structure choices support keyboard activation and single selection.
- Guided preparation saves context, opens the production review page with pending findings, and
  updates the guide's saved-instruction progress without claiming findings or decisions are done.
- Connected-agent preparation/handoff records zero model-catalog, estimate and execution requests.
  Direct unavailable-model navigation blocks Run; explicit available-model selection permits the
  control and requests an indicative estimate. No execution was dispatched.
- Missing provider configuration, approved standards and prepared sources show the relevant
  prerequisite and prevent guided preparation.
- Incoming, unsupported non-body and unavailable Word states explain blocked editing/clean output.
  Completed finding decisions do not make an unsafe Word source ready. Original-version links remain.
- At 390 × 844, setup choices wrap within 358 pixels and document scroll width equals the 390-pixel
  viewport. Desktop interactions also passed; the temporary viewport override was reset.

Local screenshots are kept under ignored `.scratch/review-setup-2026-10-14/`:
`captured-instructions-agent-mode.png`, `mobile-instructions.png` and
`incoming-word-inspection.png`. They demonstrate synthetic UI behavior only.

## Remaining proof

Run the authenticated acceptance journey on the current deployed revision, including migration,
permissions, actual uploads and reconnect/reload. Verify representative incoming and application
generated documents in Microsoft Word, provider output quality, and lawyer decisions. Complete a
real small-firm first-review pilot before claiming product adoption or willingness to pay.

The earlier [dev/staging record](2026-10-14-dev-integration-and-staging.md) describes its own dated
GHCR pull failure and runtime revisions. Local checks here do not resolve or supersede that runtime
evidence. A reusable authenticated staging account has not been established by this increment.

Full counterparty reconciliation, native Word integration, named reviewer handoff, a personal work
list and a client brief remain separate planned work. No numbered plan's wider release gates close
merely because this bounded source increment is complete.
