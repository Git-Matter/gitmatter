# docs

The gitcounsel documentation site — a standalone **Next.js + Fumadocs** app, built
with its own toolchain (independent of the `apps/web` vite-plus build) and served
under `/docs`.

## Why a separate app

Docs build and deploy on their own (`next build`), so they don't depend on the main
app's build pipeline. Content is plain MDX under `content/docs/`.

## Commands

```bash
# from repo root
bun run docs:build      # turbo run build --filter=docs
bun run docs:dev        # dev server on http://localhost:4290/docs

# or from apps/docs
bun run build           # next build → standalone server output
bun run dev             # next dev  (http://localhost:4290/docs)
```

## Serving in production

`bun run docs:build` (or `next build`) produces a self-contained standalone server.
The build's postbuild step copies `.next/static` and `content/docs` into the
standalone output, so the whole `.next/standalone/apps/docs` directory is
deployable as-is. Run it and reverse-proxy `/docs` to it:

```bash
node apps/docs/.next/standalone/apps/docs/server.js   # listens on PORT (default 3000)
```

Updating docs is a rebuild: edit `content/docs/**`, run `bun run docs:build`, redeploy.

`basePath` is `/docs`, so every route and asset is namespaced under `/docs`
(`/docs/_next/...`, `/docs/api/search`, `/docs/llms.txt`). A single reverse-proxy
rule routes everything to this app:

```
location /docs { proxy_pass http://docs-app; }
```

This avoids any collision with `apps/web`'s own `/api/*` routes.

## What's here

- `content/docs/**` — the MDX content (Getting started, User guide, AI & agents,
  API reference, Admin & compliance) + `meta.json` sidebar ordering.
- `app/(docs)/[[...slug]]` — renders a page with fumadocs `DocsLayout`/`DocsPage`,
  including the copy-for-LLM and "open in ChatGPT/Claude" page actions.
- `app/llms.txt`, `app/llms-full.txt` — machine-readable docs for LLMs.
- `app/md/[[...slug]]` — raw Markdown for a page (backs the copy/view actions).
- `app/api/search` — fumadocs search index.

Internal MDX links are root-relative (e.g. `/user-guide`); Next's `basePath` adds the
`/docs` prefix at render time.
