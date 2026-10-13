# Synthetic MVP UI fixture

Run from the repository root:

```sh
vp dev --config test/acceptance/mvp-ui-fixture/vite.config.ts
```

Open `http://127.0.0.1:4286`. This standalone Vite+ entry renders the production contract
review, completion, matter overview and approval components with synthetic API responses.
It loads no environment files and creates no authenticated session. Its fetch adapter rejects
unimplemented API calls; it cannot call a provider or mutate application data.

Use the scenario selector for partial findings, an uncertain failed rule, invalid quotations,
stale source, completed decisions and a viewer. Check Document/Findings switching at mobile width,
quotation highlighting, approved replacement previews, escalation/unchanged decisions,
failed-only retry acknowledgement, report actions and export approval state.

The guided-first-review view renders the production guide and review setup. Start with
"First review — ready to prepare", choose Application model or Connected agent, optionally choose
a model, then prepare the synthetic source and standard with explicit known or unknown instructions.
Preparation saves only fixture memory, refreshes guide progress and opens pending findings; it never
runs a provider. The saved-review URL mounts the actual production review controller, including
connected-agent Run guards, model hints and estimates. Synthetic API counters show metadata and
execution requests; execution endpoints are blocked and actual provider calls remain zero.
Other guide scenarios cover missing configuration, approved standards and source
extraction. No upload API is implemented, so uploads fail closed inside this fixture.

Review scenarios also cover historical V1 instructions and explicit unknown V2 context. The Word
inspection view and actual document/review components show safe, incoming, unsupported non-body
and unavailable inspection states. Word counts, byte hashes, permissions and progress are fictional
responses; the downloaded bytes remain the same fixed source in every scenario.

Check fixture types with `vp exec tsc --project test/acceptance/mvp-ui-fixture/tsconfig.json`.

The approval queue includes two compatible cell proposals for an atomic batch, a workflow
change and an exact export request. Review limits render the production admin form. Document
decisions mount the production document view in the isolated router; its session API returns null.
The isolated config replaces the auth client import with a hook returning no session, so the SDK
cannot capture a native fetch before the fixture adapter is installed.
Displayed authors are fictional. Decisions only update in-memory fixture state. Downloaded DOCX
bytes remain the fixed synthetic source, so this fixture does not establish Word transformation.

This is UI interaction and responsive proof only. It does not replace authenticated browser,
staging, provider-quality, Word round-trip or pilot evidence.
