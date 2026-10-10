# Establish product truth (M0)

Create a trustworthy baseline before changing the review workflow: a sanitized NDA fixture pack, a
browser acceptance script for the current path, generated MCP tool documentation, and funnel
instrumentation that never records legal content or PII.

**Status: In progress** (source and local engine verified 2026-10-11; authenticated browser and
staging gates remain open).

Implemented the fully synthetic NDA pack in `packages/core/test/fixtures/nda/`, including source
DOCX, playbook rules, standards/fallbacks, cited findings, missing-clause outcome, expected redlines,
and audit operations. `fixtures:nda:check` checks source consistency in CI. The local integration
test exercises upload, extraction, approved playbook/clauses, explicitly authored fixture cells,
tracked changes, human resolution, stored exports, and audit attribution against Postgres and object
storage. These authored findings are not evidence of model quality.

Added the repeatable browser acceptance script in `test/acceptance/nda-browser.md` and operational
telemetry specification in `test/acceptance/funnel.md`. Shared contracts and runtime allowlisting
protect structured logs and optional PostHog capture from arbitrary content, identities, filenames,
prompts, citations, and raw errors. Events cover upload, extraction, playbook execution, finding opens,
proposal/resolution, export, failures, duration, actor type, size, and provider token usage. Unknown
model ids are omitted rather than allowing arbitrary text into analytics. Preview is not export.

The generated MCP reference and subscription-MCP CI journeys remain in place. Full authenticated
browser execution, staging reproduction, live analytics delivery, Word round-trip, and representative
provider/pilot quality have not been established by these checks. They remain release gates.

## Purpose

Create a trustworthy baseline before changing the workflow.

## Work

- **Done:** Build one sanitized NDA fixture pack: source DOCX, expected playbook findings, approved clauses,
  fallback clauses, expected redlines, and expected audit events.
- **Written, execution pending:** Add a browser acceptance script for the complete current path, even where steps still require
  separate screens.
- Generate the MCP tools reference from the runtime catalog, including jurisdiction-gated tools,
  instead of keeping a hard-coded tool count. **Done.**
- **Implemented:** Instrument the funnel without legal content or PII:
  `upload_started`, `extraction_ready`, `playbook_started`, `playbook_completed`,
  `finding_opened`, `redline_proposed`, `redline_resolved`, `document_exported`.
- Record duration, failure category, provider/model, token usage, document page/character count, and
  actor type. Never record document text, prompts containing client material, citations, keys, or
  file names in telemetry.

## Exit gate

- Baseline journey reproducible on local and staging.
- Each failed step has a visible user-facing state and a structured operational event.
- Funnel can answer where a pilot user stopped without exposing client content.

## Code areas

- Tool catalog and generated reference: `packages/core/src/tools/catalog.ts`,
  `scripts/generate-mcp-docs.ts`, `docs/api-reference/mcp-tools.mdx`.
- Acceptance fixtures and browser tests: a new NDA fixture pack in the test tree plus a browser
  acceptance script.
- Telemetry: the analytics integration and the upload, extraction, review, redline, and export paths
  it instruments.

## Related plans

- Program framing, current baseline, measures, and release-proof tiers:
  [`08-pilot-program-and-release-proof.md`](08-pilot-program-and-release-proof.md).
- Supplies the fixture pack and acceptance harness that
  [`03-review-to-redline-loop.md`](03-review-to-redline-loop.md) needs for its exit gate.
