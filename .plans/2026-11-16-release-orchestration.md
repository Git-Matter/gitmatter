# Branch consolidation and VC demo release

Status: active. This is an execution ledger, not release acceptance.

## Required end state

- Only `main`, `dev`, and `feat/native-agent-workflow` remain as local/remote branches.
- Preserve `feat/native-agent-workflow` unchanged at `26b729d`, confirmed by the user.
- Review every branch and preserve worktree changes before cleanup.
- Integrate non-protected feature work into `dev`, then promote the verified result to `main`.
- Commit and push reviewed increments throughout the work.
- Use researched design guidance and Impeccable; account for at least 20 AI design anti-patterns.
- Keep the product modestly polished, readable, and simple. Verify the complete feature workflows.
- Publish and verify the actual deployed revision and VC demo journey.

## Current evidence

- Branch/worktree inventory: [branch audit](2026-11-16-branch-consolidation.md).
- Demo scope and workflow proof requirements: [acceptance matrix](2026-11-16-workflow-acceptance-matrix.md).
- Twenty-nine researched design patterns: [design audit](research/2026-11-16-design-demo-audit.md).
- Original working changes preserved and pushed as `21af2e1`; initial GitHub CI passed.
- Reviewed marketing/settings corrections preserved and pushed as `901da97`.
- Initial `vp install`, `vp check`, workspace typecheck, and design policy passed.
- Isolated baseline `vp test --maxWorkers=1 --testTimeout=15000`: 371 tests in 67 files passed.
  The first parallel run with the live app workers failed seven document tests; that run is
  recorded as failed and does not count as acceptance.
- Public staging/production readiness return 200, but do not expose the expected release field.
  Staging Dokploy still reports failed deployments. This is older-runtime evidence only.

## Ownership

The orchestrator owns commits, pushes, final branch deletion, the release path and acceptance.
The `dev` integration checkout is `/Users/applecakes/.codex/worktrees/gitmatter-consolidation`.

| Owner                                        | Scope                                                                                                |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| Branch integration agent                     | Legal providers, document retrieval, Australian features, forward migrations and isolated DB proof   |
| Design agent                                 | Australian frontend conflict resolution and shared draft-protection integration                      |
| Workflow agent                               | Review/document detail freshness, denied-state privacy, browser recovery and existing review replays |
| Verify Vite+ usage session                   | Adapt existing Node/pnpm/Vite+ monorepo migration in a separate checkout; preserve original WIP      |
| Remove AI slop designs session               | Independent feedback regression review, report only                                                  |
| Build Transparent AI Trust session           | Independent claim audit and bounded public-copy corrections                                          |
| Review and tailor for Australian law session | Independent PRD and integration review, report only                                                  |
| Review legaltech Reddit post session         | Independent template release review, report only                                                     |
| Research OpenAI OAuth for GitMatter session  | Separate handoff only; no integration implementation or branch mutation                              |

The Office Plugins guidance message was rejected by the tool; no follow-up implementation was
started. Its existing research remains outside the demo implementation scope.

## Open gates

- Finish feature integration without losing the captured review source, audit spine or current UI.
- Reconcile the alternative runtime migration and validate all required commands on the result.
- Verify fresh and upgrade migrations; storage-backed and real application workflow coverage.
- Replay current browser flows at the integrated revision. Historical source hashes are insufficient.
- Verify live provider/Word/authentication behavior where required by the workflow matrix.
- Push `dev`, verify CI and exact staging runtime, promote to `main`, and verify production.
- Re-audit refs and worktree preservation before deleting superseded branches.

Use one UI server at `127.0.0.1:4280`. Fixtures replace the app temporarily, then stop before the
app is restored. Synthetic/intercepted UI evidence is kept separate from real authorization,
provider, Word and deployed-runtime evidence.
