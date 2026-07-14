# gitmatter CLI

Self-host gitmatter with **one prerequisite: Docker**. The CLI wraps Docker
Compose so the user never writes YAML. Built to be driven by a human _or_ an AI
agent (every command takes `--json` and prints actionable fixes).

## Install

```sh
curl -fsSL gitmatter.com/install.sh | sh
```

The script (served from `apps/web/public/install.sh`) detects OS/arch, pulls
the binary from the latest GitHub Release, and installs it to
`/usr/local/bin` or `~/.local/bin`.

Or grab the binary for your OS from Releases yourself, or build it:

```sh
bun run build         # this platform -> dist/gitmatter
bun run build:all     # mac (arm64/x64), linux x64, windows x64
```

Drop the binary on PATH as `gitmatter`.

## Use

```sh
gitmatter init       # asks: domain, bundled vs external DB; generates secrets
gitmatter up         # pulls images, starts stack, prints the URL
gitmatter doctor     # checks Docker + config + DB, prints fixes
gitmatter down       # stop
gitmatter update     # pull newer images + restart
gitmatter logs web   # tail a service
```

Non-interactive (agent / scripted):

```sh
gitmatter init --yes --domain counsel.firm.com --db external \
  --database-url postgres://… --tls auto
gitmatter up --json
```

## Choices `init` makes

- **Domain** — default `gitmatter.local`. A `.local` or bare host gets a Caddy
  internal cert (browsers warn until its root CA is trusted; `doctor` prints the
  step). A public dotted domain gets a real auto cert via Caddy ACME.
- **Database** — `bundled` runs Postgres (pgvector) in a container; `external`
  uses your `DATABASE_URL` (Neon, Supabase, or your own). pgvector is required —
  the app uses vector search.
- **Secrets** — `BETTER_AUTH_SECRET` and `ENCRYPTION_KEY` are generated once and
  preserved across re-runs.

State lives in `~/.gitmatter` (override with `GITMATTER_HOME`): `.env`,
`Caddyfile`, `compose.yml`, `compose.db.yml`.

## Before release

The web service pulls `ghcr.io/gitmatter/gitmatter:latest` (see
`src/templates.ts`). Set up CI to build `infrastructure/Dockerfile.web` and push
that image, or point `GITMATTER_IMAGE` at your registry.
