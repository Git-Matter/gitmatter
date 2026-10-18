# Final visual check and staging verification

Observed 2026-10-18 (Australia/Sydney) against source
`5fb6641419790c479c75a2b9b140ff98f1a6f98e`, the merged PR #14 release candidate.
The actual local application, its retained synthetic account, Postgres and dedicated MinIO were
restored after the machine restarted. No new account or remote authentication setting was created.

**Decision: the local final visual gate passes. Authenticated staging sign-off remains open.**
Review instructions, guided first review and incoming Word inspection retain their bounded local
runtime status. This record complements the [provider and native Word evidence from 2026-10-15](2026-10-15-review-workflow-signoff.md);
it does not repeat model evaluation or native Word round trips.

## Authenticated local visual checks

The Chrome DEV browser loaded the actual application at `http://127.0.0.1:4280` with the retained
Fictional Local Acceptance Reviewer session. These checks used fictional source data and did not
request provider execution, finding decisions or legal-content mutations.

- Reloaded `/first-review?matterId=c61025c9-49ea-4c7c-9f8e-3c926316c8f2`. Saved source and instructions
  remained present. The guide truthfully showed 0 of 4 prepared findings, unresolved human work and
  output not ready; it did not mark the pending review complete.
- Opened legacy review `31ea7ef8-dc06-45ee-ba71-b12592333d05`, whose original audited finding had
  unsupported pagination. The finding displayed its exact quotation without a Page 1 label. Clicking
  “Locate in reviewed source” visibly highlighted `Confidentiality lasts five years from disclosure.`
  in the captured source, with no invented page jump.
- Expanded captured instructions in that review. The represented party, receiving role, mutual NDA,
  business purpose and explicit unknown governing law rendered with the fixed-input explanation.
- Opened the actual Word-saved tracked re-import `7df44e1e-ac35-4b87-9e70-d1c59a64e583`. Its notice
  showed two insertion and two deletion markers, bound to source version `8fc3a235`, distinguished
  extracted accepted-view text from Word layout/notes, and said editing/Word decisions/clean export
  were blocked. With both Find and Replace populated with different valid text, Propose edit stayed
  disabled. The rendered rich document retained the tracked text, table and notes.
- Opened the actual Word-saved clean re-import `c65ec6e2-1162-479a-ac7c-d856393ab97c`. Its notice
  showed zero revisions, bound to version `df9ce6bb`. The three-year term and original disclosure
  wording remained visible. The same nonempty Find/Replace inputs enabled Propose edit. No proposal
  was submitted, and the fields were cleared afterwards.

Private screenshots are retained under `.scratch/review-signoff-2026-10-18/`:
`local-guide-persisted.png`, `local-legacy-quote-highlight.png`, `local-captured-instructions.png`,
`local-word-incoming-blocked.png` and `local-word-clean-ready.png`.
They are excluded from Git and Docker build contexts. Local emulation does not attest real regional
hosting, external agent availability, professional legal judgment or universal DOCX compatibility.

## Fresh staging observations

[Staging run 38738029934](https://github.com/Git-Matter/gitmatter/actions/runs/38738029934) completed
successfully for `5fb6641`. Verification, image builds/pushes and both deployment-trigger steps
passed. Published immutable tags were `staging-5fb6641`:

- Web image: `sha256:d82b52ee6ada73a1d5c2a7ae59d07477c0bf35dfa6f9977cc64372cf4a601852`.
- Docs image: `sha256:8cfe6b8eff3b7d2c55a742019d9cd60aeca107f7e33aab17351a120824e2a07b`.

Public requests to `https://staging.gitmatter.com` established:

- `/api/health/ready` returned HTTP 200 with database up. This establishes reachability, not image
  revision or migration 0018.
- `/api/config/signup` returned HTTP 200 with `open: false`. Signup controls were not changed.
- `/first-review` returned HTTP 404, with “Page not found” reproduced in the browser.
- The served frontend entry was `/assets/index-Dc996Y9g.js`, SHA-256
  `ef3113c98a07e8836ff0e7fbc5f05cd2795b7a5cee4a405844c0f94b28b9a9fb`.
  It lacked the first-review route and the WordInspectionNotice/ContractReviewSetup dependencies
  present in the current built frontend. The exact staging build log lists `index-Blll0Hij.js` and
  first-review/WordInspectionNotice/ContractReviewSetup chunks. Its served API client also lacked first-review/reviewInstructions
  markers. A bundle hash mismatch alone would not prove a source revision; the missing route and
  feature dependencies establish that this host does not expose the integrated feature frontend.

The exact served Git revision and migration state remain unknown. The prior private GHCR pull
denials are historical evidence, not a freshly confirmed cause of this deployment gap. A successful
GitHub workflow does not prove the service pulled or started the image.

The previous Dokploy connectors are unavailable in this session. Plugin discovery found no Dokploy
plugin. Initially the staging Dokploy browser was signed out, and sign-in was requested. An existing
authenticated session subsequently became available. In its Gitmatter organization, the inspected
completed web and docs deployments for `5fb6641` both failed GHCR authentication, with no observed
timeout/TLS or missing-manifest category. Each application's Docker form targeted the correct
`ghcr.io` staging image and had nonempty username/password fields; their values were not recorded.
Both settings tabs were prepared for human credential repair. The computer-use policy requires the
human to enter and submit replacement credentials directly. No production environment, registry
credentials, AWS session or staging auth setting was changed by the agent.
Read-only discovery also found no existing authenticated staging CLI/SSH path; the local Tailscale
connection was stopped. No new operational login was initiated.

Private controller receipt: `.scratch/review-signoff-2026-10-18/dokploy-authorization-receipt.json`.
These log classifications describe the inspected `5fb6641` attempts; they do not establish the
registry-pull result of the subsequent `179c0ce6` attempt.

## Automated web runtime gate

The staging workflow previously treated an accepted webhook as deployment success. The web job now
runs `scripts/verify-web-deployment.ts` after the trigger. The readiness endpoint includes the
observed build-supplied `SENTRY_RELEASE` label, or null when unset, and sends `Cache-Control: no-store`.
Database failure still returns HTTP 503 without exposing its error.

The shared verifier requires HTTP 200, `ok: true`, database up and the exact expected full Git SHA.
It has a five-minute default overall deadline, ten-second request/body deadlines, finite retries and
a 16 KiB response cap before JSON parsing. It omits credentials, rejects redirects and logs only
safe status categories and recognized SHA values. Unknown/stale release, unhealthy readiness,
malformed/oversized bodies and connection failures cannot make the web job green.

Nineteen focused tests pass, including stale-but-healthy responses, eventual recovery, missing
release, HTTP errors and requests stalled at headers or body. An actual 15-second bounded probe of
current staging refused verification with `release_unknown`; a separate public request confirmed
HTTP 200/database up without a release field. The private receipt is
`.scratch/review-signoff-2026-10-18/staging-negative-guard-receipt-15s.json`.

This is a web-process metadata comparison, not image-digest attestation, migration verification,
docs deployment verification or authenticated feature acceptance. Production's existing release
label convention is retained. No schema/migration change is needed.

Validation passed: `vp check` (no warnings), `vp run typecheck` (all six packages), production web
build and all 61 files / 339 tests against local Postgres and MinIO. The first full suite using the
original configured storage had one five-second timeout in the existing version-deletion test
(338 passed). Its seven-test upload suite then passed against local MinIO, followed by the complete
339-test pass, without changing storage implementation or test timeouts. The thin CLI also passed
an explicit TypeScript check because the normal root checks exclude `scripts/`.

## Post-merge staging result

[PR #15](https://github.com/Git-Matter/gitmatter/pull/15) passed CI and merged as
`179c0ce62b4513693be095804daf6bc8b2c3a15e`. Its
[staging run 39086690701](https://github.com/Git-Matter/gitmatter/actions/runs/39086690701) passed CI,
web image publication and webhook delivery. The independently triggered docs pipeline also returned
success; its runtime is not attested by that result.

The new web runtime gate ran from 01:36:09 to 01:41:09 UTC (12:36:09–12:41:09 Australia/Sydney).
All 30 attempts received HTTP 403, and the job failed after its five-minute deadline. This
establishes a CI-to-readiness access denial, not a current GHCR pull diagnosis or a verified release.

The published web digest for `179c0ce6` is
`sha256:9053d2a31f46e10ee5f7c858567e4a8f3a13ff97cc3d708f3ba17aea714ba569`.
Separate post-run public requests returned HTTP 200/database up but no release field or no-store
header. `/first-review` remained HTTP 404 and the served entry remained `index-Dc996Y9g.js`. The new
runtime contract and feature frontend therefore remain unavailable on the observed host. Exact
running revision, migration state and the current image-pull cause remain unverified.

Private follow-up receipt: `.scratch/review-signoff-2026-10-18/staging-runtime-guard-followup.json`.
The guard now fails closed instead of treating a successful trigger as runtime proof. Credential
repair, current controller-log inspection and resolution of the CI readiness 403 remain required.

## Remaining staging gate

1. Repair and save authorized GHCR credentials in both staging applications, then inspect the latest
   deployment and restore the intended candidate through its normal deployment path.
2. Resolve the CI readiness access denial, then confirm runtime revision `179c0ce6` or a verified successor and migration 0018 before treating
   readiness as feature availability.
3. Use an isolated authenticated staging session to reproduce guided preparation, immutable review
   instructions, quote navigation and incoming/clean Word controls, preserving audit provenance.
4. Retain the observed receipts/screenshots and reconcile the plan banners before staging sign-off.

No numbered plan, staging release or professional/pilot gate is closed by the local visual pass.
