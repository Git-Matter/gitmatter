# Combined backend readability review — 17 November 2026

Reviewed with `/Users/applecakes/.codex/skills/simplify-code/SKILL.md`.
The initial pass was read-only and wrote only this report. The coordinator subsequently authorised
the bounded source pass described below. No index, branch, dependency, migration or server state
was changed by this reviewer; focused tests used the isolated synthetic database.

## Scope and decision

The combined source range is remote `main` at
`ac8a5fa585de62851ee441e8eb77d3f4c2970db9` through integration `dev` at
`04642c1536095ea2098ada5183bfe17aa0a687a2`, including baseline `21af2e1`, templates,
retrieval/cache metering, research providers, Australian workflows, and the governed review/job
work already present on `dev`. Uncommitted Australian browser evidence and fixture work belong to
the design agent and were left alone.

The review inventoried the complete backend/contracts/database/registry change set and traced
the main transaction, permission, source-version, template publication and provider-spend paths.
Generated migration snapshots were treated as schema evidence, not prose or refactoring targets.
The findings below concern readability; this is not a replacement for security, legal accuracy,
browser or release acceptance.

**Recommendation:** apply the small source pass below. Preserve the existing domain modules and
transaction sequencing. A broad reorganisation or rewrite would add risk without helping the demo.

## Worthwhile edits

### 1. Make practitioner-review denial precedence directly readable

Source: `packages/core/src/content/documentReview.ts:123–136`.

`snapshot()` computes two nested ternaries for the Word-version denial and the overall review
denial. These encode a consequential ordered policy inside punctuation-heavy expressions.
Express the same decision with ordinary guard clauses in a small feature-local function, or a
straight `if`/`else if` block. Keep the exact existing order and messages:

1. Processing is not ready.
2. Extracted/displayed text is blank.
3. A tracked change is pending.
4. A Word version changed during inspection, or its inspection is blocked.
5. Otherwise there is no blocked reason.

Keep all reads, the source fingerprint and the advisory lock where they are. This does not change
what may be attested or introduce another public contract.

Validation after editing: `document-review.test.ts`, `document-approval.test.ts`, and core
TypeScript checks. Existing cases cover the ready/blank/pending/stale/revoked/Word-integrity paths;
new tests that merely repeat the condition order are unnecessary.

### 2. Give the shared current-version chunk read one name

Sources: `packages/core/src/content/chunks.ts:351–362` and `448–461`.

Background embedding and document context independently build the same chunk SELECT: document
ID, the exact current version or SQL NULL, and ascending chunk index. Introduce one local
`listCurrentDocumentChunks(doc)` helper and call it from these two consumers. This removes a
duplicated source-identity boundary and makes both normal paths easier to follow.

Retain the exact predicate, especially the distinction between a version ID and NULL. Keep the
embedding-profile check before the background lookup, the full-text early return before the
context lookup, and explicit chunk-ref filtering over those already constrained rows. Do not
combine the separate vector-join query with this helper or enable embeddings on read-only calls.

Validation after editing: `document-context.test.ts`, `chunks.test.ts`, `embeddings.test.ts`, and
core TypeScript checks. The retired/unversioned chunk and no-paid-read regressions exercise the
important boundaries.

### 3. Remove merge noise and comments that describe superseded behavior

- `packages/contracts/src/index.ts:1–5` contains two versions of the same package introduction.
  Keep one concise schema-only contract comment; the older client path is also outdated.
- `packages/core/src/ai/provider/types.ts:68–69` says missing usage is metered as zero. The current
  spend ledger deliberately retains an unknown reservation. Correct the comment to match that
  behavior; do not change settlement.
- `packages/core/src/platform/queue.ts:43–47` says extraction and every edit enqueue embedding.
  The current caller search finds only the post-commit extraction enqueue at
  `content/extractionQueue.ts:248`; edits rebuild chunks and use explicit generation-time lazy
  embedding. Describe the actual callers.
- `platform/queue.ts:73–76` claims idempotence across development HMR. Its guard is module-local,
  unlike the shared extraction worker's global symbol. Remove that unsupported claim without
  silently changing worker lifetime as part of this readability pass.

These are documentation-only source edits. Formatting and focused lint/type checks are enough;
no new behavior tests are justified.

## Reviewed structures to retain

- **Audit and locking boundaries:** `recordCommitInTransaction`, the explicit document-write
  access lock, captured review input, commit-time rechecks and durable lease fencing serve
  different boundaries. Folding them into one generic wrapper would obscure why each is needed.
- **Spend settlement:** provider and durable-job settlement share field normalisation already.
  Their reservation lookup, principal attribution and release/unknown handling differ. Retain the
  explicit flows rather than introduce a configurable settlement engine.
- **Template listing:** the summary projection removes body/guidance in SQL and applies access,
  search and pagination before returning the page. Do not simplify it by loading complete content
  or moving access filtering to JavaScript. The full-detail and summary overloads have real callers.
- **Template actions:** membership, owner reassignment, submission, publication and archive have
  distinct audit diffs. The common `mutate()` boundary already owns locking/revision checks.
  Splitting every action into a service/repository/factory layer would create more navigation.
- **Transport locality:** the new Hono routes parse requests and map feature errors, while core
  owns domain decisions. No new pass-through service layer is warranted.
- **Contracts and DB schemas:** the added schemas mostly declare domain records directly. Their
  size reflects actual states and evidence, not duplicated runtime behavior. No schema or migration
  rewrite is justified by this review.
- **Word inspection:** practitioner review now calls the shared bounded, recorded-hash inspector
  through a small adapter. Retain that capability boundary rather than restoring the second parser.
- **Research providers:** provider-specific request/response handling belongs in its small module;
  the common catalog applies read-only/open-world metadata once. Do not introduce a speculative
  generic external-API framework to reduce their similar-looking fetch calls.

## Optional later work

`prepareGuidedTask()` at `platform/guided.ts:186–214` looks up selected source IDs repeatedly and
then repeats the lookup to construct order. A local map plus pushing validated sources into the
ordered array would remove the assertion and second scan. With at most 25 sources, this has no
meaningful performance consequence and is lower value than the two policy/read-path edits above.

The template action handler has repeated reviewer-invalidation diffs in the membership and owner
branches. A small pure helper could name that shared transition, but leave it until the template
peer's pending changes are integrated. Do not refactor a moving permission path twice.

The large document, approval and job modules can be organised further over time. Their coherent
transaction sequences should not be split to satisfy arbitrary line counts during this release.

## Applied pass and observed checks

The coordinator authorised findings 1–3. Five source files changed, with 41 lines added and 55
removed:

- `content/documentReview.ts` names the denial policy with ordered guard clauses. Messages and
  precedence are identical; database reads, source-token construction and locks stay in place.
- `content/chunks.ts` uses one local current-version SELECT from both existing consumers. The
  profile/full-text early returns and exact version-or-NULL predicate remain unchanged.
- `contracts/src/index.ts`, provider `types.ts` and `platform/queue.ts` receive the comment/header
  corrections. No worker, provider, settlement or contract behavior changed.

The final source diff was re-read against the combined integration context. No further extraction
was justified. Optional template/guided work above remains a later opportunity.

Observed validation:

- Scoped `vp check` passed all five source files with no warnings, lint or type errors.
- `vp run --filter=@workspace/core typecheck` passed.
- Default `vp test` over `document-review.test.ts`, `document-approval.test.ts`,
  `document-context.test.ts`, `chunks.test.ts` and `embeddings.test.ts`: **32 passed in five files,
  no skips**, with a clean inherited environment and the synthetic local Postgres/MinIO settings.
  Tests use the object/provider substitutes documented in their own files; this is not hosted
  storage or real-provider acceptance.
- `git diff --check` passed. There are no changes under `packages/db` from this pass.

Changes remain unstaged for the coordinator to combine with the other reviewed work. Full
repository completion and release gates still need to run against the final combined revision.
