# MFA sign-off review and plan 02 local baseline — 2026-10-11

Branch: `feat/native-agent-workflow`, based on `1b26ff89`, with uncommitted implementation changes.
The existing plan split was already uncommitted before this work; it was preserved.

## Repository proof

- `vp install`: successful, no dependency changes.
- `vp check`: formatting, lint, and type checks passed with no warnings.
- `vp run typecheck`: all six configured typecheck tasks passed.
- `vp test`: 35 files, 174 tests passed. The initial baseline failed because local Postgres was
  stopped; restarting the existing `gitmatter-postgres-1` container restored the baseline.
- `vp run --filter=web build`: passed; existing large client-chunk warning remains.
- `vp run --filter=@workspace/db generate`: no schema changes, nothing to migrate.
- `vp run docs:tools:check` and `vp run fixtures:nda:check`: passed.
- `git diff --check`: passed.

## MFA review

The existing implementation contains the server/client plugins, migrations, enrollment settings,
authenticator/backup-code login UI, and security-event recording. Found and fixed a return-path open
redirect: protocol-relative URLs, backslashes, and whitespace/control characters now fall back to
`/assistant`. Legitimate in-app return paths remain supported. Added a regression test.

Browser smoke at the running local `/2fa` page: authenticator field rendered, empty Continue was
disabled, switching to backup-code mode showed the correct text field and reverse toggle. No browser
error was observed. This is a UI smoke check, not a new authenticated enrollment/login test.

The 2026-09-21 full enrollment/TOTP/recovery/disable/audit acceptance remains prior evidence. Fresh
credential handling was not attempted because AGENTS.md requires the `aws-secrets-manager` skill,
which is absent from the available skills and installed skill paths; no retrieve_skill tool was
available. Fresh authenticated and production sign-off remain pending. No deployment or marketing
availability claim was made.

## Plan 02 source and local engine proof

Added a fully fictional source NDA DOCX/Markdown and manifest with four rules, standard/fallback
language, three cited findings plus an explicit absent-clause outcome, two expected redlines, expected
audit operations, and failure cases. The fixture generator has a semantic drift check in CI.

The local integration test uses Postgres and configured object storage. It uploads and extracts the
source, creates approved library language and a playbook through normal audited APIs, materializes a
review, writes explicitly authored fixture findings as an agent, proposes two OOXML tracked changes,
checks the exported insertions/deletions, refuses agent self-resolution, resolves as a human, checks
accepted DOCX text, and gathers/exports attributable audit entries. A nonmatching proposal fails
without changing the document head. Test cleanup deletes its stored versions before database rows.
These authored findings are not measured provider results or legal quality evidence.

Funnel tests verify that arbitrary content/identity fields and unknown model strings cannot reach
structured logging or analytics, malformed identifiers/counts are discarded, and sink failure cannot
break work. The integration test checks the engine's success/failure events and that inline preview
is not counted as export. Completed-playbook events require the expected grid or streaming work to
succeed; observer failures do not change committed mutation outcomes.

The browser acceptance script is written at `test/acceptance/nda-browser.md`, with telemetry semantics
at `test/acceptance/funnel.md`. Full authenticated browser execution, staging reproduction, actual
PostHog delivery, Word round-trip, representative provider quality, and pilot evidence remain open.
Plan 02 stays In progress until its browser/staging exit gates are exercised.
