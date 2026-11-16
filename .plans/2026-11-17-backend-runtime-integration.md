# Backend and runtime integration - 17 November 2026

The scoped backend fixes were committed on consolidation `dev` as `3ea9f67` after
fresh local validation. The Vite+ runtime integration is based on remote
`8227df487e59fc7bc10806edf5253fcc1fc98261`; its original isolated evidence remains
in `2026-11-16-runtime-handoff.md`.

## Integrated behavior and readability review

- Queue acceptance rechecks and holds current editor/token authority before source,
  job or audit publication. Subscription retries admit only document extraction,
  including before idempotent replay. Embedding errors retain constant failure text
  and safe status metadata instead of provider response bodies or raw errors.
- Vite Task orchestrates the workspace; the CLI shares the root pnpm lockfile and
  packages four Node 26.13.0 targets. Existing feature dependencies, Redis service,
  Australian prerender route and current provider-retention guidance are retained.
- The lock was regenerated from the current dev lock against the merged manifests,
  rather than resolving its sixteen conflict groups manually. Frozen installation
  passes. Existing `apps/docs/css.d.ts` is retained; the incoming duplicate CSS
  declaration was removed. Legacy `.turbo/` cache files remain ignored and preserved.
- Generated MCP reference copy now states that subscription retries are restricted
  to extraction. No database schema or migration changed; migration head remains
  `0023_busy_bulldozer`.
- `simplify-code` was applied to both owned diffs. The direct retry capability and
  embedding-owned error boundary remain cohesive. Runtime task definitions were
  checked against installed Vite+ documentation. No broader refactor was warranted.

## Fresh local checks

- Before runtime integration: embedding suites **15/15**, authorization/retry/MCP
  focused suites **25/25**, default suite **510/510 in 87 files**, without skips.
- Combined runtime source: default `vp test` **517/517 in 89 files**, without skips;
  explicit `vp run test cli/test/runtime.test.ts scripts/runtime.test.ts` **7/7**.
- Final `vp check`: 989 formatted files and 714 lint/type-checked files, no warnings or errors.
  `vp run typecheck`: all eight workspace checks passed.
- `vp run design:check`: 346 authored source files, 22 contrast pairs, zero failures.
  Generated MCP reference and synthetic NDA fixture checks passed.
- `vp install`, then `vp install --frozen-lockfile`, passed. `vp env doctor` passed
  and resolves Node 26.13.0; existing mise PATH precedence warnings remain.
- `vp run build` passed for web, docs, video and the host CLI. A separate cloud web
  build passed and prerendered all **40** allowlisted public pages, including
  `/australian-practices`. Existing non-fatal dependency/CSS/bundling warnings remain.
- `vp run gitmatter-cli#build:all` built darwin-arm64, darwin-x64, linux-x64 and win-x64.
  `file` confirms the expected architectures; both macOS signatures verify. Native
  arm64 `--help` exits zero. Other target execution still requires native CI.
- The changed Docker web recipe built successfully as local Linux arm64 image
  `gitmatter-consolidation-runtime:20261117`, digest
  `sha256:6c40465c51743faa6ddecabfd88fc68a89959356ea3022166860cc2a579320c7`.
  Short-lived image tool checks confirmed Node 26.13.0, Vite+ CLI 0.3.2,
  project Vite+ 0.1.24 and pnpm 12.16.1. No application server was started.
- `git diff --check` passed. Normal commit hooks remain enabled.

The tests used only isolated loopback Postgres and HTTP MinIO with public synthetic
fixture credentials. The missing MinIO binary was restored from its official
GitHub release, with SHA-256 verified against the official release digest; bucket
creation and actual HTTP PUT/GET/delete preflight passed. No real environment file,
provider key or paid provider was used.

## Acceptance boundaries

UI changes and browser evidence remain under the coordinator's ownership and are
excluded from these commits. No app or fixture development server was started or
stopped. Cloud prerender used the framework's temporary port-zero preview server.
This is local source, database/S3, build and CLI evidence. It does not establish
authenticated external MCP, real-provider usage/settlement, native Word save/reopen,
non-arm64 native execution, staging, production or final rendered UI acceptance.
