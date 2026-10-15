# NDA browser acceptance script

Run against local and staging separately, using `packages/core/test/fixtures/nda/` and authorised
synthetic Word variants. These checks are requirements, not executed results. Automated engine
tests and the isolated UI fixture do not establish authenticated browser, provider-quality or
Microsoft Word acceptance. Record credentials only through the project's approved secret workflow;
never put their values, client paper or authentication screens in evidence.

## Setup and evidence

1. Record the required repository checks for the tested revision: `vp install`, `vp check`,
   `vp run typecheck`, `vp test`, `vp run docs:tools:check` and `vp run fixtures:nda:check`.
   Start local with `vp run dev` when exercising that environment.
2. Before staging acceptance, verify the actual running image digest/revision and startup
   migrations, including `0018_warm_mauler` and `document_versions.word_inspection`. A successful
   GitHub redeploy trigger or health response alone does not prove either. A blocked image pull
   leaves the staging journey unexercised; record the deployment failure separately.
3. Sign in with an isolated test account. Create a synthetic client and matter. Record environment,
   revision, browser, date/timezone and opaque matter/document/review ids. Confirm the selected
   document-storage region separately from database, backup and model-processing information.
4. In Library, prepare the fixture's four-rule playbook from `manifest.json` and have an eligible
   human firm administrator publish it. Publish the term standard/fallback and compelled-disclosure
   standard clauses needed for the redline tests. Record ids and head commits. Fictional examples,
   system templates and unapproved drafts do not become the firm's approved positions automatically.
5. Record whether findings will be authored fixture results from a connected agent or actual
   application-provider inference. Confirm the configured execution route and its spend scope.
   Do not record cookies, MFA enrollment, passwords, recovery codes, provider keys or bearer tokens.
   Capture screenshots only after authentication, using synthetic documents only.

## Browser journey

| Step                       | Action                                                                                                                                                                                                                                                                          | Required observation                                                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Guided entry               | Open `/first-review` after onboarding or from the matter overview; select the synthetic matter.                                                                                                                                                                                 | Readiness reflects current access, storage selection, provider/connection metadata, approved standards and saved work. Incomplete bounded searches are disclosed. Opening a step does not run a model or mark work complete.                                                                                      |
| Execution route            | Choose Application model or Connected agent.                                                                                                                                                                                                                                    | Application calls identify the configured provider/key source and application AI limits. Agent subscription costs remain separate. Agent mode provides a handoff, requests no application model catalogue/estimate and requires an explicit switch before application inference.                                  |
| Upload and read            | Upload `source.docx` through the guide, then inspect the document.                                                                                                                                                                                                              | Extraction reaches ready and all five paragraphs match `source.md`. Inspection identifies the current version and text-view coverage. The original remains downloadable; readiness does not imply legal approval.                                                                                                 |
| Instructions               | Choose the approved fixture playbook/source and capture represented party, disclosure role, NDA structure, business purpose, governing-law context and optional instructions.                                                                                                   | Explicit unknowns remain unknown; known-but-empty required text blocks preparation. Disclosure role and mutual/unilateral structure remain separate. Preparation creates four pending rule findings without running inference.                                                                                    |
| Immutable capture          | Open the prepared review, reload it and download its report/manifest. Prepare a separate review with changed instructions.                                                                                                                                                      | Snapshot revision 2 preserves the exact instructions, source version and playbook/clause revisions across UI, MCP and report. Changed instructions do not rewrite the earlier review; changed input cannot reuse an identical request receipt. Historical revision 1 reviews report instructions as not captured. |
| Cited findings             | For plumbing, have a scoped connected agent inspect `get_review` and author the manifest findings through `write_cell`, explicitly labelled fixture results. For provider quality, explicitly select a configured model, inspect its estimate and run actual inference instead. | Compare each result with the fixture: purpose conforms; term and compelled disclosure deviate; return/destruction is explicitly not found without an invented quotation. Record deviations or inconclusive results rather than inserting expected output into a provider-quality run.                             |
| Open finding               | Select each material finding and follow its source quotation.                                                                                                                                                                                                                   | The captured source, outcome, quotation, rule, rationale and actor/blame are visible. Invalid citations and changed current sources are explained; current-draft inspection does not replace captured-source provenance.                                                                                          |
| Propose from finding       | For term and compelled disclosure, use Propose tracked change: choose the approved clause and exact verified quotation, inspect the replacement preview, supply a rationale and click Propose redline. Exercise scoped MCP proposal separately if included in the pass.         | Pending edits bind to the exact finding/source/clause revisions with attributed history. They remain proposals until an eligible human decides them; agent-supplied text cannot silently become an approved standard or decision.                                                                                 |
| Tracked Word output        | Download Draft redline while both edits are pending; open the actual downloaded file in desktop Microsoft Word.                                                                                                                                                                 | Both intended insertions/deletions are visible at the correct locations. Record Word application/version and observed formatting, numbering, tables, comments, headers and notes. An XML inspection or browser preview alone does not satisfy this row.                                                           |
| Human decisions            | Follow Resolve tracked changes. Accept the term change and reject the disclosure change, then reload. Give the rejected finding and absent return/destruction clause an explicit current decision or escalation.                                                                | Accepted wording becomes three years; rejected wording stays original. Decisions identify the eligible human and persist. Rejected or escalated findings remain open until addressed; finished decisions and Word-output safety are reported separately.                                                          |
| Clean output and audit     | Address remaining findings/edits/approvals, request clean export and obtain any exact export approval required by current policy. Download the review report/manifest and matter audit CSV/DOCX.                                                                                | Clean output is available only for supported current DOCX bytes and accepted baseline with current decisions. Required export approval binds to the exact manifest. Source, instructions, findings, proposals and decisions retain commit references and authors.                                                 |
| Word round-trip and resume | Open the actual clean DOCX in Word, inspect it, save, close and reopen. Reload the application's matter, review and document views.                                                                                                                                             | Intended accepted/rejected wording and representative formatting survive; no pending revisions are disguised as clean. Saved artifacts and human decisions remain accessible without unfinished work appearing complete. Record any fidelity limitation separately.                                               |

## Incoming Word inspection

- Upload authorised synthetic variants containing incoming body insertions/deletions, non-body
  revisions in headers/footnotes/comments, and unsupported move/format/conflict or complex-field
  content. Include an invalid or uninspectable file. Record each file's actual observed result;
  generated XML fixtures alone do not establish desktop Word fidelity.
- Check that notices distinguish the supported body text view from the original document and
  explain omitted regions. Incoming or unsupported revisions must not inherit app approvals because
  their ids resemble existing changes. Unsafe, incomplete or mismatched bytes must block relevant
  proposals, resolution and clean output even after finding decisions are complete.
- Verify the original download remains available. Resolve external revisions in Word and upload a
  new baseline when directed; confirm old approvals do not authorise a changed source. A legacy
  version read must not invent an audited historical inspection or approval.

## Failure and authorization passes

- Upload an invalid `.docx`; rejection or extraction failure is visible and retry is available when
  relevant. No extraction-ready event is emitted for a failed file.
- In an isolated account/environment, try missing provider configuration, an unavailable preferred
  model and a failed provider call. Paid controls must not silently choose another model; pending
  or failed rules must not appear as successful findings or make clean output ready. Record actual
  usage and held uncertain charges without credential values.
- Propose a find string absent from the source. A failure is visible; document head/version count
  does not change; `redline_failed` identifies validation without raw text.
- Ask the agent to resolve its own edits. The tool is absent from the subscription catalog and the
  engine rejects agent resolution.
- A viewer cannot mutate; a token restricted to another matter cannot read or write this matter.
  Run the existing scope tests as well as checking the UI.
- Queue application review work, disconnect/reload and observe job status and retained results.
  With authorised operational access, test a worker restart and permission revocation separately.
  Successful rules must survive; retry failed rules only. Unknown prior provider outcomes require
  acknowledgement of possible additional charges before retry, not an automatic paid replay.
  Record job ids, attempts, known/held usage, terminal inbox updates and absence of duplicate legal
  mutations. Browser reconnection alone does not prove recovery after a worker loss.
- Verify revoked membership or connection scope prevents subsequent protected reads/writes and
  decisions. Changed source, policy or proposal content must not reuse stale approvals.

## Result record

Record each check as passed, failed or not exercised, with the tested revision, actual environment,
opaque artifact/job/proposal ids and sanitised observations. If a prerequisite blocks execution,
state the blocker and leave dependent checks unexercised. Keep local, authenticated staging,
desktop Word, live provider-quality and lawyer/pilot outcomes separate. Authored fixture findings,
passing CI, screenshots and this checklist do not substitute for the corresponding runtime proof.
