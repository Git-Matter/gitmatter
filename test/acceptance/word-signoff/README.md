# Native Microsoft Word acceptance pack

All content and authors are fictional. This pack is terminal preparation, not a passed Word,
staging, provider-quality, legal-quality or pilot gate. It deliberately includes formatting,
numbered paragraphs, a table, comments, a header/footer, and referenced footnotes/endnotes.

Regenerate from the repository root without loading environment files:

```sh
bun --no-env-file test/acceptance/word-signoff/generate.ts
```

Verify the prepared assets without regenerating or replacing files already opened in Word:

```sh
bun --no-env-file test/acceptance/word-signoff/verify.ts
vp exec tsc --project test/acceptance/word-signoff/tsconfig.json
```

The verification checks hashes, exact supported body views and that the pure engine left every
non-body package part byte-identical. For an explicitly selected synthetic Save-As copy, pass its
path and the expected fixture path to `verify.ts`; it reports bounded inspection and body-match
results without dumping source text or Word author metadata. Exact and whitespace-normalized
body comparisons are reported separately: Word can append an empty final paragraph after a table,
which adds a trailing newline to the supported body view. Record that difference rather than
silently calling the body or bytes unchanged. Visual layout remains a native check.

`manifest.json` binds each file to its SHA-256 and records actual inspector results. The `.body.txt`
files show the engine's supported body view, which excludes header/footer, note/comment content,
number labels and layout. A clean inspection means no supported revision markers were detected;
it is never a human legal approval.

## Files and provenance

| File                                      | Native Word task                                                                      | Expected application behavior after uploading as a new source                             |
| ----------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------- |
| `01-clean-styled-nda.docx`                | Inspect styled headings, numbered clauses, bold term, table, comment and all stories. | Supported clean source. No revision claim about legal approval.                           |
| `02-incoming-body-revisions.docx`         | All Markup shows the counterparty's five-to-three-year replacement.                   | Incoming markers; block tracked proposals/decisions and clean output.                     |
| `03-incoming-nonbody-revisions.docx`      | Inspect header, footer, footnote/endnote panes and comment for tracked changes.       | Limited coverage; block proposals/decisions and clean output, preserve original download. |
| `04-incoming-formatting-revision.docx`    | Show formatting markup; confirm a tracked italic change.                              | Unsupported formatting revision; block editable/clean claims.                             |
| `05-engine-two-pending-proposals.docx`    | Both manifest replacements appear as independent tracked changes.                     | Incoming when uploaded. Pure engine bindings are not application audit records.           |
| `06-engine-partial-human-acceptance.docx` | Term is three years; disclosure change remains tracked.                               | Incoming when uploaded; no invented human decision or accepted baseline.                  |
| `07-engine-mixed-decisions-clean.docx`    | Term three years; disclosure original wording; no remaining revisions.                | Supported clean source if Word has not introduced unsupported content.                    |
| `08-engine-all-accepted-clean.docx`       | Both expected replacements; no remaining revisions.                                   | Supported clean source if Word has not introduced unsupported content.                    |

The `engine-*` files are outputs of the same pure transformation helpers, without database or
storage publication. They cannot prove the deployed proposal/approval journey. For that proof,
upload `01`, prepare and run the staging review, propose the exact two replacements from the
existing NDA manifest, and download the application's actual tracked and resolved versions. Keep
the opaque version/commit/proposal IDs and file hashes in the acceptance record.

## Native Word checklist

Use the installed Microsoft Word desktop app. Installation metadata observed on 2026-10-15:
bundle `com.microsoft.Word`, version `16.110.3`, build `16.110.26070318`. This does not prove that
Word launched, is licensed, or opened any file successfully.

1. Open a copy of each test file. Record whether Word shows a repair, conversion, corrupted-content
   or unsupported-format warning. A repair prompt is a failure to investigate, not a silent pass.
2. Select Review → All Markup. Enable insertion/deletion and formatting markup. Open the Reviewing
   Pane. Count and inspect the actual changes rather than relying on color or the application badge.
3. For `01`, inspect the numbered list, headings, bold term paragraph, table, comment anchor,
   header/footer and note references. Compare the native body to the corresponding `.body.txt`,
   recording expected exclusions rather than claiming a complete Word-text extraction.
4. For `02` and `05`, inspect the exact old/new term and disclosure wording. Existing unrelated
   body text, numbering, styles, table, comments and other stories must remain intact. Do not accept
   changes while merely opening or saving.
5. For `03`, open header/footer editing and the note/comment panes; ensure their revision markers
   are actually visible. The application's limited-coverage warning must remain true after upload.
6. For `04`, verify formatting revision markup and its before/after styling, then verify application
   editing and clean output remain blocked.
7. Check `06`, `07` and `08` against their exact expected text and remaining-change state. For the
   actual staging downloads, verify author, source version and human decision history independently
   in the application; terminal filenames do not establish provenance.
8. Save each opened document **as a new local copy**, close it and reopen that copy in Word. Preserve
   originals and pre-save hashes. Record the post-save hash, warning state, text, markup counts and
   layout. Word may rewrite package metadata, so different hashes alone do not imply content loss.
9. Re-upload only an explicitly selected Word-saved copy as a new source. Check current-version
   inspection and preserved original; unresolved incoming changes must still block clean output.
   If Word has added unsupported structures, record the limitation rather than accepting it away.

Do not use Word automation or a generated preview as proof that a person inspected the native UI.
Do not mark legal quality accepted without an eligible legal reviewer. Use the result template
below and keep raw personal account details, license data, credentials and client paper out of evidence.

## Acceptance record template

| Field                                                        | Record        |
| ------------------------------------------------------------ | ------------- |
| Test date/timezone                                           |               |
| Tested application revision/environment                      |               |
| Word version/build and OS                                    |               |
| Input/output filename and SHA-256                            |               |
| Opaque staging document/version/review/proposal/decision IDs |               |
| Open without repair                                          | Not exercised |
| Revision visibility and exact text                           | Not exercised |
| Styles, numbering, tables and other stories preserved        | Not exercised |
| Save-as, close and reopen                                    | Not exercised |
| Re-upload and inspection/clean-output enforcement            | Not exercised |
| Human legal-quality review                                   | Not exercised |
| Evidence path and unresolved failures                        |               |

The existing [pilot record](../pilot-review.md) supplies the separate legal-quality rubric.

## Actual local application boundary

`local-http.ts` exercises the running application at `http://127.0.0.1:4280`. Supply an explicitly
authorized isolated local account session in an owner-only JSON file containing `cookieHeader`.
The value is consumed only at runtime and is never printed or included in receipts. Run without
loading environment files and write evidence only under the project's ignored `.scratch` directory:

```sh
bun --no-env-file test/acceptance/word-signoff/local-http.ts \
  /absolute/private-cookie.json /absolute/project/.scratch/word-http --styled-source
```

The optional `--styled-source` selects `01-clean-styled-nda.docx`; without it the original NDA
fixture is used. The runner creates its own synthetic client/matter and leaves existing matters
alone. It uploads the clean, incoming-body and incoming-nonbody files, checks original download
hashes and blocked mutations, publishes two real application proposals, accepts the term and
rejects disclosure, then downloads the application's actual pending, partially resolved and clean
DOCX versions. Unrelated package parts must remain byte-identical throughout.

To exercise the explicit clean-export gate, it publishes a deliberately labelled one-rule test
playbook as the authorized test account, captures V2 review instructions, and writes a synthetic
reference-phrase finding through the normal MCP transport. The temporary token is restricted to
that matter with editor scope and revoked at the end. No inference endpoints are called. It also
completes authored findings on the incoming files and requires both clean download and export
approval requests to remain blocked. These authored assertions are software acceptance data, not
provider output or independent human legal approval.

`receipt.json` records opaque artifact/version/commit IDs, hashes, HTTP results and cleanup status.
It does not contain the cookie or bearer token. The DOCX downloads and receipts are actual local
application evidence; root must still open/save/reopen those specific downloads in Microsoft Word.
The script does not turn a terminal check into native UI, legal-quality or staging proof.
