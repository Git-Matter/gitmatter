# Content-free funnel

`@workspace/contracts` owns event/property contracts. `core/funnel.ts` enforces a runtime allowlist
before either structured logging or the optional app PostHog sink. Unknown fields are stripped;
invalid identifiers/counts are rejected. Identifiers are UUIDs; actor type is user/agent, never a
name or agent label. Only curated native model ids are accepted. Unknown/OpenRouter model ids are
omitted to avoid sending arbitrary strings. Provider/token usage still appears in the usage ledger.

The PostHog sink is optional, groups by opaque matter/review/document id, disables person profiles
and GeoIP, and never attaches email, IP, names, prompts, filenames, content, or citations. Sink failure
cannot change mutation success. `review_usage` supplies provider/model and token counts. Start and
finish events measure work; failures use categories rather than raw provider errors.

The eight baseline events are upload_started, extraction_ready, playbook_started,
playbook_completed, finding_opened, redline_proposed, redline_resolved, document_exported.
Failure counterparts and outcome=partial prevent incomplete work masquerading as success.
Playbook materialization alone is not completion: streaming completion requires all attempted cells
successful; subscription fixture completion requires the expected grid to be done.

Inspect structured events by matterId/reviewId/documentId to determine the last completed step,
duration, outcome, failure category, page/character count, actor type, and token usage. Keep baseline
conversion denominators separate for provider runs and manually authored subscription fixture cells.
Download events describe successful response preparation, not proof the recipient saved or opened it.
Word round-trip and real provider quality need their own acceptance records.
