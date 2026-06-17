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
- **Deploy** — docker-compose: web + postgres + docling (docling-serve sidecar)

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

LLM provider keys (Claude / Gemini / OpenAI / OpenRouter) are added in-app under Settings
(encrypted, runtime-loaded), or set as a server-wide fallback in env (`ANTHROPIC_API_KEY`,
`OPENAI_API_KEY`, `GEMINI_API_KEY`, `OPENROUTER_API_KEY`). A user's own key **overrides** the server
key. Pick the model per chat message or per review run; OpenRouter is the zero-data-retention
default.

## Local development

`bun run dev` brings up deps (Postgres + the docling sidecar) in docker,
applies the schema, then runs the app:

```bash
bun install
bun run dev                           # deps in docker + web on http://localhost:4280
```

Flags: `--skip-deps` (deps already up), `--skip-migrate`, `--dry-run`.

Or do it by hand (equivalent to `--skip-deps --skip-migrate`):

```bash
docker compose up -d postgres        # Postgres with pgvector
cd packages/db && bun run migrate     # apply schema
turbo run dev                         # web on http://localhost:4280
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

Runs `web` + `postgres` (pgvector) + `docling` (internal-network-only). A one-shot `migrate` service
applies the schema and exits; `web` waits for it to finish, then serves. The serving container does
not mutate the schema itself.

## Connect an AI agent (MCP)

gitcounsel exposes an MCP server at `/api/mcp` (Streamable HTTP). It accepts two kinds of auth: a
static token you mint in **Settings → Connect**, or an OAuth login (for clients that require it,
like ChatGPT). Whichever you use, the agent acts as your gitcounsel account and everything it does
lands in the same commit log as an agent. It can drive product features (reviews, contracts,
workflows, documents, `generate_docx` to produce a downloadable Word file, `search`/`fetch`, audit)
but never auth or user settings (keys, tokens, account).

> OAuth (ChatGPT, native Claude connectors) needs the server reachable over **HTTPS** at a real
> hostname. For local testing, put a tunnel (`cloudflared`, `ngrok`) in front of `:4280` and use
> the tunnel URL below in place of `http://localhost:4280`.

**ChatGPT** (Developer Mode, paid plans): Settings → Connectors → add a custom connector with the
server URL `https://<host>/api/mcp`. ChatGPT discovers the OAuth endpoints, walks you through the
login + approval page, and connects. No token to paste.

**Claude Desktop / web** (custom connector): add a connector with URL `https://<host>/api/mcp`. It
runs the same OAuth login + approval. If you prefer a static token instead, use the `mcp-remote`
bridge with an `Authorization: Bearer <token>` header.

**Claude Code CLI** (static token): mint a token in Settings → Connect, then:

```bash
claude mcp add --transport http gitcounsel http://localhost:4280/api/mcp \
  --header "Authorization: Bearer <token>"
```

**Codex CLI** (static token): in `~/.codex/config.toml`:

```toml
[mcp_servers.gitcounsel]
url = "http://localhost:4280/api/mcp"
bearer_token_env_var = "GITCOUNSEL_TOKEN"
```

**How the OAuth side works:** gitcounsel is an OAuth 2.1 resource + authorization server. It serves
discovery at `/.well-known/oauth-protected-resource` and `/.well-known/oauth-authorization-server`,
runs the authorization-code flow with PKCE (S256), and supports both Client ID Metadata Documents
(ChatGPT's preferred path) and dynamic client registration. Access tokens are bound to the MCP
server address (the token only works here) and the login step reuses your gitcounsel session.

### Consumed MCP + chat

The in-app **Chat** (your LLM key) can also _consume_ external MCP servers — gitcounsel acts as an
MCP client for any global or per-user connection you add. None are seeded by default.

**CourtListener** legal-research tools (`search_case_law`, `verify_citations`) are **not** a
consumed MCP server — they are baked into the backend as gitcounsel's own tools, exposed over
gitcounsel's MCP server and in-app chat. Set `COURTLISTENER_API_TOKEN` to enable them. There is no
`courtlistener-mcp` sidecar.

Document extraction (PDF → markdown) uses **Docling** (`docling-serve`), called directly over its
REST API — not an MCP server. No auth, so it runs internal-network-only (never published to the
host). Configure with `DOCLING_URL`.
