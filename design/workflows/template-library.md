# Maintain and use an approved template

Person: owner/editor maintains language; assigned human reviewer decides a revision; workspace reader
retrieves approved content. Object: template plus separate working/current revision. Entry: Library;
return: same filtered/search list. Terminal: the right approved file, or an attributable revision decision.

References: Notion reusable structure + GitHub revision-aware review + Airtable list/detail.
Do not copy Notion's unrestricted template edit model into exact-version legal approval.

## Required path

`find template → inspect approved vs working identity → edit/upload draft → send exact revision → inspect diff and source → approve/request changes → download approved revision`

The published download must remain the approved file while another revision is being edited. A changed
head invalidates stale approval attempts. Reader views must not reveal private working language.
Archive removes reader availability without erasing history. Restore returns to the existing backend
policy's draft/review path, not an invented approved state.

## Interaction contract

- List rows prioritize name, meaningful state, current/working revision and the relevant action.
- Search, tabs and detail selection must remain understandable on return and narrow screens.
- An editor/reviewer sees the reason and exact revision under review; reader sees current approved
  content and a correctly named download. “Current” does not mean “most recently edited”.
- Closing dirty work requires an explicit preserve/discard decision and focus return.
- Pending mutation, denied permission, changed source/head, failed download and unavailable template
  are distinct states. A stale review keeps its snapshot so the person can understand the conflict.

Owners: `TemplatesSection`, `TemplateEditor`, `TemplateDetail`, `TemplateTeam`, `TemplateHistory`,
and `template-ui`. Existing local evidence in `output/template-library` predates this research;
it helps locate scenarios but does not prove current visual or workflow acceptance.

## Acceptance tasks

Editor uploads/revises → reviewer opens exact version → approves → reader downloads approved file;
then editor starts a new private draft and the reader still gets the same approved file. Repeat a
stale approval, dirty close, denied role, archived download, search-return and 390px inspection.

## Verified walkthrough

The [local integration record](../evidence/template-library.json) and
[reproduction guide](../../test/acceptance/template-library/design-acceptance.md) cover the normal
owner/editor/reviewer/reader path using current production UI, Hono routes, core and real local
Postgres. Original fictional DOCX bytes are stored by a tenant-scoped disk test adapter.

The reader's approved v2 download matches the original file hash before and after a new private v3
draft. Readers see neither the working revision nor internal history. Archive removes reader listing
and download access; restore returns to draft and requires fresh approval. A download failure keeps
the approved-template context available for retry.

Concurrent revision checks preserve the frozen v1 source and its copyable note while the editor
advances to v2. The core rejects a stale approval with 409. Reloading dirty input requires Keep or
Discard, and v2 needs a fresh review confirmation. A transient refresh outage preserves the note
while blocking decisions; authoritative denial removes the cached private view. This uses the same
snapshot-retention policy as the first-review guide.

Search and filter survive close. Focus returns to the row, including after list replacement, with
search as a fallback if the row disappears. This follows [Base UI's focus contract](https://base-ui.com/react/components/dialog#custom-focus-management),
verified against the installed API and the rendered interaction. Mobile inspection passes at 390px. The context/close header remains visible while the body scrolls; the note is checked for actual visibility beneath it.

These are internal workflow checks with injected fictional personas, not live authentication,
remote-storage, production-deployment, Word-transformation or representative-user acceptance.

The harness also mirrors the Library screen's controlled route state. A confirmed server mutation or
explicit local discard resolves the unsaved-work guard before the selected-template URL is cleared.
The pending-response case holds an actual local API response, checks the truthful action label,
disables closing and note edits, and confirms that Escape does not discard an in-flight decision.
