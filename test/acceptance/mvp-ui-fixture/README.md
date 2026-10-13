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

The approval queue includes two compatible cell proposals for an atomic batch, a workflow
change and an exact export request. Review limits render the production admin form. Document
decisions mount the production document view in the isolated router; its session API returns null.
The isolated config replaces the auth client import with a hook returning no session, so the SDK
cannot capture a native fetch before the fixture adapter is installed.
Displayed authors are fictional. Decisions only update in-memory fixture state. Downloaded DOCX
bytes remain the fixed synthetic source, so this fixture does not establish Word transformation.

This is UI interaction and responsive proof only. It does not replace authenticated browser,
staging, provider-quality, Word round-trip or pilot evidence.
