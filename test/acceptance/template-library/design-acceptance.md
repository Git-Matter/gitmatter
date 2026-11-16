# Template design acceptance

This harness mounts the production template components and HTTP/core operations. It creates a fresh
fictional tenant and five fictional users in the existing loopback Postgres database, and substitutes
a tenant-scoped disk object adapter for remote storage. Only the local harness accepts the
`X-Evidence-Role` persona header. It binds to `127.0.0.1`; this is not an authentication test.

Run from the repository root with the local schema already prepared by the project's normal setup.
The server loads the existing root environment internally and rejects a missing, invalid or remote
database address before importing the database client. It does not print the connection value.

Start these in separate terminals:

```sh
ALLOW_LOCAL_TEMPLATE_ACCEPTANCE=1 vp exec tsx --import ./test/acceptance/template-library/harness/loader.mjs test/acceptance/template-library/harness/server.ts
```

```sh
vp dev --config test/acceptance/template-library/harness/browser/vite.config.ts
```

The UI is at `http://127.0.0.1:4296/`, proxying its API to port 4295. The harness uses the managed Node
runtime's `registerHooks` API. Run `vp env doctor` if that runtime cannot start the loader.

With the Playwright CLI executable or installed skill wrapper:

```sh
PLAYWRIGHT_CLI=/path/to/playwright-cli node test/acceptance/design-workflows/replay.mjs template-library
vp fmt design/evidence/template-library.json
vp exec tsc --noEmit --project test/acceptance/template-library/harness/tsconfig.json
```

`template-lifecycle.js` uses the UI to upload, delegate, submit, request changes, replace and approve
an exact original Word revision. It checks a reader's actual download filename and SHA-256, verifies
that a private next draft leaves the approved bytes unchanged, injects a recoverable download
failure, and checks archive withdrawal.

`template-stale.js` prepares fictional records through the same core/API and uses a second injected
editor to advance a revision while the reviewer is reading. It verifies frozen-source/note retention,
409 rejection, deliberate reload, fresh confirmation, mobile layout, search/filter/focus return,
503 refresh recovery, removal of revoked private content, denied mutation and restore-to-draft.
The injected 503 responses belong only to that browser test; no model, email or remote-storage
service runs through this harness.

The replay writes results and relevant source/script/fixture hashes to `design/evidence/template-library.json`.
Its run ID and tenant ID identify the fresh local fixture. Detailed API statuses and object bytes
remain under `.scratch/template-design-acceptance`; screenshots and downloads are under
`output/playwright/design-workflows`. Replays create distinct fictional records and archive their
completed templates. They do not delete unrelated tenants, users or work.

Evidence boundary: real local persistence and original file identity; injected roles and a disk
adapter. No production authentication, remote-storage, native Word transformation, deployment or
empirical legal-user usability claim is made. Hashes identify relevant files, not a full runtime bundle.

The harness also mirrors the Library screen's controlled route state. A confirmed server mutation or
explicit local discard resolves the unsaved-work guard before the selected-template URL is cleared.
The pending-response case holds an actual local API response, checks the truthful action label,
disables closing and note edits, and confirms that Escape does not discard an in-flight decision.
