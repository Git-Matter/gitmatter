# Template library design review

Status: local implementation and review accepted; evidence recording verified.

This review follows the template feature from legal ownership through review to
the commercial team's published download. It covers the six findings from the
product review and the evidence needed before a release claim.

## Review process

1. Record the failures against a concrete owner, editor, reviewer, and sales journey.
2. Agree on permission and file-version contracts before changing the interface.
3. Implement the engine and interface independently, with separate file ownership.
4. Review the finished interface at desktop and mobile sizes, including keyboard,
   dismissal, stale content, empty states, and errors.
5. Run database and HTTP tests against fictional records, then exercise the actual
   client with real local engine and storage operations.
6. Capture the accepted flow as a labelled evidence video and retain its receipts.

## Acceptance decisions

| Finding                                                  | Required behavior                                                                                                                                                                              | Evidence required                                                                       |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| Displayed version differs from approval target           | Review binds the displayed draft revision and head. Published view cannot approve. A changed revision requires explicit review again.                                                          | Browser request and state checks; concurrent/stale approval tests.                      |
| Formatted templates cannot move intact                   | An uploaded DOCX remains an immutable source. Published downloads return that exact revision's bytes. Text preview derives from those bytes.                                                   | Styled fixture with tables, numbering, and headers; source/download hash equality.      |
| Legal collaboration requires organization administration | An owner delegates editor and reviewer access within the workspace. A designated human reviewer can decide without workspace admin privileges.                                                 | Separate owner, editor, reviewer, and reader accounts; cross-workspace rejection tests. |
| Unsaved text disappears on dismissal                     | Escape, close, cancel, outside dismissal, and navigation retain work or require explicit discard. Legal content is not persisted in browser storage.                                           | Browser dismissal and reopen checks, including keyboard navigation.                     |
| Approval has no return path                              | Submission names a reviewer; their pending work is findable. Request changes records a reason and returns the working revision for revision without withdrawing the current published version. | Reviewer inbox, request-changes, resubmit, and publish journey.                         |
| Downloaded copies lose identity                          | Download names include the template and revision. Current publication identity is visible alongside the source file.                                                                           | Browser download filename plus exact byte and revision receipts.                        |

The independent review added three checks during implementation:

| Finding                                       | Required behavior                                                                                                                                                                                                                          | Evidence required                                              |
| --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| Shared dialog widths squeeze the Word page    | Template dialogs override shared breakpoint width caps. The original Word page keeps its layout inside a scrollable preview instead of reflowing into a narrow column.                                                                     | Fresh desktop and mobile screenshots with the styled fixture.  |
| A conflict response leaves no recovery action | A rejected decision refreshes the latest server metadata while retaining the open review snapshot. The reviewer explicitly reloads and reviews the new revision. Editor conflicts retain input and a route to inspect the latest revision. | Browser conflict/reload checks; server stale-head tests.       |
| Library listing transfers every document body | Listing returns metadata summaries. Full content is fetched when a template is opened; background detail refresh does not reset an in-progress review.                                                                                     | Summary/detail API assertions and browser stale-review checks. |

## Design checks

- The page names the template, current publication, working revision, owner, and
  pending reviewer without relying on color alone.
- Owner, editor, reviewer, and reader see actions that match their permissions.
- One primary next action is clear for each lifecycle state.
- Reviewing a published version does not leave a draft approval action nearby.
- Review reasons and request-changes feedback stay near the decision.
- Source DOCX content is read-only in the text preview; content replacement uses
  a revised file. Metadata changes cannot misrepresent downloaded bytes.
- Long titles, filenames, and legal text fit at mobile width without hiding the
  action or causing horizontal scrolling.
- Controls have labels, visible keyboard focus, and usable touch targets.
- Loading, empty, validation, stale, and storage-error states explain the next step.
- Shared runtime tokens and existing components carry typography, contrast, and
  surface depth. Global theme changes are outside this feature's scope.

## Evidence boundaries

The recording uses fictional users and documents. Its ledger must identify the
exact environment and whether production session middleware was exercised.
A loopback identity harness can prove the client, engine, and storage flow; it
does not establish production authentication, deployment, or customer acceptance.

No outreach, publication, or production deployment is part of this local review.

## Local acceptance results

Four subagents worked across backend, interface, independent code review, and
design/runtime evidence. Follow-up reviews checked the fixes against the original
failures instead of accepting implementation claims alone.

- Independent code review found no remaining actionable findings after the
  summary/detail and conflict-recovery fixes.
- The local API acceptance run passed 13 assertions using production template
  routes and engine logic, local Postgres, fictional ordinary-member personas,
  and an isolated tenant-bounded disk object adapter.
- The actual interface completed original DOCX upload, editor/reviewer delegation,
  request changes, replacement/resubmission, reviewer approval, a versioned
  download, private next-draft handling, and archive withdrawal.
- The grant-access and immediate-reopen regression passed a separate fresh-open
  check. Existing-open reviews retain their deliberately opened snapshot.
- Fresh desktop and mobile checks verify the widened dialog and fixed Word page
  geometry. Mobile scrolling stays inside the preview and dialog.
- `vp check` passed with no formatting, lint, or type warnings/errors.
- `vp run typecheck` passed for all six checked packages.
- `vp test --testTimeout=15000` passed: 63 files and 354 tests. The timeout override
  accommodates the repository's storage-heavy integration tests; their ordinary
  five-second timeout failed earlier in this workspace.
- Cloud web build and documentation build passed. Migration generation reported
  no schema changes after applying migrations through `0020` to the verified
  local database. Generated MCP documentation matches the tool catalog.

Commands used `PNPM_CONFIG_VIRTUAL_STORE_TYPE=project pnpm exec ...` for the
project-local pnpm layout. The globally shared dependency layout previously
failed to resolve an existing Tiptap dependency during web builds; no global
package-manager settings were changed.

The video packet is delivered under `output/template-library/`, with the source
recording, final MP4, contact sheet, acceptance receipts, and a manifest binding
the dirty working-tree implementation. These artifacts are local evidence and
are excluded from source control.

The final MP4 is 95.84 seconds, 1600 × 900, 25 fps, H.264. Its complete stream
decoded without errors. The source VP8/WebM recording is retained. All 26 source
and harness file hashes matched the recording manifest after capture. The
recorded browser download matched the approved source SHA-256 both before and
after a new private draft; archiving returned HTTP 404 to the sales reader.

## Remaining evidence boundaries

The local harness injects fictional personas and uses a test object adapter. It
does not prove production session authentication, cloud storage availability,
deployment, customer acceptance, or native Microsoft Word rendering. Exact source
byte equality is checked separately from the browser preview, which remains an
aid for reviewing the file.

Google Drive sync, arbitrary organization permission groups, reusable content
block propagation, questionnaire assembly, and in-browser Word layout editing
remain outside this feature. Public launch and outreach remain unsent.
