# NDA browser acceptance script

Run against local and staging separately. Use only the synthetic pack in
`packages/core/test/fixtures/nda/`; never use client paper or a real provider key in recorded evidence.
This script is intentionally a human-in-the-loop browser script: the current UI has separate screens
and a connected subscription agent supplies its own findings. Automated engine checks do not prove
this user journey or model quality.

## Setup and evidence

1. Run `vp install`, `vp check`, `vp run typecheck`, `vp test`, `vp run docs:tools:check`, and
   `vp run fixtures:nda:check`. Start local with `vp run dev`.
2. Sign in with an isolated test account. Create a synthetic client and matter. Record environment,
   tested revision, browser, date, and opaque matter/document/review ids in the acceptance record.
3. Create the fixture's four-rule playbook from `manifest.json` and approve it as a person. Create
   the term standard and fallback in Library; record their ids and head commits.
4. Do not record auth cookies, MFA enrollment, passwords, recovery codes, provider keys, or bearer
   tokens. Capture screenshots only after authentication, using synthetic documents only.

## Browser journey

| Step           | Action                                                                                                                                                                                                                                                            | Observable acceptance                                                                                                                                                                                                   |
| -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Upload         | Open the matter and upload `source.docx`.                                                                                                                                                                                                                         | Document appears; extraction transitions to ready; failures have an error and retry.                                                                                                                                    |
| Read           | Open the source document.                                                                                                                                                                                                                                         | All five paragraphs match `source.md`; viewer renders without a crash.                                                                                                                                                  |
| Playbook       | Library → Playbooks → fixture playbook → Run; choose the matter and source document.                                                                                                                                                                              | Review is created with four columns and one source document; pending cells are not presented as finished findings.                                                                                                      |
| Cited findings | From the matter's agent handoff, let a scoped subscription agent read the document and write the four authored fixture findings using `write_cell`. Alternatively run the firm's model and compare results to the fixture rather than inserting expected results. | Purpose is green; term and compelled disclosure are red; return/destruction explicitly says not found with no invented citation. Authored fixture cells are labelled as fixture acceptance, not model-quality evidence. |
| Open finding   | Open each completed cell and follow its citation.                                                                                                                                                                                                                 | Summary/reasoning, source quote, and actor/blame are visible. Source document opens; `finding_opened` emits once per user open with identifiers only.                                                                   |
| Propose        | Have the scoped agent call `propose_document_edit` with the two exact manifest replacements and explicit synthetic-policy reasons.                                                                                                                                | Source document shows two pending tracked edits with attributable history. A person must resolve them. Finding-to-redline one-click UI and automatic clause provenance are plan 03 work, not acceptance claims here.    |
| Export redline | Download the current DOCX while changes are pending.                                                                                                                                                                                                              | DOCX opens with both insertions/deletions in Word; `document_exported` appears only for the download, not inline preview. Keep Word verification as a separate recorded result.                                         |
| Resolve        | As a person, accept one change and reject the other, then reload.                                                                                                                                                                                                 | Decisions persist; accepted term is three years; rejected disclosure retains original wording; history identifies the human decision.                                                                                   |
| Audit          | Export the matter's audit CSV and DOCX.                                                                                                                                                                                                                           | Source extraction, review/cell commits, proposals, and human decisions appear with authors and field-level changes.                                                                                                     |
| Resume         | Reload matter, review, and document views.                                                                                                                                                                                                                        | Artifacts and decisions remain accessible; no completed state obscures pending work.                                                                                                                                    |

## Failure and authorization passes

- Upload an invalid `.docx`; rejection or extraction failure is visible and retry is available when
  relevant. No extraction-ready event is emitted for a failed file.
- Try a provider run with no configured provider in a separate test environment. A visible failure
  is required; no `playbook_completed` event may follow that failed run.
- Propose a find string absent from the source. A failure is visible; document head/version count
  does not change; `redline_failed` identifies validation without raw text.
- Ask the agent to resolve its own edits. The tool is absent from the subscription catalog and the
  engine rejects agent resolution.
- A viewer cannot mutate; a token restricted to another matter cannot read or write this matter.
  Run the existing scope tests as well as checking the UI.
- Disconnect/reload during a run and record the observed behavior. Durable recovery is plan 04;
  report any gap instead of marking it as passed.

## Result record

Record each row as passed, failed, or not exercised; include a synthetic screenshot or opaque artifact
id for failures. Separate local, staging, Word, provider-quality, and pilot results. A checklist file
alone is not runtime proof. Source and engine verification do not satisfy this browser gate.
