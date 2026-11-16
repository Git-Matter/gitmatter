# Runtime integration handoff

The adapted implementation is committed and pushed for root integration. Validation below belongs to
this isolated tree. App, database and deployment acceptance still require the coordinated integration
run.

- Implementation commit: `bc09f6c65d4b4ee92b1cfe5a65432c90879aebe0`.
- Remote branch: `integration/vite-runtime-2026-11-16`.
- Baseline: `21af2e1429e970e2c8a343ca890c31d1dc62bace`.
- Worktree: `/Users/applecakes/.codex/worktrees/gitmatter-runtime-integration-20261116`.
- Archived detached migration: `067b962e8dd8c048f3a08d372210a9ad50750938`, pushed as
  `archive/vite-monorepo-detached-2026-11-16`.
- Validation date: 2026-11-17, Australia/Sydney. The filename retains the requested handoff date.

## Implementation and preserved behavior

- Vite Task replaces Turborepo for build and typecheck orchestration. The CLI joins the shared pnpm
  workspace and lockfile; its nested lock, workspace marker and duplicate esbuild/SEA builder are
  removed.
- Node is pinned to `26.13.0`, pnpm to `12.16.1`, project Vite+ to `0.1.24`, global/CI Vite+ to
  `0.3.2`, and the matching executable extension to `@tsdown/exe@0.22.1`.
- `vp test` remains the built-in runner. `vp run test` and `vp run test:ci` run the root Vite+ suite
  with `run`, including root product/design tests and runtime tests.
- Web, Next.js docs and Remotion build definitions live in their Vite+ task configuration. Generated
  output is excluded from tracked inputs; build environment variables and output archives are declared.
- CLI packaging uses `vp pack` with named host, combined and per-target configurations. Release CI keeps
  the existing native OS matrix and now smokes each native executable with `--help`.
- The latest Node CLI and shared process helper are retained. The development launcher still starts
  only the web app and now stops when dependency startup or migration fails. The strict port `4280`
  behavior, font allowlist, console forwarding setting and template prerender entry are preserved.
- Current design, template, trust and generated-reference functionality is retained. No UI component,
  route handler, database schema or template fixture was edited. Root should retain its newer trust/docs
  copy when resolving any overlap with commits after the baseline.
- CI retains MinIO, design policy, generated MCP reference, synthetic NDA and deployment-readiness gates.
  Docker source uses the pinned Node/Vite+ toolchain and the shared install.
- With Next.js `16.4.3` and TypeScript `6.0.3`, `apps/docs/styles.d.ts` declares CSS imports using
  TypeScript's documented ambient-module approach.
  No checker option is disabled; no additional Next type-generation lifecycle step is added.
  See [TypeScript side-effect import guidance](https://www.typescriptlang.org/tsconfig/noUncheckedSideEffectImports.html).

## Checks passed on the implementation commit

- `vp install --frozen-lockfile`.
- `vp check`: 887 formatted files; 645 files linted/type-checked without warnings or errors.
- `vp run typecheck`: all eight workspace package typechecks passed.
- `vp run design:check`: 328 authored source files, 22 contrast pairs, zero failures.
- `DATABASE_URL=postgres://postgres@127.0.0.1:55434/gitmatter vp run docs:tools:check`: metadata generation
  check only, using the synthetic URL supplied by root.
- `vp run fixtures:nda:check`.
- `vp test run cli/test/runtime.test.ts scripts/runtime.test.ts test/configured-model.test.ts test/design-policy.test.ts test/first-review-progress.test.ts test/progress-refresh.test.ts`:
  24 tests passed across six files.
- `vp run test cli/test/runtime.test.ts scripts/runtime.test.ts`: seven tests passed across two files.
- `vp run gitmatter-cli#build:all`: darwin-arm64, darwin-x64, linux-x64 and win-x64 executables built.
  `file` confirmed the expected Mach-O, ELF and PE architectures; both macOS signatures verified with
  `codesign --verify`; the native arm64 executable's `--help` exited zero.
- `vp env doctor`: checks passed; existing mise PATH precedence warnings remain informational.
- `git diff --check`.

The `simplify-code` skill was loaded and applied before committing. The launcher step helper now takes
an explicit numeric exit-code action, avoids shadowing the shared process function, and uses an early
return for dry runs. Existing process reuse and feature ownership remain intact. Focused runtime tests,
format/lint checks and all package typechecks passed after this review.

## Remaining coordinated verification

- **UNRUN on this adapted tree:** full database/S3 suites, app or fixture server journeys, web/cloud
  prerender builds, full aggregate build, Docker image startup and staging/production deployment.
- Root's reported 504-test integrated result belongs to its earlier integrated tree. Historical
  November 5 runtime/container evidence belongs to the archived tree. Neither is acceptance of this
  adapted commit.
- Native Windows/Linux/x64 runtime execution and the new release smoke steps await native CI. Local
  cross-platform packaging and binary inspection passed; only native arm64 execution was tested here.
- No app/fixture server was started, no root environment or real key was read, and no database test or
  mutation was run. No shell approval rejection or pending command permission blocked this work.
  pnpm's optional agent-skill approval notice did not prevent installation or scoped validation.
- Only the archival tag and dedicated integration branch were pushed. The consolidation checkout,
  root source checkout, `dev`/`main` refs and other branches were left under their existing owners.

## Independent specialist review

The global `typescript_engineer` specialist reviewed the actual `21af2e1..b3a20ff` result read-only
under the updated specialist requirement. It reported no must-fix findings after checking workspace
selection, cache/environment declarations against pinned Vite+ documentation, executable names against
installed tsdown sources, launcher failure handling, the CSS declaration, and retained design/template
boundaries. Its `git diff --check` passed. The remaining acceptance gaps above are unchanged; historical
migration evidence was excluded from current acceptance. No further implementation edits were warranted.
