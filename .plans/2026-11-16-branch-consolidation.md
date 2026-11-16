# Branch consolidation audit — 16 November 2026

Status: inventory complete; integration, workflow acceptance and publication pending. This report
records the state inspected before branch mutations. Later commits and release evidence must be
recorded separately; these observations are not deployment or product acceptance.

The user confirmed that `feat/native-agent-workflow` is the subscription integration branch to
preserve. Do not move, merge into, rename or delete that branch. Its existing commits are already
ancestors of `dev`; preserving the branch does not require removing shipped subscription features.
The intended final local and remote branch set is `main`, `dev`, and
`feat/native-agent-workflow`.

## Evidence inspected

- Local heads, fetched origin refs, live `git ls-remote --heads origin`, graph and ancestry counts.
- All seven registered worktrees, including detached worktrees, using
  `git status --porcelain=v1 -uall`; all dirty filenames were inspected. Shared dirty file contents
  were compared by digest to identify duplicate and differing work without copying their contents.
- Unique commit file scopes, migration journals, and Australian delivery evidence.
- GitHub PR inventory: #16 remains open; #10–15 are merged.

No environment file contents or credentials were read. The legal-DB worktree's `.env.example`
type change was observed by status only and was excluded from content comparison.

## Branch disposition

Counts below are commits unique to the branch relative to `dev` at `179c0ce`.

| Branch                                              | Local head | Unique commits | Decision                                                                               |
| --------------------------------------------------- | ---------- | -------------: | -------------------------------------------------------------------------------------- |
| `dev`                                               | `179c0ce`  |              0 | Integration target; remote matches.                                                    |
| `main`                                              | `1b5b690`  |              0 | Local head is stale. Preserve remote `main` at `ac8a5fa` when promoting.               |
| `feat/native-agent-workflow`                        | `26b729d`  |              0 | Preserve unchanged, as confirmed by the user. Remote matches.                          |
| `docs/staging-verification-handoff`                 | `8f1090c`  |              1 | Integrate its documentation and reviewed checkout WIP; PR #16 targets `dev`.           |
| `feat/document-chunk-context`                       | `2ab5b89`  |              4 | Integrate retrieval, embedding and provider-cache work, resolving schema/tool overlap. |
| `feat/australian-sole-practices`                    | `f10987e`  |              1 | Integrate guided starts, practice settings and version-bound practitioner review.      |
| `worktree-legal-db-integrations`                    | `f18de9a`  |              1 | Integrate research providers and preserve its runtime migration WIP.                   |
| `docs/real-usage-roadmap`                           | `6a88005`  |              0 | Already merged; remove branch after final ancestry verification.                       |
| `feat/real-usage-m0-product-truth`                  | `6a88005`  |              0 | Already merged; remove local and remote branch after verification.                     |
| `feat/review-instructions-first-review-word-intake` | `2dc5047`  |              0 | Already merged through PR #13; remove after verification.                              |
| `test/final-review-visual-signoff`                  | `caf4aca`  |              0 | Already merged through PR #15; remove after verification.                              |
| `test/review-workflow-release-proof`                | `41bc185`  |              0 | Already merged through PR #14; remove after verification.                              |
| `worktree-marketing`                                | `0ed437e`  |              0 | Already merged; remove after verification.                                             |

The document-context remote head is `ca8e84c`; the local head includes subsequent merge history
that is absent from the remote. Integrate the local branch, preserving all three feature commits:
`cd6998e`, `e742e5f`, and `ca8e84c`.

Remote `main` and `dev` have one and fifteen unique commits respectively. The unique `main`
commit is the prior release merge `ac8a5fa`, not a reason to reset or overwrite remote history.
The Australian branch is based directly on old local `main` (`1b5b690`) and needs semantic
integration with the newer audit/job/review behavior.

## Worktree disposition

Paths below use these roots:

- Project: `/Users/applecakes/projects/gitmatter`
- App worktrees: `/Users/applecakes/.codex-workspaces/worktrees`
- Codex worktrees: `/Users/applecakes/.codex/worktrees`

| Worktree                                                 | Head                              | Dirty paths at inventory | Decision                                                                                          |
| -------------------------------------------------------- | --------------------------------- | -----------------------: | ------------------------------------------------------------------------------------------------- |
| Project checkout                                         | `8f1090c`, staging handoff branch |                      374 | Preserve and review all current work before branch integration.                                   |
| App `ios-6e0c29e0-f1b0-4fd9-be21-a6f20ff6400a/gitmatter` | Australian branch                 |                        0 | Integrate committed feature; no additional WIP.                                                   |
| App `ios-790690b2-e41d-480a-a3c5-53b290ebbaa6/gitmatter` | Detached `1b5b690`                |                        0 | No unique tracked work found; retain until integration review ends.                               |
| App `ios-83d7ec35-2640-4b3d-a7fb-1c829ee65f97/gitmatter` | Detached `1b5b690`                |                       52 | Preserve unique Vite task/runtime migration work; reconcile with project migration.               |
| App `ios-a2fd4494-fb7a-4a70-a7c1-5c511ed67828/gitmatter` | Detached `1b5b690`                |                        0 | No unique tracked work found; retain until integration review ends.                               |
| Codex `663c/gitmatter`                                   | Detached `179c0ce`                |                        0 | No unique tracked work found.                                                                     |
| Project `.claude/worktrees/legal-db-integrations`        | Legal-DB branch                   |                       40 | Preserve committed feature and dirty runtime work. Inspect lock/process ownership before cleanup. |

The legal-DB worktree has a recorded lock referring to an old Claude session. A lock is not proof
that the recorded process is still active. Do not unlock or delete it based on the timestamp alone.

### Project checkout: preserve and integrate

The 374 paths comprise 197 modified, 16 deleted, and 161 untracked files. Directory-collapsed
status reports fewer entries, so use `-uall` when comparing this count.

- Product design: `DESIGN.md`, `design/`, app frame/sidebar/tables/dialogs, shadcn primitives,
  feedback and unsaved-input hooks, assistant, clients, matters, documents, reviews, workflows,
  account/settings/auth screens, marketing pages and product media.
- Template library: shared contracts, DB schema, audited core/storage/tools, HTTP routes, library
  UI, user/API documentation, integration tests and acceptance fixtures.
- Runtime/tooling: pnpm locks/workspaces, Node CLI packaging/process helpers, CI/release/staging
  workflows, Dockerfile, development/backup/restore scripts and package manifests.
- Evidence: design research and acceptance manifests/fixtures are new; nine historical
  `.plans/evidence/` documents are deleted and their plan references changed. Review these
  deletions explicitly rather than treating them as generated cleanup.
- Database: untracked `0019_safe_firebrand` and `0020_dashing_iron_man` migrations/snapshots and
  journal changes belong to current template work. Preserve them while reconciling later branches.

No current checkout feature is discarded by this audit. Review and validate this work before
committing it as the shared integration baseline.

### Detached runtime work: preserve source, choose one implementation

The dirty detached worktree has 39 modified, five deleted, and eight untracked files. It replaces
Turbo tasks with Vite+ tasks, incorporates the CLI into workspace checks, changes CLI executable
packaging, and pins a newer Node runtime. It differs materially from the project checkout's
smaller pnpm/Node migration. Do not overlay the entire detached tree onto the newer app source.

Unique paths are `.node-version`, `apps/docs/vite.config.ts`, `apps/video/vite.config.ts`,
`cli/vite.config.ts`, `cli/test/runtime.test.ts`, and `scripts/runtime.test.ts`.
`pnpm-lock.yaml` and `pnpm-workspace.yaml` also differ from the project checkout.

Other affected files are `.dockerignore`, the issue template and three GitHub workflows,
`.gitignore`, `AGENTS.md`, `README.md`, docs/video README and package manifests, web package/config,
CLI README/manifest/config/doctor/main/templates/tsconfig, Compose, admin backup/self-hosting docs,
both Dockerfiles, the root manifest/config, contracts/core/registry manifests, core config and
scripts, and backup/restore/dev/wipe scripts. Deletions remove both Bun locks, `turbo.json`, and
the video's previous ESLint/Prettier configs.

Decision: preserve this patch before any checkout cleanup, integrate useful runtime tests and
consistent Node/pnpm behavior, and resolve the overlapping task/CLI packaging approaches into
one supported workflow. Adoption of every alternative implementation is deferred to integration
review; retaining duplicate runtimes or package managers is not the final state.

### Legal-DB runtime WIP: mostly duplicate, some differences

The 40 dirty paths comprise 28 modified, two deleted, nine untracked, and one type change.
Many CLI files, package-manager helpers, backup scripts and Dockerfile match the project checkout
byte-for-byte. Preserve those in the shared baseline once; do not duplicate their implementation.

Differences remain in CI/release/staging workflows, `AGENTS.md`, web/root manifests, Compose,
self-hosting docs, the dev script, root Vite config, and both root pnpm files. `.nvmrc` is unique.
The `.env.example` type change needs separate safe review and must not be blindly committed or
copied. The recorded dirty path inventory contains no additional legal-provider feature files;
that feature is in commit `f18de9a`.

## Database reconciliation

`dev` has an authoritative migration chain through `0018_warm_mauler`; current project WIP adds
template migrations `0019` and `0020`. The feature branches diverge before that chain:

| Source               | Divergent migrations                                                                                    | Contents                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| Document context     | `0007_steady_domino`, `0008_puzzling_kronos`, `0009_embedding_hnsw_indexes`, `0010_embedding_hnsw_1024` | Document chunks, embeddings, usage fields and HNSW indexes.                   |
| Australian practices | `0009_round_abomination`, `0010_lazy_harry_osborn`                                                      | Practice profiles, practitioner review records and conversation jurisdiction. |

Keep the established migration SQL, snapshots and journal. Integrate schema definitions and
generate forward migrations from the resulting schema. Review custom pgvector/HNSW SQL
separately, because automatic generation alone may not preserve the intended index/operator
behavior. Check both a fresh database and upgrade from the current baseline. Never apply these
unreconciled branch journals to an existing deployment.

## Integration sequence and release scope

1. Preserve the dirty project, detached and legal-DB work before mutations; commit and push
   reviewed work as integration proceeds, as the user requested. Exclude secrets and runtime
   artifacts. Keep the protected subscription branch at `26b729d`.
2. Establish the reviewed current checkout changes as the integration baseline, including the
   one staging-handoff documentation commit. Bring it into `dev` without discarding remote history.
3. Merge `worktree-legal-db-integrations`; retain the newer catalog/subscription execution rules
   while adding its providers and reconciling registry/usage changes.
4. Merge the local `feat/document-chunk-context`; reconcile document tools, durable jobs, model
   adapters, usage reporting, optional embedding infrastructure and schema changes.
5. Merge `feat/australian-sole-practices`; retain the current UI design and audit controls while
   adding guided tasks, practice configuration and version-bound human review. Regenerate routes.
6. Resolve the runtime migration alternatives and generate the final forward database changes.
   Regenerate MCP docs/tokens when their sources change.
7. Run `vp install`, `vp check`, `vp run typecheck`, `vp test`, `vp run test`,
   `vp run design:check`, schema generation when changed, and the package-specific builds/checks
   required by the integrated task configuration. Verify real workflows and relevant failure states.
8. Push `dev`, verify CI/staging and the exact served revision, then promote `dev` into remote
   `main` through the supported release path. Verify the published app and demo flow separately.
9. Recheck ancestry and dirty worktree preservation. Remove merged local/remote branches and
   close superseded PRs so only `main`, `dev`, and `feat/native-agent-workflow` remain.

Keep the VC demo focused on Client → Matter → document intake → cited review → proposed redline
→ human decision → version history/export, plus a reusable playbook/template and the connected
agent handoff. Guided starts can support that path. Integrate the other branch features without
making unverified research-provider breadth or embedding infrastructure part of the demo promise.

Historical Australian acceptance is explicitly local and provider-independent. Current real
provider, staging, production, Microsoft Word fidelity and practitioner acceptance remain unproven
until rerun against the integrated revision. Branch consolidation alone cannot establish them.
