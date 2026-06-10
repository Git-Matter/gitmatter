# gitcounsel — Build & Run Manual

How to set up, develop, and run gitcounsel, and how to connect an AI agent over MCP. For what the
product is, see the [README](../README.md).

## Stack

- **Monorepo** — Bun workspaces + Vite+ (`apps/web`, `packages/*`, `services/*`)
- **Frontend** — TanStack Start (Vite, Bun), shadcn/ui
- **Backend** — Hono mounted behind TanStack's `/api/$` catch-all (single process)
- **DB** — Postgres (pgvector installed, embeddings deferred) + Drizzle
- **Auth** — better-auth (email/password)
- **LLM** — multi-provider, bring-your-own key (Claude / Gemini / OpenAI / OpenRouter) via each
  provider's native SDK, configured for zero data retention; keys encrypted at rest
- **MCP** — `@modelcontextprotocol/sdk` (server + client, Streamable HTTP)
- **Storage** — S3-compatible object storage (Cloudflare R2 or any S3 endpoint); **required**
- **Deploy** — docker-compose: web + postgres + courtlistener-mcp + markitdown (Python sidecar)

## Prerequisites

- [Bun](https://bun.sh)
- Docker (for Postgres and the full stack)

## Configure

Copy `.env.example` to `.env` and fill in:

- `DATABASE_URL` — Postgres connection string.
- `BETTER_AUTH_SECRET`, `BETTER_AUTH_URL` — auth.
- `ENCRYPTION_KEY` — any non-empty string; a scrypt KDF derives the 32-byte AES-256-GCM key used to
  encrypt user secrets (LLM keys, MCP credentials).
- `COURTLISTENER_API_TOKEN` — for the bundled legal-research tools.
- `S3_ENDPOINT` / `S3_ACCESS_KEY` / `S3_SECRET_KEY` / `S3_REGION` / `S3_BUCKET` /
  `S3_FORCE_PATH_STYLE` — S3-compatible object storage (defaults target R2). **Required** — set up
  an R2 bucket or any S3 endpoint; there is no local-filesystem fallback.

LLM provider keys (Claude / Gemini / OpenAI / OpenRouter) are **not** env vars — a user adds them
in-app under Settings (encrypted, runtime-loaded). Optional server-wide fallback keys may be set in
env.

## Local development

```bash
bun install
docker compose up -d postgres        # Postgres with pgvector
cd packages/db && bun run migrate     # apply schema
bun run dev                           # web on http://localhost:4280
```

## Tooling (Vite+)

This repo uses [Vite+](https://viteplus.dev) (`vp`) as the unified toolchain. Run checks before
committing:

```bash
vp check    # format + lint + typecheck together
vp test     # vitest, whole repo
vp lint     # oxlint
vp fmt      # oxfmt
```

Build notes:

```bash
bun run build            # all packages across the workspace   <- safe default
vp run -F web build      # only the web app (from repo root)
cd apps/web && vp build  # build a single app from its own dir
```

`vp run <task>` fans out across the workspace; bare `vp <command>` acts on the current package only
(run it inside an app dir). At the repo root, bare `vp build` fails (`Cannot resolve entry module
index.html`) — the root is not an app.

## Full stack (Docker)

```bash
docker compose up --build
```

Runs `web` + `postgres` (pgvector) + `courtlistener-mcp` + `markitdown` (internal-network-only). The
web image applies the schema on boot, then serves.

## Connect an AI agent (MCP)

gitcounsel exposes an MCP server at `/api/mcp` (Streamable HTTP). In **Settings → Connect**, mint an
access token, then point a client at it.

**Claude Code CLI:**

```bash
claude mcp add --transport http gitcounsel http://localhost:4280/api/mcp \
  --header "Authorization: Bearer <token>"
```

**Claude Desktop:** add a custom connector with URL `http://localhost:4280/api/mcp` and header
`Authorization: Bearer <token>` (use the `mcp-remote` bridge if the connector UI requires it).

The token maps to your gitcounsel account; everything the agent does is recorded in the same commit
log, attributed as an agent. The agent can drive product features (reviews, contracts, workflows,
documents, audit) but never auth or user settings (keys, tokens, account).

> **ChatGPT and native OAuth connectors:** ChatGPT (and Claude's OAuth connector flow) require an
> OAuth 2.1 authorization server, not a static token. That is built in roadmap Phase 1; until then,
> use the bearer-token clients above.

### Consumed MCP + chat

The in-app **Chat** (your LLM key) also _consumes_ external MCP servers — gitcounsel acts as an MCP
client. Two are seeded:

- **CourtListener** (`services/courtlistener-mcp`, a Bun MCP server we ship) — `search_case_law`,
  `verify_citations`. Set `COURTLISTENER_API_TOKEN`.
- **MarkItDown** (Microsoft, Python sidecar) — `convert_to_markdown`. No auth, so it runs
  internal-network-only (never published to the host).
