# GitMatter trust claims review — 16 November 2026

**Status: source audit followed by scoped copy corrections. Runtime, browser, deployed configuration and production acceptance: UNRUN.**

## Scope and decision

Read-only review of `/Users/applecakes/projects/gitmatter`, including its in-progress marketing corrections, against provider adapters, authentication configuration, exports, retention and telemetry code. The shared checkout moved from `21af2e1429e970e2c8a343ca890c31d1dc62bace` to `901da975ca74c41b68207a58b9b9955db968f76c` during review. Findings describe the files read, not an immutable release packet. Recheck at the exact publication revision.

The initial read-only audit wrote only this report in the reviewer's separate worktree. The orchestrator then authorized factual copy corrections in the original checkout, excluding its owned marketing components, Security page and AiSettings. Those changes and checks are recorded in the implementation handoff below. No install, branch/index changes, runtime servers, credential access or deployment actions occurred.

**Recommendation: correct or withdraw the claims below before publishing the VC demo and linked public pages.** The current homepage component and MFA corrections help, but About, comparison pages, SEO metadata, blog posts, admin docs and the settings UI still contradict the narrower position. A demonstration using fictional documents can proceed without claiming verified production privacy or operational assurance.

All source paths below are relative to `/Users/applecakes/projects/gitmatter`; line numbers reflect this review and may move as the design agent edits. Official policies were opened on 16 November 2026. This is a product/implementation claims audit, not a legal compliance opinion.

## Initial findings

These findings record the audit baseline. The implementation handoff distinguishes corrected assigned files from remaining work owned by other sessions.

### R1. Blanket zero-retention and no-training claims remain on discoverable surfaces

**Evidence:**

- `apps/web/src/marketing/About.tsx:23–25`: documents are “never kept or used to train anyone's model.” GitMatter itself stores document content; provider handling is conditional.
- `apps/web/src/routes/(marketing)/privacy.tsx:16` and `solutions.index.tsx:16`: unqualified zero-data-retention SEO descriptions. Solutions also joins connected ChatGPT/Claude and BYOK into one ambiguous execution path.
- `apps/web/src/marketing/blog/posts/byok-zero-data-retention-legal-ai.mdx:123–126`: all listed providers are described as used with ZDR. `ai-audit-trail-legal-work.mdx:114–116` similarly says documents are not stored or used for training.
- `README.md:18–19` and `docs/admin/security.mdx:16–18`: unconditional ZDR framing. The latter also says defaults are the strictest privacy posture each provider allows.
- `apps/web/src/routes/_auth/settings/-components/AiSettings.tsx:133`: OpenRouter is “Zero data retention by default - the safest out-of-the-box choice.” This can appear in the demo itself.

**Implementation:** OpenAI adapter sets `store: false` (`packages/core/src/ai/provider/adapters/openai.ts:67–70`); OpenRouter sets `provider.dataCollection: "deny"`, without explicit `zdr` (`openrouter.ts:65–66`). Neither proves a universally no-retention provider account. Gemini has no paid-project check in the save route or adapter (R3).

**Correction:** replace blanket guarantees across visible copy, metadata and docs with a consistent statement such as: “Choose your AI provider. GitMatter stores your work; provider training and retention depend on the service, model, account controls and terms.” Describe supported request controls separately. Do not imply GitMatter can enforce a provider agreement it has not verified. Distinguish connected assistants from built-in API features.

`Security.tsx:40–43`, `Privacy.tsx:67–75`, and `catalog.ts:604` are better qualified, but “we request zero-data-retention handling where supported” still suggests broader request-level enforcement than these adapters establish. Prefer naming the actual controls or linking to corrected provider documentation.

### R2. The detailed retention guide contains factual errors and outdated provider assumptions

**Evidence:** `docs/admin/ai-data-handling.mdx:25–50`:

- Defines ZDR as keeping and training on nothing at all; provider definitions have scoped exclusions, safety/legal exceptions and caching rules.
- Calls OpenRouter the only out-of-the-box ZDR option and says `dataCollection: deny` already avoids retention. Its own later text acknowledges a stricter `zdr` control, which the adapter does not send.
- States Anthropic has roughly seven-day abuse retention. The current commercial policy describes deletion of API inputs/outputs within 30 days, with exceptions.
- Describes OpenAI `store: false` as the provider not saving the response on its servers, omitting abuse-monitoring retention and endpoint/feature qualifications.
- Combines Gemini paid API and Vertex handling although `GeminiClient` constructs `GoogleGenAI` with an API key, without Vertex configuration (`gemini.ts:112–125,132–145`).

**Policy evidence:**

- [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data): separates application state from abuse monitoring; ZDR/modified abuse monitoring require approval and have feature limits. `store: false` does not establish account-level ZDR.
- [Anthropic commercial retention](https://privacy.claude.com/en/articles/7996866-how-long-do-you-store-my-organization-s-data): API deletion within 30 days, subject to exceptions. [API retention eligibility](https://platform.claude.com/docs/en/manage-claude/api-and-data-retention) additionally scopes ZDR by model, feature and arrangement.
- [OpenRouter routing controls](https://openrouter.ai/docs/guides/routing/provider-selection): distinguishes `data_collection` filtering from `zdr` routing. [OpenRouter ZDR policy](https://openrouter.ai/docs/guides/features/zdr) says account/guardrail settings can allow Safety Retention even with `zdr: true`; it also describes in-memory caching and a CSAM-related policy update. A new `zdr: true` flag alone would not justify “nothing is ever kept.”

**Correction:** replace the table with dated, linked provider-specific facts. Separate GitMatter's actual request flags, provider account arrangements, supported models/features, metadata, and exceptions. Say “not verified” when the application has no proof of an account control. Do not use “ZDR-certified” as if it were an independent security certification.

### R3. “Reject free-tier Gemini keys” is guidance, not an implemented safeguard

**Evidence:** `docs/admin/ai-data-handling.mdx:32,40,45` recommends rejecting free-tier keys while asserting no training by default. `apps/web/src/server/http/routes/keys.ts:71–81` saves the submitted provider/key; `packages/core/src/core/keys.ts:26–34` encrypts it; `GeminiClient` dispatches using that key. The inspected flow does not establish billing status, paid terms, or privacy eligibility before submitting content.

[Google's Gemini API terms](https://aistudio.google.com/docs/terms) distinguish paid-project handling from unpaid-service handling; regional exceptions also exist. Paid Services are not used for product improvement, but limited safety logging remains. Unpaid terms can allow content use and human review.

**Correction:** explicitly label paid-project eligibility as customer-verified configuration, with no claim GitMatter rejects unsafe keys today. For a demo, use fictional documents. If promising an enforced confidentiality mode, require a separately implemented and tested eligibility/dispatch policy; a documentation warning alone is not that policy.

### R4. Revoking/removing a key is not a universal AI off switch

**Evidence:** `byok-zero-data-retention-legal-ai.mdx:47–59` says the platform does not use its own account and that cancelling the firm's key stops every AI feature immediately. `packages/core/src/ai/provider/keys.ts:21–29` uses a server key when no user key exists; `resolveRunModel:61–74` can select another configured provider when no model was requested. Connected external assistants use their own execution path.

**Correction:** “Revoking a provider key prevents future requests authorized by that key. Removing your saved key may expose a configured server fallback; other provider and connected-assistant paths are separate.” Do not promise immediate cancellation of in-flight or already completed work. Do not describe key removal as a global stop control without an implemented policy that blocks every relevant dispatch path.

### R5. Export completeness is overstated

**Evidence:** `Privacy.tsx:173–175` promises admins can export all tenant data. `DataPrivacyCard.tsx:28–29` starts with “all” and then qualifies that document files are excluded. `packages/core/src/platform/export.ts:14–83` exports selected client/matter CSV fields, review grids and a document metadata manifest. It does not export original document bytes, versions, full commit history, chats, workflows, or the security audit log.

**Correction:** call this a selected-data CSV export and list its contents and exclusions. Remove “all,” “complete backup,” or portability claims broader than this implementation. Do not add new export functionality solely to repair the marketing claim in this design increment.

### R6. Scheduled deletion and complete account erasure are not established

**Evidence:**

- `Security.tsx:64–66` and `Privacy.tsx:173–175` describe purges on a schedule. `docs/admin/data-retention.mdx:6` says an app that stays up keeps sweeping. `apps/web/src/server/http/app.ts:75–89` actually runs the listed sweeps once per process; document deletion also opportunistically triggers a purge (`documents.ts:674`). No recurring timer is established by these paths.
- The docs say every category has a time limit, but chat defaults to indefinite retention and artifact/commit history is not on a timer (`packages/core/src/platform/retention.ts:68–76`; retention guide:13,19–23).
- `documents.ts:77–87` records storage-delete failures without rethrowing; `hardDelete:682–696` then removes the database row. This does not establish that every file byte was removed or that a durable retry can subsequently discover it.
- `Privacy.tsx:175–176` says account deletion removes your records. Auth enables user deletion (`auth.ts:98–107`), while matter/client authorship can become null rather than deleting the artifact (`packages/db/src/schema/matters.ts:45–51`, `clients.ts:24`). No tenant-wide erasure operation or backup erasure proof was established in this review.

**Correction:** describe startup/opportunistic, best-effort cleanup and distinguish eligibility for purge from guaranteed deletion deadlines. Explain account removal separately from shared tenant records, stored files, audit history and backups. Track deletion failure recovery as an implementation issue; wording alone cannot prove successful deletion.

### R7. Error-scrubbing and EU-processing guarantees exceed the inspected enforcement

**Evidence:** `Security.tsx:78–81` and `Privacy.tsx:57–61` say document content, keys, bodies and credentials are stripped from error reports; Security additionally says error reports are processed in the EU.

- `apps/web/src/server/observability/sentry.ts:16–29` removes request bodies/cookies and selected headers, but does not inspect free-form exception messages, stack strings, breadcrumbs or arbitrary extras for document text. The region is deployment configuration, not enforced by this scrubber.
- `packages/core/src/core/log.ts:76–96` redacts sensitive field names recursively for its reporter, while preserving arbitrary strings and Error messages/stacks. `tools/catalog.ts:158–163` reports exception messages.
- `apps/web/src/server/http/app.ts:105–112` also sends exceptions directly to PostHog. `apps/web/src/server/posthog.ts:5–15` defaults to the US endpoint, accepts a configured host, and enables exception autocapture; no equivalent scrubber appears in this file.

**Conclusion:** this establishes gaps in the claimed guarantee, not proof of a production data leak or the actual configured region. No exception payload was transmitted for this audit.

**Correction:** state the specific fields removed, avoid claiming comprehensive content removal, and verify every error-reporting destination/configuration before saying EU-only. If the existing broad guarantee must remain, require tested sanitization at both reporting boundaries plus redacted deployment evidence. Do not open or print credentials to obtain that evidence.

### R8. Compliance checkmarks and legal conclusions lack supporting evidence

**Evidence:** `CompareSpellbook.tsx:9` checks “GDPR/CCPA, zero data retention” as true for GitMatter; `CompareLegalon.tsx:10` similarly combines GDPR/CCPA and no training. These boolean rows hide deployment/account conditions. `Security.tsx:100–104` correctly discloses no completed formal security certification; that disclosure does not substantiate the comparison claims.

`byok-zero-data-retention-legal-ai.mdx:67–77` additionally says provider content cannot later be produced and discusses subpoena/privilege outcomes. The provider exceptions above do not support that universal technical premise. This review does not establish any legal outcome.

**Correction:** remove unsupported combined compliance checkmarks or replace with narrowly described, evidenced controls. Remove or have qualified counsel review the legal conclusions. “Open source,” BYOK and an audit history do not by themselves establish legal compliance or certification. Competitor-side assertions also need dated primary evidence before comparison publication; their full feature sets were outside this review.

## Corrections already observed and boundaries worth preserving

- **MFA source claim now aligns:** `Security.tsx:30–35` says authenticator MFA and backup codes are available, with SSO unavailable. Server `auth.ts:200–207` configures passkeys and TOTP with enrollment verification; `auth-client.ts:7–13` configures redirects; `TwoFactorCard.tsx:31–82` implements enrollment/verification/recovery-code actions. This supports a source-level capability statement only. Production enrollment, login, recovery, migrations and disable flows remain UNRUN here.
- **Provider wording improved:** current `Platform.tsx`, `BringYourOwn.tsx`, `TrustBand.tsx` and `catalog.ts` have conditional retention language. Reconcile remaining surfaces rather than restoring absolute wording.
- **Document-region statement is appropriately narrow:** `Privacy.tsx:148–160` and `docs/admin/privacy-evidence.mdx` limit region selection to document object storage. Storage code reads the tenant region and rejects missing selection; tenant setup writes the selection only when unset (`core/storage.ts:60–66`; `platform/tenants.ts:146–160`). Actual buckets, database, backups and AI-processing locations remain unverified. Preserve this boundary.
- **Encrypted provider-key storage has implementation evidence:** `core/keys.ts:26–34` uses `crypto.ts:18–25` (AES-256-GCM). This is not evidence that all document/database/backup content has the same encryption configuration, nor an independent security assessment.
- **Human document acceptance has a real server guard:** `content/documents.ts:1701–1708` rejects agent acceptance/rejection and checks editor access. Do not generalize this to all agent mutations requiring approval: other artifact types and matter policies differ.
- **Compatibility is not endorsement:** connecting ChatGPT or Claude does not transfer their certifications, provider agreements or security approval to GitMatter. Keep the assistant's retention and tool-result handling separate from GitMatter's own storage/API controls.

## Publication handoff

1. Correct or withdraw R1–R8 claims on every publicly reachable surface; if a linked article remains unsafe, omit it from publication rather than relying on a footer qualification elsewhere.
2. Prefer: “Use the assistant your firm already uses. Inspect sources and proposed changes, and keep an attributable matter history.” Demonstrate with fictional material. Avoid universal promises about every AI action, immutability or production compliance without a separately scoped proof packet.
3. Treat regular backups, restricted operator access, EU telemetry, scheduled purges, current certifications and live MFA as operational assertions requiring dated owner/configuration evidence. Repository source alone cannot prove them. No conclusion about actual hosted failures follows from missing evidence here.
4. Re-run a claim scan at the exact publication revision, including routes/SEO, About, comparisons, MDX blogs/admin docs, settings notes and README. Then inspect the actual built public pages; a source edit does not establish a published correction.
5. Keep implementation checks, authenticated runtime tests and deployed verification separate. The initial audit ran no repository checks; subsequent copy validation is listed in the implementation handoff. The integrating agent owns the final publication-revision checks and browser/deployment acceptance.

**No release approval is granted by this report.**

## Implementation handoff

The authorized follow-up changed **17 files** in `/Users/applecakes/projects/gitmatter`. They remain uncommitted for the orchestrator to review and commit. No provider, auth, API, persistence or other runtime logic changed. Comparison-row removal and visible text changes are deliberate; layouts and styles are unchanged.

### Changed files

| File                                                                                    | Correction                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `README.md`                                                                             | Replaced blanket ZDR with conditional provider handling and linked the guide.                                                                                                                                                                                                                                             |
| `apps/web/src/marketing/About.tsx`                                                      | Acknowledges GitMatter storage and provider-specific training/retention.                                                                                                                                                                                                                                                  |
| `apps/web/src/marketing/CompareLegalon.tsx`                                             | Removed the unsupported combined GDPR/CCPA/no-training checkmark.                                                                                                                                                                                                                                                         |
| `apps/web/src/marketing/CompareSpellbook.tsx`                                           | Removed the unsupported combined GDPR/CCPA/ZDR checkmark.                                                                                                                                                                                                                                                                 |
| `apps/web/src/marketing/Privacy.tsx`                                                    | Separated connected assistants from built-in AI; explained server-key fallback, actual export scope, startup cleanup and account-deletion limits; narrowed the telemetry claim to the Sentry filter's actual fields; qualified self-hosting by configured services. Updated the policy revision date to 16 November 2026. |
| `apps/web/src/marketing/blog/posts.ts`                                                  | Replaced the BYOK article's unsupported privilege/defensibility framing in its title and description. The slug is unchanged.                                                                                                                                                                                              |
| `apps/web/src/marketing/blog/posts/byok-zero-data-retention-legal-ai.mdx`               | Corrected API-key purpose, fallback/revocation, provider controls and ZDR scope; removed absolute subpoena/privilege conclusions and no-training clip caption; linked the provider guide.                                                                                                                                 |
| `apps/web/src/marketing/blog/posts/ai-audit-trail-legal-work.mdx`                       | Qualified provider retention and distinguished external assistant handling.                                                                                                                                                                                                                                               |
| `apps/web/src/marketing/blog/posts/chatgpt-claude-legal-work-audit-trail.mdx`           | Replaced the unconditional provider no-storage/no-training safety claim.                                                                                                                                                                                                                                                  |
| `apps/web/src/marketing/blog/posts/contract-redlining-best-practices-ai-first-pass.mdx` | Replaced universal discard/no-training advice with service/account/terms checks.                                                                                                                                                                                                                                          |
| `apps/web/src/routes/(marketing)/privacy.tsx`                                           | Removed blanket ZDR from SEO description.                                                                                                                                                                                                                                                                                 |
| `apps/web/src/routes/(marketing)/solutions.index.tsx`                                   | Separated the MCP assistant and built-in BYOK paths in SEO copy.                                                                                                                                                                                                                                                          |
| `apps/web/src/routes/_auth/settings/-components/DataPrivacyCard.tsx`                    | Replaced “all” with the exact CSV export content and explicit exclusions. Text only.                                                                                                                                                                                                                                      |
| `docs/admin/ai-data-handling.mdx`                                                       | Replaced outdated retention table with dated primary sources; documented actual flags, OpenRouter Safety Retention qualifications, unverified Gemini paid eligibility, fallback and assistant/tool boundaries.                                                                                                            |
| `docs/admin/data-retention.mdx`                                                         | Corrected startup/opportunistic cleanup, non-expiring categories, deletion eligibility, failed storage deletion, export content and shared-account/backup limits.                                                                                                                                                         |
| `docs/admin/security.mdx`                                                               | Replaced blanket ZDR/strictest-default claims with actual provider/account conditions and server-key fallback.                                                                                                                                                                                                            |
| `docs/admin/self-hosting.mdx`                                                           | Replaced OpenRouter ZDR-default claim with actual `dataCollection` behavior and server-key fallback.                                                                                                                                                                                                                      |

### Validation observed

- **PASS:** scoped `vp check` on all 17 changed files. All 17 passed formatting; all eight TypeScript/TSX files passed lint and type checks with no warnings.
- **PASS:** `vp run typecheck` across the repository task graph (6 successful tasks; 5 cached).
- **PASS:** `vp run design:check` (329 authored source files, 22 contrast pairs, 0 failures).
- **PASS:** `vp run docs:build` (33 static pages generated, including AI-handling and retention docs). Build emitted two `fd-search` CSS `::highlight` warnings; no build failure.
- **PASS:** `git diff --check` and a claim scan across assigned marketing/routes/docs/README surfaces; no remaining matches for the removed absolute phrases, universal export claim, or combined compliance checkmarks.
- **FAIL, outside this patch's ownership:** repository-wide `vp check` stopped at formatting in `design/evidence/review-and-output.json`. The file was already dirty in the shared checkout and was left untouched. The integration gate therefore remains open; root must re-run the full check after the evidence owner fixes formatting.
- **UNRUN:** tests, authenticated browser flows, live provider requests, actual exported ZIP inspection, failure-injected deletion/telemetry behavior, media playback and deployed-page inspection. No app or fixture server was started. Existing blog video assets were not edited or revalidated; the BYOK clip's corrected caption does not establish that its rendered/narrated content is accurate.

### Remaining root-owned corrections

The following exclusions were respected. They still had these claims when re-read after this patch:

- `AiSettings.tsx:133`: the OpenRouter ZDR-by-default/safest claim (R1–R3).
- `Security.tsx:42`, `Platform.tsx:188`, `catalog.ts:604`, and `TrustBand.tsx:12`: “zero-data-retention handling where supported” can still suggest enforcement beyond the inspected adapters. Use the actual request/account conditions (R1–R2).
- `Security.tsx:64–66`: scheduled purge wording still exceeds startup/opportunistic behavior (R6).
- `Security.tsx:78–83`: comprehensive error scrubbing, EU processing, and only-one-provider wording still exceed the reviewed implementation/evidence (R7 and the intermediary/tool boundaries).
- `Security.tsx:69–73`: regular hosted backups/access controls remain an operational assertion requiring separate deployment/restore evidence. This patch adds no such evidence.

The underlying deletion recovery and telemetry sanitization issues remain implementation follow-ups, not fixed by this text-only change. Source and docs builds do not establish hosted privacy, provider agreements, legal compliance, or release readiness.

## Remaining-copy correction checkpoint — 17 November 2026

The orchestrator authorized a final text-only pass in the original checkout for the six previously excluded files. The initial audit and prior implementation findings above are preserved as their historical baseline. No provider, key-resolution, authentication, storage, cleanup or telemetry logic changed. No account configuration, credentials, server, branch, index, commit hook or deployment was accessed by this pass.

| File                                                            | Source-supported correction                                                                                                                                                                                                                                                                                                                                                                                                                                |
| --------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `apps/web/src/routes/_auth/settings/-components/AiSettings.tsx` | Removed the safest/default-ZDR recommendation. Provider notes distinguish OpenAI response storage from abuse monitoring, Anthropic agreement/model conditions, unverified Gemini paid-service eligibility, and OpenRouter data-collection filtering. The introduction explains saved-key precedence and configured server fallback.                                                                                                                        |
| `apps/web/src/marketing/Security.tsx`                           | Replaced vague ZDR wording with actual request controls and unverified account eligibility, linked the corrected provider guide, and distinguished OpenRouter, assistants and external tools. Describes startup/opportunistic best-effort cleanup and deployment-dependent TLS/storage controls, operator access, backups and telemetry regions. Narrows the Sentry claim to its actual request-field filter. The page revision date is November 17, 2026. |
| `apps/web/src/marketing/Platform.tsx`                           | Uses the same provider/account conditions and fallback distinction. Replaces universal approval and every-action promises with document-edit human decisions, matter policy and attributed content mutations.                                                                                                                                                                                                                                              |
| `apps/web/src/marketing/catalog.ts`                             | Corrects BYOK descriptions consistently. Removes unsupported undo and no-second-login promises, universal citation/approval wording, inferred legal-compliance positioning and automatic replacement of previously captured standards. Describes eligible human document decisions, current token/member limits and attributed content mutations.                                                                                                          |
| `apps/web/src/marketing/components/TrustBand.tsx`               | Replaces vague retention guarantees and absolute no-log/no-browser wording with actual storage/status and request controls. Describes scoped member/token authority and deployment configuration without implying certification.                                                                                                                                                                                                                           |
| `apps/web/src/marketing/components/BringYourOwn.tsx`            | Separates assistant tool-result handling from built-in AI, describes saved-key/server-key precedence, and ties provider handling to the selected service, model, account controls and agreement.                                                                                                                                                                                                                                                           |

The settings status assertion was checked against `GET /api/keys`, which returns provider configuration/source metadata rather than saved key values. Provider controls and fallback were re-read from the installed adapters and key-resolution source; cleanup and Sentry claims were checked against the startup sweep and request-field filter. This source comparison does not verify actual account arrangements, telemetry payloads, retention outcomes or hosted operations.

Validation for this six-file pass:

- **PASS:** scoped `vp check` on all six TSX/TS files; formatting, lint and types completed without warnings or errors.
- **PASS:** `git diff --check`.
- **PASS:** targeted source claim scan found none of the removed safest/default-ZDR, vague ZDR-where-supported, scheduled-purge, EU-only, comprehensive-scrubbing, regular-backup, no-log/no-browser, undo or no-second-login phrases in these files.
- **UNRUN:** runtime/provider checks, browser layouts/flows, media-content review, production configuration and deployed-page inspection. Existing acceptance receipts for modified surfaces must be revalidated on the final integrated revision. The deletion-recovery and telemetry-sanitization implementation issues identified above remain open.
