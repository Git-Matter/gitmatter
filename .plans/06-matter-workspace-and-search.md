# Matter workspace and retrieval (M4)

Reduce navigation cost and make prior work reusable: a matter landing page organized by legal jobs,
plus permission-filtered Postgres full-text search across documents, cells, clauses, playbooks, and
matter metadata.

**Status: In progress** (source coverage reviewed 2026-10-13; final integrated checks and release
gates open).

The former title-only search baseline is now extended with permission-filtered full-text retrieval
and GIN indexes. The NDA matter overview now connects work needing attention and legal job entries.

## Implementation progress (2026-10-13)

- **Implemented source:** Postgres full-text search/indexes for documents, accepted cell
  values, clauses, playbooks, and matter metadata; SQL authorization before ranking/count/pagination;
  scoped contextual approved Library reads; MCP search/fetch parity; matter/all-authorized filters,
  type filters, and exact artifact links. Matter Review contract entry reuses plan 03. The overview
  presents pending proposals, failed/active jobs, recent reviews, escalations and spend with retry,
  cancellation, report and approval links. Escalations cover the five most recent reviews and job
  status the 1,000 most recent jobs; those limits are visible.
- **Remaining source/proof:** aggregation beyond the bounded overview; formal timing side-channel
  analysis and representative query/load tuning. Search fixtures do not establish constant-time
  behavior or performance under pilot load.
- **Proof still open:** authenticated browser, staging permission matrix, and uncoached first-user
  usability. Negative result/count tests do not establish constant-time behavior.

## Purpose

Reduce navigation cost and make prior work reusable.

## Work

- Rework matter landing page around **Review contract**, **Ask documents**, **Draft document**,
  **Bulk extraction**, and **Export work**.
- Add recent work, pending approvals, failed jobs, unresolved escalations, and cost-to-date to the
  matter overview.
- Add permission-filtered Postgres full-text search across document text, review-cell summaries,
  clause bodies, playbook titles/rules, and matter metadata.
- Return ranked snippets with exact artifact links. Filter access in SQL before ranking,
  aggregation, counts, and pagination.
- Group global results by matter. Add matter filter and source-type filter.
- Support the concrete precedent query: "Where have we accepted this language before?" using text
  and structured review data first.
- Defer semantic/vector search until users demonstrate queries that full-text search cannot serve.

## Exit gate

- User can find a known clause or review value from another authorized matter using representative
  fixtures.
- Unauthorized matter produces no title, snippet, count, timing distinction, or pagination leak.
- First-time pilot user can start the golden workflow from matter page without being taught
  Reviews/Workflows/Library taxonomy.

## Code areas

- Database indexes, a shared access-filtered query, the discovery tool, and global/matter UI.

## Related plans

- **Depends on** [`02-establish-product-truth.md`](02-establish-product-truth.md) for the fixtures and
  the browser acceptance script.
- The matter page also surfaces the pending approvals and escalations built in
  [`05-approval-and-agent-queue.md`](05-approval-and-agent-queue.md) and the cost-to-date from
  [`07-operational-controls.md`](07-operational-controls.md).
