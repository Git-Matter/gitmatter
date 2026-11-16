# Delivery evidence

Historical record: six PRDs were written and the initial product implementation was built by three builders plus the integration lead, with independent cross-review. Local acceptance below was observed on 10–11 November 2026. The public commercial offering, pilot enquiry flow, and promotional media were removed on 17 November 2026; their earlier checks do not describe current functionality. No staging, production, real-provider generation, or practitioner acceptance is claimed.

| Package             | Source                    | Local checks | Authenticated browser                                                       | Practitioner pilot      | Production |
| ------------------- | ------------------------- | ------------ | --------------------------------------------------------------------------- | ----------------------- | ---------- |
| 01 Matter briefing  | Implemented               | Passed       | Prompt preparation verified; real AI generation UNRUN                       | Not started             | Undeployed |
| 02 Guided starts    | Implemented               | Passed       | Sample creation and prepared client-update task verified                    | Not started             | Undeployed |
| 03 Assisted setup   | Implemented               | Passed       | Storage onboarding → setup → saved practice profile verified                | Not started             | Undeployed |
| 04 Practice outputs | Implemented               | Passed       | Review, reload, Word export/re-upload/preview, stale/pending state verified | Not started             | Undeployed |
| 06 Pilot            | Internal runbook retained | Historical   | Public enquiry flow removed                                                 | Recruitment not started | Undeployed |

## Source and checks

Branch: `feat/australian-sole-practices`. The accompanying change commit identifies the source revision. All initial worktree changes are from this implementation; generated runtime evidence is ignored under `.scratch/au-practitioner-acceptance/`.

- `vp install`: passed using this checkout's configured Vite+ package manager. No toolchain migration was mixed into the product work.
- `vp check`: passed with no formatting, lint, type errors, or warnings (648 files formatted; 480 source files checked).
- `vp run typecheck`: passed all six participating package checks; three executed and three reused cache in the final run.
- `vp test` with isolated local Postgres and local S3 emulation: **212 passed in 38 files**, no skips. The final parser type-narrowing cleanup additionally passed its two focused tests.
- `DEPLOYMENT=cloud vp run --filter=web build`: passed, including explicit public-route prerendering.
- `vp run docs:build`: passed, including TypeScript and 33 static pages.
- `vp run --filter=@workspace/db generate`: generated migrations 0009 (practice profiles/review records) and 0010 (conversation jurisdiction); both applied successfully to the isolated database. Final generation reported no schema changes.
- `git diff --check`: passed.

## Runtime observations

Local app: `http://localhost:4292`. The session uses a fictional local acceptance account and documents only. A fresh sign-up selected document storage, reached the new setup tab, saved/reloaded practice preferences, and opened the guided sample. Preparing the client-update task produced editable instructions containing the saved header/sign-off, selected AU-NSW context, sources, and draft boundaries without calling a model.

Recorded a deliberately labelled local test review through the document UI, reloaded it, fetched its authenticated Word export, and verified valid Word XML containing reviewer, scope, and source title. The downloaded artifact is `.scratch/au-practitioner-acceptance/practitioner-review.docx`. Re-uploaded that artifact through the real upload endpoint, waited for extraction, and observed one rendered Word page from its immutable version URL. The review controls enabled after successful preview. Proposing an edit to the fictional source removed its current-review badge, preserved review history, and blocked re-attestation while the edit remained pending.

At an emulated 390px viewport, the settings page had document width 390px; wrapped settings tabs cleared the panel.

## Independent review corrections

- Removed nested pool reservations from sample creation; all writes, source commits and audit event share one transaction. Regression includes 30 simultaneous users against a pool capped at 20.
- Persisted conversation jurisdiction and aligned UI/server fallback rules so Australian context survives first-response navigation, reload, follow-up, and selecting Default. Preserved matter context; rejected foreign chat IDs and serialised concurrent appends.
- Routed the three new Australian built-ins through the guided input/confirmation flow instead of legacy auto-send.
- Rechecked review authorisation inside the locked write transaction. Controlled regressions revoke matter membership or a direct share while a review waits and assert no review row or commit persists.
- Expanded incoming Word revision inspection to custom XML/move/conflict/table-property markers; malformed, unrecognised or unavailable Word bytes block attestation.
- Bound UI confirmation to the exact state token, pinned Word preview to an immutable version, and required successful rendering before recording review.

## Remaining acceptance and operating boundaries

- A real configured AI-provider or connected external-assistant journey, generated client correspondence, legal accuracy, and practitioner checking effort remain **UNRUN**. The model-independent tests and local UI observations do not establish those outcomes.
- Word evidence covers local generation/export, rendering, native-revision blocking, and selected fixtures. It is not acceptance of every real-world document's numbering, cross-references, comments, fonts, or layout in Microsoft Word.
- Australian and other regional object-storage routes were exercised against a local S3 emulator. This proves application routing in local configuration, not actual AWS geography, hosted residency, cloud-provider contracts, or production security.
- No practitioners were recruited, no client files were tested, and no legal precedent or marketing outcome was independently approved. Use [PILOT-RUNBOOK.md](PILOT-RUNBOOK.md) to conduct that work.
- No remote push, staging deployment, or production deployment was performed. Production promotion requires the normal release workflow and current operational acceptance.

Local acceptance infrastructure is isolated: Postgres container `gitmatter-au-prd-postgres` at loopback port 55433, S3rver at loopback port 59010, and the dev server at port 4292. The existing project database was not migrated or modified. These local services are left available for inspection.
