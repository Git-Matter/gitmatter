# Final architecture review - 17 November 2026

**Decision:** retain the integrated architecture and close the bounded authorization and privacy
fixes below. No new service, queue framework, repository layer or general refactor is justified
for this consolidation. The source preserves the product's useful distinction between an agent's
proposal, a human decision and an attributable legal artifact.

The review used integration `dev` at `e3ce32cae608a80719a55403f681c42b4fa5b83d`, its pending
TypeScript queue/retry fixes and the current integration plans. The protected local
`feat/native-agent-workflow` ref was read and remains
`26b729dc1711b7c9d4a2f1188c1dfea682cd6bbd`. The forthcoming runtime migration and original
checkout's pending UI/template patches are outside this snapshot and need combined validation.
No branch, index, commit, push, server or shared database state was changed by this reviewer.

The initial assignment was read-only. The coordinator subsequently authorized the specific
embedding failure privacy fix described below. Only its three source files, one synthetic test
file and this report were written by this reviewer.

## Consequential boundaries

### Queue acceptance and identity: source fix accepted

`ai/tabular/jobs.ts:127-145` now checks current editor authority inside the transaction owned by
`recordCommitInTransaction`, before capturing source text or inserting any job. The existing
artifact advisory lock serializes review publication. The credential row is locked for share,
`refreshProviderActor` checks its owner/revocation and intersects its scope with the request's
accepted scope, and `hasMatterAccessInTransaction` holds matter, account and membership authority
stable through publication.

Keeping the original request actor in the idempotency fingerprint is correct: the same request
must retain one identity. Storing the narrowed current actor in the durable job is also correct:
later token widening must not widen the authority already accepted. Commit attribution records
the same initiating user/agent identity; it does not grant authority. Worker admission, spend
reservation, lease fencing, current source and cell checks remain separate necessary boundaries.

The TypeScript specialist reports an actual Postgres editor-to-viewer regression reproduced
unauthorized publication before the patch and passed after it, with no snapshot, job or audit
publication. Their 17-test result is inherited evidence, not an independently rerun result here.

### Subscription retries: smallest useful domain restriction

The TypeScript specialist's additional finding was real in source: subscription MCP exposed the
general `retry_job`, which could requeue a provider-backed review job. This established a path
to admitting provider work despite the subscription contract. No actual paid call was observed.

The pending fix is proportionate. Trusted catalog mode reaches `buildJobTools`; subscription
calls select `retryExtractionJob`; `core/jobs.ts:640-660` enforces the required kind after its
locked job read and before idempotent replay or writes. Human application retry behavior remains
with the general operation. A label heuristic or removal of extraction recovery is unnecessary.

After the synthetic database listener was restored, the TypeScript specialist reports a fresh
four-file run passed **25 tests with no skips** against local Postgres and HTTP MinIO. The actual
MCP transport test denied both a new failed-review retry and a previously accepted review retry
request without row, audit, spend or worker-start effects, then allowed eligible source-extraction
retry with a stubbed worker wake. This is inherited local transport evidence, not an independently
rerun result or proof of actual provider execution here.

### Captured sources and current retrieval: retain both roles

Snapshot-bound review inference reads captured text directly in `ai/tabular/runner.ts` and
`ai/tabular/jobs.ts`. Application of its result rechecks the review fingerprint, source version,
exact source text, current access and expected cell commit. Current approved policy is checked
separately. No newer indexed-source fallback was found in the inspected snapshot paths.

`content/chunks.ts` filters current chunks by the exact version or SQL NULL; explicit chunk refs
are selected from those constrained rows. Vector lookup also binds document, tenant, version,
profile, dimensions and content hash. Read-only document context omits `allowEmbedding`; a chat
key alone does not configure embeddings. Partial retrieval remains labelled as partial. These
are useful direct feature boundaries and should not be folded into a generalized retrieval layer.

### Spend and resource ownership: preserve conservative uncertainty

`ai/provider/spend.ts` and `core/job-spend.ts` keep admission/dispatch/settlement distinct. The
provider request disables SDK retries, a durable attempt cannot reserve twice, dispatch refreshes
authority, and unknown outcomes retain their reservation rather than becoming a free completion.
Lease expiry limits concurrency; it does not erase uncertain spend. Heartbeat timers are cleared
in `finally`. Cache/reasoning token normalization and usage fields do not establish actual invoice
reconciliation or a guaranteed caching discount.

Staged objects have a durable write intent, an attachment transition in the publication
transaction, and bounded cleanup of recorded unpublished keys. Template object accounting counts
shared immutable bytes once. No unowned broad bucket cleanup is introduced.

### Word inspection and templates: distinct authorities remain intact

`content/documentReview.ts` uses the shared `docx/inspection.ts` authority through its small
adapter. It inspects recorded immutable Word bytes, rejects hash mismatch/unsupported or incoming
revisions, and compares the inspected version under the document lock. The human review token
also captures content revision and pending edits, so an edit and reversal cannot revive an old
attestation. This record remains separate from accepting a tracked change or approving clean
output.

`content/templates.ts` inserts immutable revisions, binds publication to the reviewed draft
revision and expected audit head, and retains the published pointer while a private draft changes.
Original-file language cannot be replaced by editing only its extracted preview. Download binds
the selected revision to its template and verifies recorded original bytes. Staged-file ownership
and tenant-scoped object access remain in the existing storage boundary. No additional
high-confidence source defect was established in these inspected paths.

## Privacy finding closed in source

**P2 - Embedding failures forwarded arbitrary provider text to logs and queue failure records.**
Previously, `ai/embeddings.ts` included Voyage's response body in an error, and retrieval/worker
logging copied error messages. SDK errors could also carry arbitrary response text into BullMQ's
retained failure reason. The source established unsafe forwarding; no real private data or key
exposure was observed.

The authorized fix keeps a small embedding-owned failure boundary:

- `ai/embeddings.ts` throws a constant message with only a validated numeric HTTP status and no
  raw cause. Failed HTTP response bodies are cancelled without reading them. Empty-input and
  profile resolution behavior remains outside provider error normalization.
- `content/chunks.ts` retains keyword fallback and records constant retrieval stage/code plus
  safe status. It does not record the provider message.
- `platform/queue.ts` retains document identity, attempt count and stage/code, with safe provider
  status for indexing failures. Enqueue errors also stop copying arbitrary messages. Retry,
  backoff and worker behavior are unchanged.
- `test/embedding-errors.test.ts` uses a synthetic private marker, fake SDK/HTTP and queue,
  mocked storage reads and no database/network connection. It checks that raw bodies are not
  read, thrown SDK failures have no raw cause/message, logs omit the marker and invalid status,
  and successful vectors/usage, blank-input behavior and keyword fallback remain intact.

The `simplify-code` review kept this policy beside embedding execution, reused the one safe
metadata projection for its real consumers, and kept provider routing in one direct function.
No global error framework or unrelated cleanup was added.

The TypeScript specialist independently reviewed the final privacy diff in source and found no
further issue. SDK behavior remains inside the safe boundary; BullMQ's fixed retry/backoff policy
does not branch on the replaced error class or message. The queue's metadata import creates no
path back to queue/chunks or new eager initialization in the inspected dependency graph.

Observed final checks for this patch:

- Scoped `vp check` passed all four code/test files with no warnings, lint or type errors.
- `vp run --filter=@workspace/core typecheck` passed.
- `vp test` over `embedding-errors.test.ts`, `embeddings.test.ts` and `chunks.test.ts` passed:
  **15 tests in three files, no skips**. The two existing import graphs required a syntactically
  valid `DATABASE_URL`; a nonconnecting synthetic loopback URL was supplied. Their first attempt
  without it failed setup, not a test assertion. These tests performed no database mutations,
  provider requests or Redis connections.
- `git diff --check` passed.

## Remaining proof and delivery

This review does not reopen solved findings or promote source inspection to runtime acceptance.
The coordinator's earlier 504-test/default-run and fresh/upgrade migration evidence remain their
own checkpoint. The final combined source still needs the repository, migration, build and design
gates and current browser journeys. Keep the specialist's new retry regression in those final checks.

Real provider output/usage and ambiguous-outcome recovery, authenticated MCP, stored-file HTTP
transformation, native Word save/reopen, staging and production remain separate evidence tiers.
The supplied staging web image-pull failure and absent exact deployed-revision proof prevent a
release claim. An old healthy service, green image build, authored fixture or past screenshot does
not close those gates. The coordinator owns Git delivery, release decisions, branch cleanup and
the protected-ref recheck after final integration.
