# gitmatter

**The audited legal backend that any AI agent plugs into.**

gitmatter does AI-assisted legal review — contract redline, tabular extraction, document
generation, and reusable workflows — on a **git-style audit spine**: every change, whether made by a
person in the UI or by an AI agent, is a commit with author, message, field-level diff, and blame,
in one history. Chat answers cite their sources, reviews export to CSV/XLSX, and any agent can
generate a downloadable Word file.

What makes it different:

- **Bring your own agent.** A firm connects the AI client it already uses — ChatGPT, Claude
  Desktop, Claude web — to gitmatter as a connector. A lawyer says _"review these NDAs"_ in their
  own assistant; the agent drives gitmatter's tools; gitmatter does the work and records every
  action. The firm's AI on the front, gitmatter's audited legal engine behind.
- **Bring your own key.** gitmatter's own features (review, chat) run on the firm's LLM key —
  multi-provider (Claude / Gemini / OpenAI / OpenRouter), stored encrypted, configured for zero
  data retention.
- **Built for how firms work.** Organized as **Client → Matter → artifacts**, with a legal team
  staffed per matter and every change traceable to a member.

## Docker quickstart

The fastest self-hosted setup uses Docker Compose. It runs the public gitmatter image and Postgres
locally, then serves the app at `http://localhost:4280`.

```bash
cp .env.example .env

# Fill BETTER_AUTH_SECRET, ENCRYPTION_KEY, and S3_* in .env.
# For the secrets, this is enough:
openssl rand -base64 32

docker compose up -d
```

Object storage is required for uploaded documents. Cloudflare R2 works well because it speaks the
S3 API; see [the self-hosting guide](docs/admin/self-hosting.mdx) for the exact `.env` values.

The default image is `ghcr.io/git-matter/gitmatter:latest`. For production, pin a release tag with
`GITMATTER_IMAGE`, for example `ghcr.io/git-matter/gitmatter:v2026.06.22`.

## Build & run

Use Vite+ 0.3.2 or newer. Node.js is pinned in `.node-version`, pnpm in
`package.json`, and the project toolchain in `pnpm-workspace.yaml`.

```sh
vp install
vp run dev
vp run build       # web, docs, video, and CLI
vp check
vp run typecheck   # all eight workspaces
vp test run        # database tests require a migrated local Postgres
```

See **[docs/admin/self-hosting.mdx](docs/admin/self-hosting.mdx)** — setup, local development, and
the full Docker stack — and **[docs/ai-agents/connect-an-agent.mdx](docs/ai-agents/connect-an-agent.mdx)**
for connecting an AI agent over MCP. These render on the docs site under `/docs`.
