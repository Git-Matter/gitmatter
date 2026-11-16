# Australian workflow component fixture

Actual guided preparation, practice preferences and practitioner-review components run behind a
memory router and their shared production draft guards. Browser entry points intercept every API
request. Unhandled API requests fail closed; no server environment, authentication, model provider,
object storage or real legal source is connected.

Start only while the main application and other fixtures are stopped:

```sh
vp dev --config test/acceptance/australian-ui-fixture/vite.config.ts
```

The one server uses `http://127.0.0.1:4280`. Its displayed source and render-readiness flag are
fictional controls for the review panel; this fixture does not prove actual Word/PDF rendering,
immutable object-storage bytes or server authorization. Core integration tests cover source hashes
and current-state-token enforcement separately. A prepared guided result only invokes the fixture's
draft callback, so zero model requests here is not full assistant dispatch acceptance.

Use `playwright-cli run-code --filename=test/acceptance/design-workflows/australian-workflows.js`.
The entry point returns explicit component-interaction assertions. Do not infer production release
acceptance from screenshots or transport fixtures. Stop this server and restore the main app after
the replay.
