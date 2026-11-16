# Template lifecycle release review — 16 November 2026

## Decision

**HOLD runtime release acceptance.** The original six product findings have
substantive implementations in the current sources. The HTTP 200 private-view
revocation finding below is now patched in source in the 17 November follow-up.
Its new real-harness browser scenarios remain unrun pending the coordinator's
fixture slot. Real-session, remote-storage and deployed-revision acceptance also
remains necessary.

The initial independent review was **read-only** and wrote only this report. The
17 November follow-up was explicitly authorized to modify template client modules
and template-specific tests. Neither task started or stopped the app, fixtures or
workers; ran database tests or migrations; inspected credentials; or changed the
Git index or branches. The coordinator owns integration, browser acceptance and
the single app at `http://127.0.0.1:4280`.

Review began with `21af2e1` at HEAD, preserving the consolidated implementation.
During coordination HEAD advanced to
`901da975ca74c41b68207a58b9b9955db968f76c`. The template core/contracts/schema,
HTTP routes and Library sources had no uncommitted diff at the final inspection;
the shared `apps/web/src/lib/data/snapshot-refresh.ts` was being edited by another
session. Recheck this report against the final integrated revision.

## Source finding and implementation follow-up

### P2 — Successful permission redaction did not remove a frozen private snapshot

Status: addressed in the scoped source patch below; browser runtime verification
of this exact HTTP 200 transition is still **UNRUN**. Line references in the
original finding describe the inspected pre-patch source.

Source locations:

- `packages/core/src/content/templates.ts:237-278`: after losing team membership,
  a user can still receive HTTP 200 for a workspace-published template. The fresh
  DTO correctly has `canManage: false`, `draft: null`, no members/review note,
  and only the published revision. This is intended server behavior.
- `apps/web/src/routes/_auth/library/-components/TemplatesSection.tsx:88-93`:
  an already opened detail remains active when that successful response arrives.
  The retention check handles errors, not a successful capability downgrade.
- `apps/web/src/routes/_auth/library/-components/TemplateDetail.tsx:76-90`:
  `snapshot` remains the previously opened object. New `item`/summary heads make
  the view stale, but the content is still selected from `snapshot.draft`.
- `TemplateDetail.tsx:557-564` also decides whether to show team/history from
  `snapshot.canManage`, rather than the fresh access capabilities.

Source-verified reproduction path, **not browser-executed by this review**:

1. Publish v1 to the workspace, then prepare private working v2.
2. A delegated editor/reviewer opens v2 (use a text-backed template for the
   simplest reproduction; also test a DOCX whose preview has already loaded).
3. The owner removes that user's template membership, or transfers ownership
   away from a former owner who has no remaining delegation.
4. Refresh the open user's list/detail queries.
5. The server returns a valid reader DTO for published v1 with HTTP 200. The
   existing dialog still selects its older private v2 snapshot and stale team
   capabilities. The stale banner disables decisions but does not remove the
   private content already rendered.

This is **cached client disclosure/recovery**, not a demonstrated server mutation
or new-file download bypass. The core rechecks membership and refuses unauthorized
mutations/private downloads. Nevertheless it violates the documented distinction
between retaining a snapshot through an outage and removing private views after
authoritative loss of access.

Required behavior: treat a successful reduction of draft/team capability as
authoritative, separately from an ordinary changed revision. Hide/remove the
private revision and stale team/history state. If the user's own unfinished note
must remain copyable, retain it separately without retaining private source content
or decision authority. Do not silently clear a note or automatically approve/retry.

Coverage gap: `test/acceptance/design-workflows/template-stale.js:279-299`
removes a reviewer from an **unpublished** template, producing 403/404 and testing
the error branch. It does not cover the HTTP 200 redacted-reader transition above.
Add both the published-plus-private-draft removal and ownership-transfer variants.

### 17 November scoped implementation

The patch distinguishes a changed authorized revision from a successful loss of
private access. It does not change server policy, schema, storage or mutation
semantics:

- `template-access.ts` intersects opened, latest detail and optional latest summary
  capabilities. New permissions are not silently adopted by an existing review.
  Loss of team/private-source visibility revokes the private view; an ordinary
  head change does not.
- `TemplatesSection.tsx` passes authoritative summary capabilities to the detail
  view, so a known narrowing does not wait for an older detail placeholder.
- `TemplateDetail.tsx` unmounts the private document, working-version comparison,
  team/history and dependent actions. A separate access-changed view renders only
  the fresh approved reader DTO, or waits for it without showing an old source.
  The user's locally authored note remains separately copyable and read-only.
  Approved downloads target the current permitted revision. Previous review
  acknowledgements are cleared and queued edit/lifecycle intents cannot reuse
  removed authority. Partial role reductions clamp controls while retaining source
  access that is still authorized.
- Six pure unit scenarios in `test/template-access.test.ts` cover redacted success,
  summary-first narrowing, ordinary revision changes, partial review/edit loss,
  ownership authority loss and disappearance of a private working source.
- The existing `template-stale.js` function now also prepares published v1 plus
  private v2 and exercises reviewer removal for an original DOCX and ownership
  transfer for a text template. It requires HTTP 200 with a redacted reader DTO,
  absence of private source/guidance/compare/team/actions, separately preserved
  local input, an approved-version browser download, rejection of a direct private
  file request, and no publication change from local recovery. Original DOCX bytes
  must remain equal; text templates check source/revision identity because their
  regenerated DOCX ZIP bytes are not promised to be deterministic.

No edits were made to `replay.mjs`, shared helpers, server access code or the
template harness server. Existing coordinator changes were preserved.

| Follow-up check                                                                             | Result                                                                                                                                                                                                                      |
| ------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vp test test/template-access.test.ts`                                                      | 6 passed; pure client-boundary tests, no database imports or I/O.                                                                                                                                                           |
| Scoped `vp lint` on changed template modules/tests                                          | Passed.                                                                                                                                                                                                                     |
| `vp run typecheck`                                                                          | Passed, 6 checked packages.                                                                                                                                                                                                 |
| `vp run design:check`                                                                       | Passed: 331 authored source files, 22 theme contrast pairs, 0 failures. This is policy scanning, not runtime usability acceptance.                                                                                          |
| Scoped `vp fmt --check`, `node --check template-stale.js`, `git diff --check`               | Passed.                                                                                                                                                                                                                     |
| Whole-repository `vp check`                                                                 | Final rerun passed: 898 files correctly formatted; 641 files with zero warnings, lint errors or type errors. An earlier attempt stopped on coordinator-owned UploadFeedback.tsx formatting, which this task left untouched. |
| Template browser replay, DB/HTTP template tests, real authentication and configured storage | **UNRUN by this follow-up**; no server or database-test slot was taken.                                                                                                                                                     |

Exact remaining regression acceptance: run the extended template replay on the
coordinator-controlled real local harness. Both `successfulCapabilityNarrowing`
results must report HTTP 200, removed private UI, preserved local note, unchanged
approved revision and denied private download. Also rerun the existing ordinary
stale/503/403 paths to prove transient retention and frozen-source review are
unchanged. Only then regenerate template evidence hashes. This is not yet a
browser-verified or release-accepted fix.

The coordinator must also add the new `template-access.ts` module to the template
group's explicit relevant-source hash list in `replay.mjs` before regenerating
evidence. This task did not change that shared runner, as requested. The extended
`template-stale.js` itself is already part of the registered group.

### Mandatory readability review — 17 November

Loaded and applied `/Users/applecakes/.codex/skills/simplify-code/SKILL.md` to the
final scoped patch, including the complete revocation paths and browser scenario.
The review kept the implementation feature-local and made these behavior-preserving
improvements:

- Named the authority inputs `latestDetail` and `latestSummary`, separately from
  the deliberately opened revision.
- Kept the revocation flag separate from the server-shaped snapshot passed to
  existing feature components.
- Narrowed the approved-only view's input type to its template ID and published
  revision; removed a redundant revocation condition after the early return.
- Gave the two published-revocation browser cases one named scenario helper while
  preserving their serial request sequence, assertions and result records.
- Clarified the pure-test fixture's approved title and guidance.

No broader extraction, shared component change, server change or speculative
abstraction was justified. The existing local components already separate the
review decision and approved-reader fallback coherently.

After review, all 6 pure tests, scoped lint, package typechecks, design policy,
script syntax and diff checks passed. The subsequent whole-repository `vp check` stopped on formatting
in the coordinator-owned `test/acceptance/design-workflows/feedback-recovery.js`.
This is a newer integration blocker than the earlier passing checkpoint above;
the file was not changed by this task. Root must rerun the combined gate after that
parallel work settles. Browser/DB acceptance remains **UNRUN by this reviewer**.

The coordinator's explicit no-Git-mutation instruction remains an applicable hold
under the standing commit-and-push authorization. No index, branch, commit or push
operation was performed here.

## What the source review supports

No additional P1 server authorization, original-file substitution or approval-head
bypass was identified in the reviewed paths. This is a source conclusion, not an
authentication or penetration-test sign-off.

| Contract                                              | Current implementation                                                                                                                                                                                                                                           | Required release proof                                                                                                |
| ----------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Every lifecycle/team/content mutation is attributable | `recordCommit` takes the artifact advisory lock before its apply callback; `mutate` rereads actor/context and expected head inside that transaction. Publication, reviewer changes and restoration include field changes.                                        | Real DB concurrency/rollback and audit assertions at the final revision.                                              |
| Approval is of a deliberate exact revision            | Server requires review state, current expected head and matching draft revision. Only a human assigned reviewer/admin can decide. UI freezes the opened revision, separates published/working views and requires a new acknowledgement after reload.             | Two-session browser stale approval and pending-response checks, including the current shared guards.                  |
| Original DOCX stays the source of truth               | Upload derives text and SHA-256 from server-received bytes, rejects unsafe/unresolved tracked-change sources, and stores immutable source metadata. Body changes without a replacement file are rejected. Downloads retrieve original bytes and verify the hash. | Real configured object-store roundtrip and native Word checks, not only mocked I/O.                                   |
| New drafts do not replace the publication             | Saving changes the draft pointer, returns it to draft and clears reviewer assignment. The published pointer remains until approval or the defined restore behavior.                                                                                              | Reader hash/filename/revision checks before and after a new private draft.                                            |
| Scoped collaboration                                  | Owners/admins manage membership; editors revise; assigned reviewers decide. Cross-tenant targets are rejected. Removed/downgraded reviewers and ownership transfer invalidate pending reviewer authority.                                                        | Real cookie-session roles, revocation and cross-tenant tests; add the 200-response client case above.                 |
| Archive/restore is explicit                           | Archive removes reader listing/download availability; authorized collaborators can inspect historical source. Restore clears publication metadata and requires fresh review.                                                                                     | Current app browser + HTTP checks; existing downloaded copies cannot be recalled.                                     |
| Bounded collection                                    | HTTP and MCP listing use metadata projections without body/guidance, ACL/search/view filters and 50-default/100-max keyset pages; detail fetch is separate.                                                                                                      | Current list/detail/MCP assertions and a representative-size interaction pass; no performance benchmark was run here. |
| Stored bytes and quota stay coherent                  | Shared staging counts template objects, deduplicates reused paths for quota, and protects referenced files during orphan reconciliation.                                                                                                                         | Real DB + selected test-store failure/reconciliation checks, and separate configured-store verification.              |

Per-artifact reader access is not a workspace-wide sales/read-only account role.
Any workspace member can create a draft and becomes that artifact's owner; owner
delegation is the implemented authority model. Do not market this as an
organization-wide legal-role approval policy or enforced separation of duties.
An admin can decide another assigned review and can approve their own work under
the current policy. These are policy boundaries, not newly introduced source bugs.

## Evidence freshness

The inspected `design/evidence/template-library.json` lists 44 relevant source,
script and fixture hashes. Recomputing them at final inspection found **11
mismatches**:

- `design/tokens.json`
- `apps/web/src/styles/tokens.css`
- `apps/web/src/components/UnsavedChangesGuard.tsx`
- `apps/web/src/lib/data/snapshot-refresh.ts`
- `apps/web/src/routes/_auth/library/-components/TemplateDetail.tsx`
- `apps/web/src/routes/_auth/library/-components/TemplateEditor.tsx`
- `apps/web/src/routes/_auth/library/-components/TemplateTeam.tsx`
- `apps/web/src/routes/_auth/library/index.tsx`
- `test/acceptance/template-library/harness/browser/vite.config.ts`
- `apps/web/src/components/ui/checkbox.tsx`
- `apps/web/src/components/AppFrame.tsx`

The stored record explicitly uses injected fictional personas, local Postgres and
a disk test object adapter. It is useful historical integration evidence. It is
not fresh acceptance of these changed shared/UI sources, real production-session
authentication, configured remote storage or deployment. Regenerate it only by a
successful replay after integration; never update hashes to make an old run appear
current. The earlier video likewise needs its own source manifest checked before
being described as a current design demonstration.

The three tracked original DOCX fixtures currently match every size and SHA-256
in `test/acceptance/template-library/fixtures/manifest.json`. This is a read-only
fixture integrity check, not an upload/download execution.

Current source inventory has 14 `test(...)` declarations in
`packages/core/test/templates.test.ts` and one route test declaration. The core
tests use real Postgres and mocked object I/O. The route test explicitly injects
the acting identity instead of running production session middleware. Their source
coverage includes concurrency, role isolation, owner transfer, exact source bytes,
corruption, tracked/invalid file rejection, quota/path reuse, stale upload sweep,
paging and private search. **None of these database/HTTP tests were executed by this task.**

## Coordinator-owned verification sequence

### 1. Final integration and database

Keep the main app stopped while the coordinator runs the isolated integration
tests; do not let live extraction workers mutate shared test fixtures. Do not start
another app on a different port. After merging the recovery/marketing work, run:

```sh
vp check
vp run typecheck
vp run design:check
vp test
vp run docs:tools:check
vp run fixtures:nda:check
vp run --filter=@workspace/db generate
vp run build
```

Use the current repository toolchain/configuration. Inspect any generated migration
diff; do not silently commit new schema drift. Migrations `0019` and `0020` must be
applied to the intended acceptance database and later to the deployed environment.
Focused follow-up after a full-suite failure, if necessary:

```sh
vp test packages/core/test/templates.test.ts apps/web/src/server/http/routes/templates.test.ts
```

Keep the default test result distinct from any explicit extended-timeout retry.
The coordinator's current matrix reports seven DOCX/upload failures during a
live-worker run; that result is not a passing suite or an established template
regression. Classify it with the workers stopped before relying on release counts.

Required DB assertions: concurrent edits/decisions have one winner and no partial
revision/commit; commits have monotonic sequence/parent linkage and actor/diff;
stale upload bytes remain reclaimable; a referenced template object survives
reconciliation; metadata revisions count reused bytes once; removed/reassigned
reviewers cannot use an old head. Failed/denied actions must not advance publication.

### 2. Current browser workflow on the isolated acceptance surface

The coordinator owns startup/stop of the documented template harness. Run it
serially with the main app stopped, using its current 4280 UI configuration and
temporary supporting API process. Then run the documented template-library replay
and inspect its structured results, not just the CLI exit status:

```sh
PLAYWRIGHT_CLI=/absolute/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs template-library
```

Verify normal upload/delegation/request-changes/replacement/approval, named reader
download and unchanged publication during private edits. Include dirty close,
Escape, outside dismissal, native navigation, pending response, confirmed action,
transient 503 and successful recovery, server 409, explicit reload/new acknowledgement,
403/404 denial, **200 redaction after role loss**, cancelled/resumed input, archive,
restore, search/filter/Back/focus return, and 390px document scrolling. No local
choice, refresh, checkbox or error recovery may itself create a legal approval.

Recompute relevant hashes only after the passing replay. Stop both fixture
processes and restore the single main app at 4280 before real-session acceptance.
Screenshots/policy scans do not establish complete usability or WCAG conformance.

### 3. Real app authentication and authorization

Use approved ordinary sign-in/session controls with owner, editor, reviewer,
workspace reader, another-tenant user and admin. Do not obtain credentials from
old cookie dumps or print them. Credential tasks must follow the required secret
skill/runtime-resolution workflow. Do not treat `X-Evidence-Role` as authentication:
it is accepted only by the isolated test harness, not the production app routes.

Required checks against the restored app and later intended deployed revision:

- Anonymous template list/detail/download/mutations fail; arbitrary persona headers
  cannot grant access. Main `/api/templates` routes must traverse `requireUser`.
- Fresh mutations reject expired/revoked sessions. Document the read-session cache
  policy separately; template membership and tenant authority are reread in core.
- A reviewer can decide their assigned exact revision but cannot edit/manage its
  team. An editor cannot publish or assign extra authority. A per-artifact reader
  cannot retrieve draft content, guidance/history or a private historical file.
- Cross-tenant IDs, revision IDs, membership targets and pagination cursors fail.
  A revision ID from another artifact must not substitute source bytes.
- Revocation/ownership transfer blocks stale decisions and removes private UI even
  when the same user retains HTTP 200 access to the public current version.
- MCP matter-scoped tokens cannot enter the firm-wide template library; viewer
  caps prohibit writes; agent tools cannot approve/publish/manage human decisions.

### 4. Original Word and configured object storage

Use an explicitly chosen non-production acceptance store unless the coordinator
has authorization for the intended target. A disk adapter and mocked `putObject`
do not prove real provider availability, permissions, region routing or timeouts.

For a clean styled DOCX, record input SHA-256, size and file inspection; upload
through the real authenticated endpoint; publish the exact reviewed revision;
download as a reader and compare the complete bytes, versioned filename,
`Content-Type`, `X-Template-Revision`, and `Cache-Control: no-store`. Repeat after
a new private draft and after approving a replacement. The first case must stay
byte-identical to the prior publication; the second must match the replacement.

Inspect a representative file containing headers/footers, numbering, tables,
styles and signature blocks in native Word. Download/open must not require repair.
If a native edit/save/re-upload cycle is claimed, perform that cycle and verify the
new revision rather than expecting edited bytes to match the old original.
Text-only generated DOCX needs separate readable/openable output checks.

Exercise malformed, tracked-change, oversized, missing-object, corrupt-object,
quota-full, upload-timeout and mid-upload concurrent-edit cases. No unsafe source
may become an approved download, no conflict may delete referenced originals, and
an uncertain request must not be represented as a confirmed save/publication.

### 5. Release promotion

Bind the final source manifest/CI to the integrated revision, then verify the
served revision, readiness and actual schema on the intended staging/production
environment. Repeat the bounded real-session template and original-byte smoke
there. Root coordinates normal release controls; no deployment action or release
approval is performed by this review/follow-up.

## Handoff

Preserve the template audit engine and exact-source implementation. Review the
scoped capability-downgrade patch, execute its browser acceptance in the
coordinator's slot, and retain passing integrated checks before a reviewed
commit/push. Avoid broad backend or styling refactors. Database, real-session,
remote-storage and deployed runtime gates remain coordinator-owned and unexecuted
by this reviewer.
