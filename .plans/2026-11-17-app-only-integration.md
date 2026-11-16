# App-only integration - 17 November 2026

## Current source and ownership

The consolidation worktree remains on local `dev`, now at
`af8494d6f2a63a0e58817f28a48b43b17c199240`. Two normal-hook merge commits integrate
the reviewed original-checkout UI and the user's subsequent marketing removal:

- `d0610d2`: merges `eaa37893936ce84d8db5879259eb5c5f7010221a`, preserving workspace
  recovery, template access and current qualified data-handling guidance.
- `af8494d`: merges `cf68f707e7c5ca8220284434c1587fd99ea14762`, removes public
  marketing/blog/comparison/solutions/resources/video/OG surfaces and promotion
  material, and retains the app, neutral legal pages, branding and usage docs.

No push occurred in this phase. Remote `dev` remains at `deabb6d`; final combined
readability review, rendered acceptance, commit and push belong to the coordinator.
The index is empty. Pending assistant/AU UI and acceptance changes were selectively
stashed, restored and left unstaged. The backup stash remains
`fde4d25541141b178e0048de673df46e24169826`.

## Integration decisions

- The app-first root redirects to the protected assistant. Only Privacy, Terms,
  login and signup are prerendered in cloud builds. Existing session/onboarding
  handling remains authoritative.
- Reviewed Privacy policy substance was retained in the neutral legal page. The
  deleted marketing-site import, promotional framing and Security-page link were
  removed. Current saved-key fallback, provider-control and retention qualifications
  remain in the retained admin documentation, alongside embedding configuration and
  Vite+ setup commands.
- Vite+ workspace/CLI tooling and the launcher's failed-step exit handling remain.
  The video workspace, its runtime-added Vite config and task-generated output are
  removed. The combined shared lock was regenerated and frozen-checked.
- Backend authorization, retry and embedding-privacy guards remain unchanged from
  the prior integrated revision. Database schema and migrations remain unchanged
  through `0023_busy_bulldozer`.
- Restored replay coverage retains feedback recovery, template-access source tracking
  and AU workflows. The removed marketing-media group, sources and scope are absent.
- Historical engineering research, review and acceptance reports are preserved as
  dated evidence. Earlier VC-demo/marketing assumptions and the prior 40-page cloud
  build describe older source; they do not establish the current app-only experience.

## Bounded working UI correction

`PractitionerReviewPanel.tsx` now shows the source-version ID and document-head
revision from each retained earlier scope's actual stored key. Literal `null`
metadata reads “No version ID” or “No commit ID”; no ordinal or version counter is
invented. Metadata stays in the optional disclosure beside its scope. Draft state,
mutation behavior, access handling, persistent form labels and status meaning are
unchanged. This patch remains unstaged for final rendered UAT and coordinator delivery.

The assigned source/readability review found no further justified structural change.
An independent read-only source check found no remaining active marketing/video/OG
build references or lost runtime/backend protections. The coordinator still owns the
one final combined `simplify-code` pass.

## Checks on the combined working source

- `vp install`, then `vp install --frozen-lockfile`: passed for the eight projects
  including the root; seven workspace typechecks remain after video removal.
- `vp check`: **893** formatted files and **630** lint/type-checked files, no warnings
  or errors. This count predates this prose receipt.
- `vp run typecheck`: all **seven** workspace checks passed.
- AU and app-UI fixture TypeScript checks passed; replay, assistant and AU scripts
  passed `node --check`.
- Default `vp test`: **521 tests in 90 files passed**, with no skips, against the
  existing isolated loopback Postgres and HTTP MinIO using public synthetic fixture
  credentials. Services were healthy before this run; no real environment or key was read.
- Design policy: **281** authored sources, **22** contrast pairs, **0** failures.
  Generated MCP reference and synthetic NDA fixture checks passed.
- `vp run build`: web, docs and host CLI passed. The separate cloud web build passed
  and prerendered exactly **four** pages: `/privacy`, `/terms`, `/login`, `/signup`.
  Existing non-fatal bundling/CSS warnings remain.
- Whitespace checks passed. Schema and migration files are unchanged.

No development app or fixture server was started or stopped. Cloud build used the
framework's temporary port-zero prerender server. Final rendered AU/assistant and
other affected journeys, including long IDs, null identities, mobile/reduced motion,
remain for the coordinator's final UAT window. Current app-only Docker startup,
authenticated external MCP, real-provider execution/settlement, native Word and
deployed acceptance are not established by these local checks.

## Primary-agent combined readability review

After integrating the branch work, the primary agent applied `simplify-code` to the
combined runtime, engine and UI changes, including the restored working patches and
delegated findings. The review traced transaction authority and retry dispatch,
captured source identity, provider-error handling, frozen template authority, queued
metadata writes, per-file upload outcomes, and ownership of local drafts and feedback.

The dedicated extraction retry names an actual capability boundary. Shared snapshot
and feedback helpers have real consumers; template access and practitioner drafts
remain with their features. The ordered guards and small shared operations are clearer
than their previous duplicated or nested forms. No further structural change was
justified; additional splitting would add indirection without improving these paths.

Existing focused checks and the combined 521-test run support the unchanged behavior.
Final rendered checks are recorded separately and do not imply provider, authentication,
native Word or deployed acceptance.

## Final combined browser checkpoint

The independent UI/UX reviewer passed all seven groups and 28 browser functions on
this combined source, including the pending assistant wording and retained-scope
identity correction. Current receipts cover feedback/recovery, first review,
review/output, Australian workflows, assistant, settings/access and templates.
The primary agent independently compared every recorded source hash with current
files and found no drift. The final Australian capture manifest is bound to that
successful replay, retaining the superseded digest for its changed mobile capture.

Full and null source identifiers, desktop/390px layout, dark/reduced-motion states,
focus and draft recovery, permission narrowing, deliberate upload retries and exact
approved DOCX bytes were exercised within the stated fixture/integration boundaries.
The renderer tests did not call real providers or establish production authentication.
See [the final UAT report](2026-11-17-ui-ux-uat-review.md).

The final Impeccable mechanical scan returned zero findings over 173 changed frontend
files; [its receipt](../design/evidence/impeccable.json) identifies the source content
and static-only limitation. Final schema generation reports no changes; format/lint,
workspace types and design policy pass after the test-adapter updates. Main-app
startup, exact staging/production revision and the final branch inventory remain
separate coordinator checks.
