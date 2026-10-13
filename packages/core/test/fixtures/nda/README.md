# Synthetic NDA fixture pack

All parties, terms, findings, and policies are invented for software acceptance. These expected
findings are authored assertions, not measured model output or legal approval.

- `source.docx`: uploadable source; generated from the manifest.
- `source.md`: readable source.
- `manifest.json`: playbook rules, approved-standard/fallback examples, cited findings, expected
  redlines, missing-clause outcome, expected audit operations, and failure cases.

Regenerate with `vp run fixtures:nda`. Check semantic source consistency with
`vp run fixtures:nda:check`. DOCX ZIP timestamps may differ, so the check compares extracted text.

`packages/core/test/nda-acceptance.test.ts` exercises upload, extraction, playbook materialization,
explicit agent-authored fixture findings, proposals, human resolution, version download, and audit
export against Postgres and object storage. It does not call an LLM or establish model quality.
The separate browser script exercises actual navigation and visible states.
