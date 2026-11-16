# Australian practitioner integration review — 16 November 2026

## Integration dispositions

The findings below are retained as the independent review. During consolidation:

- Conversation-bound catalogs now receive the server-authorised matter. Creating tools use
  that fixed matter when an ID is omitted, reject a different explicit matter, and recheck edit
  access without falling back to the personal matter. `tool-matter-context.test.ts` proves real
  Postgres artifact/link/audit creation and denied calls with zero new documents; object storage
  is synthetic in that test.
- Practitioner Word inspection reuses the bounded canonical inspector and compares the bytes
  with `document_versions.wordInspection.sourceHash`. Review regressions cover changed stored
  bytes, unsupported Word fields and expansion limits, with no review row or commit after denial.
- Blank extracted content blocks review on the server even when an uploaded version exists.
  The document UI also requires nonblank non-Word content before confirmation. The server
  regression covers a ready scanned PDF, denied POST, zero attestation, and the positive visible
  text state. A browser check of this added path remains required.
- Practice preferences now register with the shared settings draft guard and retain drafts across
  panel changes. Guided task and practitioner scope drafts use the same exit-guard primitives.
  These frontend changes passed web TypeScript checks; the new interaction paths still need
  browser acceptance on the integrated revision.

Focused integration run: **53 tests passed in seven files, no skips**, including captured review
text remaining independent of mutable chunk indexes, version-filtered document retrieval, cache
metadata settlement, practitioner review/revocation, tool matter context, and Word inspection.
These are local tests, with synthetic provider/object I/O where indicated in the test files.

Database proof used isolated `pgvector/pgvector:pg17` on loopback port 55434. The established
migrations through `0020` remain unchanged. Forward `0021` adds chunks, embeddings and cache
usage fields with the vector extension; `0022` declares the three partial HNSW indexes in the
schema; `0023` adds practice profiles, review records and conversation jurisdiction. Fresh
migration and upgrade from snapshot `21af2e1` both passed. The upgrade retained a seeded
template and revision, advanced 21 migration records to 24, and exposed all three HNSW indexes.
Final schema generation reported no changes. No existing project/deployment database was used.

These dispositions do not establish real-provider, hosted storage, browser, practitioner or
production acceptance. Release gates and the remaining runtime checks below still apply.

## Decision and scope

**Do not treat this report as integrated demo or release acceptance.** This is an independent source review against the six PRDs. Three P1 findings and one P2 finding below need disposition before a practitioner demo uses the affected paths.

Read-only source inspected: `/Users/applecakes/.codex/worktrees/gitmatter-consolidation`. Its HEAD advanced during inspection from `6ad2f40359ada9b862cedef4a95c487f58c0aa81` to `bf9a9afdc2442b27924d8d1752a5ad8c80635cbe`. The Australian files initially were absent and then appeared during an active merge. Several integration files still contain conflict markers. Their presence is an in-progress integration state, not an independently discovered product regression. References below describe observed file contents, not a completed merge commit.

Source branch preserved: `feat/australian-sole-practices` at `f10987ed5fb7eac45f5b368974ea8aa6323b2bed`. Only this report was written in the source worktree. No integration edits, pushes, deployments, dependency installs, application/fixture servers, or database tests were performed.

All implementation paths below are relative to the integration worktree. Findings are established by control-flow inspection; proposed reproductions remain **UNRUN** in this review.

## P1 — A generated client update can be filed outside the confirmed matter

**PRDs:** 01 requirements 1 and 5; 02 confirmed matter/source selection; the shared Client → Matter → artifact boundary.

**Evidence:**

- `packages/core/src/tools/catalog.ts:201–215`: `resolveMatter()` uses the user’s default matter when the tool caller omits `matterId`. The catalog has no active/default conversation matter option in its observed signature at lines 184–192.
- `apps/web/src/server/http/routes/chat.ts:616–622`: the in-app catalog receives jurisdiction, user name, and research sources, without the already-resolved conversation matter.
- `packages/core/src/tools/documents.ts:19–38`: `generate_docx.matterId` is optional and its handler uses that resolver.
- `packages/registry/src/guided.ts:96–98` asks the model to supply the selected matter ID. This is a prompt instruction, not an enforced default in the mutation path.

**Trigger and consequence:** Start a client-update task for matter B. The model invokes `generate_docx` with a title and blocks but omits the optional matter ID. The tool can successfully create the draft under the personal/default matter instead of B. The chat remains associated with B, so the UI can appear correct while its Word artifact is misplaced. This does not establish a cross-tenant leak; it is a concrete filing/provenance failure.

**Required correction:** Pass the server-authorised conversation matter into the tool context and use it as the access-checked default for artifact creation. Decide explicitly whether an alternative matter ID is allowed; never silently fall back elsewhere when the confirmed matter is denied or unavailable. Apply the same rule to other creating tools that reuse this resolver.

**Exact regression to add/run:** In a real isolated DB, create a personal matter and an editable matter B, construct the same catalog as chat B, invoke `generate_docx` without `matterId`, and assert both document origin and matter link are B with a creation commit. Repeat after removing B editor access: assert denial and zero new document in either matter. Extend `packages/core/test/generate-docx.test.ts` or add a tool-level catalog integration test; current generation tests primarily inspect Word block rendering. A prompt-text assertion alone is insufficient.

## P1 — Practitioner review introduces an unbounded second Word parser

**PRD:** 04 requires robust exact-version review and fail-closed Word handling; repository priorities require reliability and shared content logic.

**Evidence:**

- `packages/core/src/content/documentReview.ts:41–69` loads the stored source and calls the new `inspectDocxRevisions()` before review snapshot/write.
- `packages/core/src/content/docx/inspect.ts:44–51` calls `JSZip.loadAsync()` and fully inflates each `word/*.xml` entry through `entry.async("string")`. It has no archive, expanded-size, XML-size, entry-count, depth, or node-count bounds.
- The existing `packages/core/src/content/docx/inspection.ts:14–19,103–198,263–282` supplies those limits before/during inflation. `inspectVersionWordBytes()` at lines 69–80 also compares bytes with the recorded version inspection. Its safe operation decision is at lines 414–462.
- The new path computes a new digest but does not compare it with `document_versions.wordInspection.sourceHash` or consume the canonical inspection result.

**Trigger and consequence:** An authenticated review request can reach a second inflater for an uploaded archive that the existing inspector considers out of bounds or unsupported. Catching an error after inflation does not prevent memory/CPU exhaustion. It also lets the two paths disagree on what constitutes a verified Word source. The existing UI’s partial-inspection notice is not a server-side guard on the new review API.

**Required correction:** Reuse the bounded canonical inspector and recorded-source integrity check for practitioner review. Keep review’s stricter requirement of no unresolved revisions. Do not retain a parallel, weaker Word safety policy.

**Exact regressions to add/run:** Extend the canonical inspector and `packages/core/test/document-review.test.ts` with (a) archive expansion/XML limits, (b) an unsupported/ambiguous Word package, and (c) stored bytes whose hash differs from the recorded version. GET must expose a blocked state and POST must create neither an attestation nor a review commit. Verify limits reject before unbounded inflation; use bounded fixtures, not a large resource-exhaustion test. The existing missing-storage/native-revision tests do not establish these properties. All new reproductions are **UNRUN** here.

## P1 — A ready scanned PDF can be attested without visible source content

**PRD:** 04’s human confirmation of the displayed document and exact reviewed state.

**Evidence:**

- `packages/core/src/content/extractionQueue.ts:171–176,198–209` permits extraction with little or no PDF text, flags `ocrSuggested`, and sets the document to `ready`.
- `packages/core/src/content/documentReview.ts:125–132` blocks missing text only when **both** markdown and `currentVersionId` are absent. Uploaded PDFs have a version, so an empty-text ready PDF passes this check.
- In the observed `apps/web/src/routes/_auth/documents/$id.tsx:160–196`, non-Word content displays markdown or the “No text extracted” placeholder. `previewReady` is automatically true for every non-DOCX file.
- `PractitionerReviewPanel.tsx:163–174` asks the user to confirm they checked “the document shown here.” No PDF-render-success evidence is supplied to that panel.

**Trigger and consequence:** Open a scanned PDF whose extraction completes with empty text and a stored version. The page can show no document content while allowing a current review record and its export. A scope note is not evidence that the app showed the reviewed source.

**Required correction:** Either render and bind a verified immutable PDF version before enabling review, or block the app’s review action for unavailable extracted/displayed content. If externally reviewed source attestations are a distinct supported workflow, give them explicit wording and evidence requirements; do not describe them as review of the displayed document.

**Exact regression to add/run:** A ready PDF with `markdown: ""`, `ocrSuggested: true`, and non-null `currentVersionId` must not be reviewable via the current display workflow. Add the complementary positive test for the chosen supported PDF rendering/text path and a browser check that failed/blank preview never enables confirmation. Assert no review row/commit after the denied POST. These cases are not covered by the inspected missing-Word-storage test and remain **UNRUN** here.

## P2 — Practice preferences do not participate in the integration’s unsaved-settings guard

**PRD:** 03 usable assisted setup; integration AGENTS requires preserving unsaved input.

**Evidence:**

- `apps/web/src/routes/_auth/settings/-components/PracticeProfileCard.tsx:56–69` owns an unsaved local `draft`; there is no `useSettingsDraft()` registration.
- `SettingsDrafts.tsx:16–49` can protect leaving Settings only for panels that register dirty/saving state.
- `PracticeProfileCard.tsx:38–42` also keys the form by the latest server profile JSON. A successful server cache refresh with changed values can remount the form rather than reconcile an existing draft.

**Consequence:** Even if the settings merge correctly retains visited panels, practice-letterhead/sign-off changes alone do not make its exit guard dirty. Leaving Settings can silently discard them. Resolving the settings conflict by taking the source branch wholesale would additionally discard the newer retained-panel/JobControls behaviour.

**Required correction:** Register the practice form’s dirty and saving states with the shared settings-draft mechanism, preserve it when switching sections, and handle external profile refresh without silently replacing edited input. Keep the integration navigation/layout rather than reinstating the old tabs implementation.

**Exact browser regression to add/run:** Edit correspondence wording without saving; switch to AI settings and back; text must remain. Attempt to leave Settings: choose Keep editing and verify preservation, then explicit Discard. Simulate a failed save and a background server preference update; neither may silently destroy the draft. **UNRUN** here.

## Merge gates before these findings can be closed

These are reconciliation requirements, not additional findings about the unfinished merge:

1. Preserve the newer assistant’s explicit Start, stop/pause-on-failure, model readiness, unsent-draft protection and resumed-state behaviour while adding guided starts. In the pre-merge integration snapshot, `assistant/index.tsx:50–78` prepared legacy workflow seeds without sending, and lines 103–157 advanced only completed runs. Do not reintroduce the old branch’s mount-triggered legacy auto-send.
2. Preserve both original approval controls and new practitioner-review semantics. A practitioner’s scoped review is not approval for clean export, permission to resolve incoming Word revisions, or final client release. Keep `WordInspectionNotice`, expected-head/approval-context checks, and clean-export policy.
3. Reconcile transaction helpers against the integration’s existing `recordCommitInTransaction()` and `AccessReader` APIs. Keep fictional sample creation on one caller-owned transaction, rather than nesting the old optional-Tx variant beside the existing transaction helper. Re-run the 30-user sample regression after conflict resolution.
4. Keep Canadian/French/Dutch/Japanese/Korean jurisdiction entries already present in integration while adding AU states. Keep persisted chat jurisdiction and owner/tenant/append safeguards, including Default-picker and resumed matter context.
5. Preserve the dev migration chain through 0020 and the integration’s subsequent forward migrations. Create new forward migrations for `practice_profiles`, `document_reviews`, and nullable `chats.jurisdiction`; do not replace dev 0009/0010 or accept the source branch’s old snapshots/journal as the deployment history. Root’s dedicated integration agent owns this reconciliation.
6. Combine both branches’ `packages/core/test/docx-inspection.test.ts` coverage. It was an add/add conflict during inspection; choosing one side would silently remove the other inspector’s regressions.

## PRD coverage and demo acceptance still open

| PRD                        | Source review                                                                                                                                                      | Integrated/live acceptance                                                                                                                           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| 01 Briefing/correspondence | Shared prompts request sources, uncertainty, Australian context and draft-only output. Filing default finding above remains.                                       | Real configured-provider run, usable citations, correct matter-linked Word creation, continuation and reload: **UNRUN**.                             |
| 02 Guided starts/sample    | New selection checks reject unreadable, non-ready, staged and wrong-matter sources; sample labels are explicit. Merge into the newer assistant is still in flight. | Cancel, denied/failed source, no paid dispatch on open, sample concurrency and keyboard return focus on final tree: **UNRUN**.                       |
| 03 Assisted setup/trust    | Provider/account terms and storage-vs-processing distinctions are present in new copy. Unsaved practice preferences finding remains.                               | Fresh hosted setup, provider availability and exact subprocessor/residency evidence: **UNRUN**.                                                      |
| 04 Practice outputs/review | Human actor check, expected token, pending-edit check, reviewer identity and write-time permission recheck exist by source inspection. Word/PDF findings remain.   | Final permission-revocation races, Word/PDF failure states, rendered-version review, export and stale-state behaviour: **UNRUN** on integrated tree. |
| 05 Commercial offering     | AUD quote path intentionally defers a price and distinguishes provider/GST costs. Marketing/layout conflicts remain.                                               | Final public route/navigation/SEO, 390px layout and editable mailto target/body checks: **UNRUN**. No fee or enrolment should be implied.            |
| 06 Pilot                   | Runbook/materials are distinct from recruitment and observed outcomes.                                                                                             | No recruited practitioner, observed client workflow, legal accuracy or paid continuation is established by this review.                              |

## Exact validation to coordinate with root

No command below was run by this reviewer. Run only on the completed integration tree with root-owned, explicitly selected fixtures/configuration:

```sh
vp check
vp run typecheck
vp run design:check
vp test packages/registry/test/guided.test.ts apps/web/src/lib/data/guided-task-launch.test.ts apps/web/src/routes/_auth/assistant/-components/workflow-seed.test.ts
vp test packages/core/test/guided.test.ts packages/core/test/chat.test.ts packages/core/test/document-review.test.ts packages/core/test/docx-inspection.test.ts packages/core/test/authz.test.ts packages/core/test/token-scope.test.ts
vp test packages/core/test/document-approval.test.ts packages/core/test/review-policy-freshness.test.ts packages/core/test/sync-review-races.test.ts packages/core/test/templates.test.ts
vp test
DEPLOYMENT=cloud vp run --filter=web build
vp run docs:build
vp run --filter=@workspace/db generate
```

Check the actual test inventory after resolving conflicts; test file names alone are not proof of retained assertions. Migration generation is a root-coordinated mutation and must report no further schema drift after forward reconciliation. Apply the full migration chain to both an empty owned database and an owned copy already at the dev schema boundary before considering deployment. Observe the final build revision on staging and exercise the complete authenticated workflow with a configured provider; historical source-branch evidence does not establish that acceptance.

The prior `DELIVERY.md` records 212 passing tests and local browser/Word observations on the old feature branch. Those are historical branch-local results, not results of this read-only review and not proof for the newly reconciled dev tree.

## Content fingerprints of the reviewed controls

These hashes identify source observed during the moving merge; they are not a deployable tree hash:

```text
packages/core/src/tools/catalog.ts 7f1364fddd9aff610f400ef972cb3901bd736f29957d126c410a713d59baa4ed
packages/core/src/tools/documents.ts 10a2a9a1ce54fc929ee394c57eff1041c49cbeddb12f8ba700509046acdb350d
packages/core/src/content/documentReview.ts 7bd69fa49d7b09ba73c5627ddf9684e3e68a4cd558c1cc1d019bf1095b1c4d56
packages/core/src/content/docx/inspect.ts 46203b556d3f1c7ab6ae7c277e10d0532be212b48c4fc78f09b21028a9bbd193
packages/core/src/content/docx/inspection.ts e982c8303e3d5a3f4b79525e80af45c8e7cd5951242275a2c4b0e3d090aa9f56
apps/web/src/routes/_auth/settings/-components/PracticeProfileCard.tsx 2adbbfd812dc5bea735f8e63a8bd1494cd7ddd14e41a2726a7fdc7731eb32214
```
