# gitmatter

gitmatter is a legal document workspace for contract review, tabular extraction, document
generation, and reusable workflows. Work is organized as Client → Matter → artifacts.
Document changes use an audit history with authors, messages, field-level diffs, and blame.

The web app supports configured AI-provider accounts and exposes tools to external agents over MCP.
See the setup and agent-connection guides below for configuration and data-handling requirements.

## Docker quickstart

The self-hosted setup uses Docker Compose. It runs the public gitmatter image and Postgres
locally, then serves the app at `http://localhost:4280`.

```bash
cp .env.example .env

# Fill BETTER_AUTH_SECRET, ENCRYPTION_KEY, and S3_* in .env.
# For the secrets, this is enough:
openssl rand -base64 32

docker compose up -d
```

S3-compatible object storage is required for uploaded documents; see [the self-hosting guide](docs/admin/self-hosting.mdx) for the exact `.env` values.

The default image is `ghcr.io/git-matter/gitmatter:latest`. For production, pin a release tag with
`GITMATTER_IMAGE`, for example `ghcr.io/git-matter/gitmatter:v2026.06.22`.

## Build & run

See **[docs/admin/self-hosting.mdx](docs/admin/self-hosting.mdx)** — setup, local development, and
the full Docker stack — and **[docs/ai-agents/connect-an-agent.mdx](docs/ai-agents/connect-an-agent.mdx)**
for connecting an AI agent over MCP. These render on the docs site under `/docs`.
