# TypeScript integration review — 17 November 2026

The review began at integration `dev` revision `04642c1536095ea2098ada5183bfe17aa0a687a2`
and continued through the scoped readability commit
`e3ce32cae608a80719a55403f681c42b4fa5b83d`, compared with `origin/main`
`ac8a5fa585de62851ee441e8eb77d3f4c2970db9`. The TypeScript specialist and
`simplify-code` instructions were read. This is a source review of consequential boundaries,
not an exhaustive independent audit of every changed line. The coordinator subsequently
authorized the bounded fixes and regressions recorded below; they remain unstaged.

## Findings

### 1. [P2] Durable review acceptance can publish after editor authority was removed

Source: `packages/core/src/ai/tabular/jobs.ts:95–126,127–243`.

`queueReviewRun()` checks editor access before estimating the run, then enters a separate
publication transaction. Its `recordCommitInTransaction` callback checks source read access
but does not recheck review editor authority or refresh the accepted token. A non-owning
matter editor downgraded to viewer after the estimate can still retain source read access,
freeze an ad-hoc review snapshot, insert jobs and append a `run_queued` audit commit.

The worker subsequently calls `authorizeJob()`, so this finding establishes an unauthorized
queue/audit mutation, not a demonstrated inference or billing bypass. The new Postgres race
test reproduced the bug before the fix: the downgraded request succeeded when it should have
returned `access_denied`.

Use the existing transaction access boundary to hold current account, credential and relevant
membership authority stable before any snapshot/job write. Refresh token restrictions under
the same transaction; never widen the scope accepted by the request. Retain worker admission,
spend reservation, source checks, idempotency and audit publication as separate boundaries.

**Applied:** acceptance now shared-locks the credential, intersects the request actor with
current token restrictions and holds the existing matter-editor/account locks before writing.
Source access uses that narrowed actor, and new jobs retain it. The original request identity
remains in the idempotency fingerprint. No new access helper was needed. The real Postgres
race now returns `access_denied` with snapshot, jobs, audit head and commits unchanged.

### 2. [P2] Assistant cancellation feedback overstates a local streaming stop

Sources: `apps/web/src/routes/_auth/assistant/-components/useChatSession.ts:144–145,352–364`;
`ResponseNotice.tsx:7–12`; `apps/web/src/server/http/routes/chat.ts:575–579,825–946,1019–1036`.

The browser aborts its own fetch and sets `outcome = "stopped"`; the new notice says
“Response stopped”. The server's `runAssistant` has no request/stream cancellation input or
check, and its model/tool loop is independent of the browser reader. A stopped view therefore
does not establish that server processing, later tool mutations or provider usage stopped.
The underlying transport behavior predates this integration, but the affirmative outcome text
is new. Actual disconnect timing and provider behavior remain **UNRUN** here.

**Applied:** the notice now says “Streaming stopped” and uses one scenario-specific paragraph
to retain the original request/partial-output context and explain that processing/provider usage
may continue, directing the user to the saved conversation/history before sending again.
The workflow's separate promise that Stop pauses dispatch of its remaining client-side steps
is preserved. Implementing server cancellation would require its own explicit dispatch/apply
boundary and runtime test; provider abort alone cannot rewind already committed mutations or
guarantee zero usage. `assistant-execution.js` now expects the accurate title and qualification.
The shared UI quality reference was consulted for accurate outcomes and avoiding duplicate
helper text. The copy and assertion still need the final browser replay; server cancellation
is not claimed by this change.

### 3. [P1] Subscription job retry can indirectly admit provider inference

Sources: `packages/core/src/tools/jobs.ts:89–107`; `core/jobs.ts:638–746`;
`content/extractionQueue.ts:56–60`; `apps/web/src/server/mcp/server.ts:73–78`.

The subscription catalog exposes `retry_job`, but its original handler accepts both extraction
and provider-backed `review_cell` jobs. Retrying a failed application review changes it to
queued and wakes the worker; the worker can then use the original user's provider key. This
breaks the MCP contract that subscription tools do not invoke GitMatter's LLM providers, even
though direct `run_cell` and `draft_playbook` tools are excluded. The original reachable path
is established by source; no paid provider dispatch was attempted.

**Applied:** the existing trusted catalog execution mode now reaches the job tools. In
subscription mode, `retry_job` calls a dedicated `retryExtractionJob` operation. Its core
transaction checks the locked job kind before authorization, idempotent replay, audit or job
mutation. General application retries remain available through the existing operation. The
tool description states the extraction-only boundary.

The added MCP transport/Postgres test checks failed and already-accepted/replayed review jobs:
denial must leave job, audit and spend unchanged and never start the worker. The same test
then retries a failed extraction and observes the stubbed worker wake. No provider or real
worker runs in this test. This case passed after the coordinator restored the isolated
database and local HTTP object storage; see the evidence log below.

## Boundaries inspected and preserved

- Captured review text is used directly for inference. Current source/version and cell ownership
  are rechecked before applying results; `stageCellProposal` also checks current approved policy.
  The new local chunk helper preserves the exact version-or-NULL predicate, including the
  unversioned-source case. No newer-source fallback was found in these reviewed paths.
- MCP constructs the catalog in subscription mode, excludes direct provider-execution tools and
  human-only decisions, and read-only document context does not enable embeddings. Finding 3
  closes the indirect retry path in source and local MCP transport checks. Preparation of
  guided tasks, templates and playbook reviews does not invoke a model in the traced paths.
- Template revisions are inserted immutably; publication binds the reviewed revision and
  expected audit head, while new drafts retain the previous published pointer. Download checks
  template ownership, selected revision and recorded original hash. The pending template UI
  capability-narrowing changes in the original checkout are outside this source snapshot.
- Spend admission disables automatic SDK retries and retains unknown reservations on ambiguous
  outcomes. Reservation heartbeats and storage deadlines have explicit cleanup. Durable job
  authorization and lease/source fencing remain necessary even after fixing queue acceptance.
- The scoped readability changes improve the actual policy/read boundaries without adding a
  generic abstraction. No broader refactor is justified for this integration.

## Evidence limits

No app, fixture, database or worker was started or stopped by this reviewer. No index, branch,
commit, push or release state was changed. Synthetic fixture rows were created and removed by
the focused integration tests. The coordinator reports a 504-test full-suite pass at
`04642c1`; that is inherited evidence, not a fresh whole-repository result.

- The new editor downgrade race failed on the original source and passed after the fix.
- Before the retry change, `review-jobs`, `job-controls` and `sync-review-races` passed all
  **17 tests in three files, with no skips**, using the supplied isolated Postgres and local
  HTTP MinIO configuration. No real provider execution occurred.
- Scoped `vp check --fix` passed the **eight changed TypeScript files** and the affected
  assistant acceptance script, without warnings, lint or type errors. Formatting changes
  were limited to those owned files. `node --check` passed the acceptance script.
- `vp run --filter=@workspace/core typecheck`, `vp run --filter=web typecheck` and
  `git diff --check` passed after the final source changes.
- A subsequent four-file test invocation could not establish Postgres connections:
  `ECONNREFUSED 127.0.0.1:55434`. Three database-free MCP protocol/catalog tests passed; the
  integration suites failed setup, so their skipped cases are not acceptance evidence.
  A read-only Docker check also found its OrbStack socket absent. The coordinator was
  notified; this reviewer did not restart shared infrastructure.
- After the coordinator restored the synthetic services, the exact four-file command passed
  **25 tests in four files, with no skips** in 8.34 seconds. This includes the editor downgrade
  publication race, subscription provider-job retry denial before both new requests and
  idempotent replay, successful extraction retry, and existing local MCP NDA workflows.
  These use real local Postgres/HTTP MinIO and in-memory MCP transport, with the retry test's
  worker explicitly stubbed. They do not establish external authentication, real-provider
  billing or deployed runtime acceptance.

The final combined diff was reviewed with `simplify-code`: the dedicated retry operation names
a real capability boundary; no generic policy framework, agent-label inference or broad access
refactor was introduced. Fresh final-source HTTP/browser, real-provider cancellation/settlement,
native Word, authenticated external MCP and deployed-revision acceptance remain separate gates.

Historical memory was used only to preserve that distinction between local and deployed
evidence; all source findings above were checked against this integration checkout.
