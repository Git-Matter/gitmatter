# Using Vite+, the Unified Toolchain for the Web

This project is using Vite+, a unified toolchain built on top of Vite, Rolldown, Vitest, tsdown, Oxlint, Oxfmt, and Vite Task. Vite+ wraps runtime management, package management, and frontend tooling in a single global CLI called `vp`. Vite+ is distinct from Vite, and it invokes Vite through `vp dev` and `vp build`. Run `vp help` to print a list of commands and `vp <command> --help` for information about a specific command.

Docs are local at `node_modules/vite-plus/docs` or online at <https://viteplus.dev/guide/>.

## Review Checklist

- [ ] Run `vp install` after pulling remote changes and before getting started.
- [ ] Run `vp check` and `vp test` to format, lint, type check and test changes.
- [ ] Check if there are `vite.config.ts` tasks or `package.json` scripts necessary for validation, run via `vp run <script>`.
- [ ] If setup, runtime, or package-manager behavior looks wrong, run `vp env doctor` and include its output when asking for help.

<!--VITE PLUS END-->

## Task Completion Requirements

- `vp check` (format, lint, type check) and `vp run typecheck` must pass before considering tasks completed.
- Use `vp test` for the built-in Vite+ test command and `vp run test` when you specifically need the `test` package script (runs `turbo run test`).
- Database-touching changes: regenerate and check migrations in `packages/db` (`vp run --filter=@workspace/db generate`) when the schema changes.

## Project Snapshot

gitmatter is the audited legal backend that any AI agent plugs into. It does AI-assisted legal review — contract redline, tabular extraction, document generation, and reusable workflows — on a **git-style audit spine**: every change, by a person in the UI or by an AI agent, is a commit with author, message, field-level diff, and blame, in one history.

Two things set it apart:

- **Bring your own agent.** A firm connects its existing AI client (ChatGPT, Claude Desktop, Claude web) to gitmatter as an MCP connector. The agent drives gitmatter's tools; gitmatter does the work and records every action.
- **Bring your own key.** gitmatter's own features (review, chat) run on the firm's LLM key — multi-provider (Claude / Gemini / OpenAI / OpenRouter), stored encrypted, configured for zero data retention.

Organized as **Client → Matter → artifacts**, with a legal team staffed per matter and every change traceable to a member.

## Core Priorities

1. Correctness of the audit spine. Every mutation must be attributable (author, message, diff, blame). Never bypass the commit path.
2. Reliability. Keep behavior predictable under load and during failures (provider timeouts, partial LLM streams, reconnects).
3. Data safety. LLM keys are encrypted at rest and used with zero data retention; never log or leak them.

If a tradeoff is required, choose correctness and robustness over short-term convenience.

## Maintainability

Long term maintainability is a core priority. If you add new functionality, first check if there is shared logic that can be extracted to a shared package (`contracts`, `core`, `db`, `registry`). Duplicate logic across packages is a code smell. Don't be afraid to change existing code. Don't take shortcuts by adding local logic that belongs in a shared package.

## Package Roles

This is a Bun + Turborepo monorepo (`apps/*`, `packages/*`, `services/*`).

- `apps/web`: React app on TanStack Start (Router, Query, Form, Table, Store). Owns the legal-review UI, chat, document rendering (tiptap, docx-preview, streamdown), auth (better-auth), and the embedded Hono server that exposes gitmatter's tools over MCP (`@hono/mcp`, `@modelcontextprotocol/sdk`).
- `apps/docs`: documentation site, rendered under `/docs`.
- `apps/video`: Remotion project for marketing/explainer video.
- `packages/contracts` (`@workspace/contracts`): shared Zod schemas and TypeScript contracts (LLM provider types, protocol). Keep schema-only — no runtime logic.
- `packages/core` (`@workspace/core`): the audited legal engine. Multi-provider AI loop (Anthropic / Google / OpenAI / OpenRouter), content generation (`docx`, `xlsx`, `mammoth`, `fast-diff`), tools, and platform adapters (S3). Subdirs: `ai`, `content`, `core`, `platform`, `tools`.
- `packages/db` (`@workspace/db`): Drizzle ORM schema, migrations, and Postgres access. Scripts: `generate`, `migrate`, `push`, `studio`.
- `packages/registry` (`@workspace/registry`): shared registry consumed across packages.
- `cli` (`gitmatter-cli`): packaged binary with per-platform build targets (darwin-arm64/x64, linux-x64, win-x64).
- `infrastructure`: infrastructure-as-code.
- `scripts`: operational scripts (`db-backup`, `db-restore`, `dev`, `wipe-s3`), run with `bun scripts/<name>.ts`.

## Reference Docs

- `README.md` — product overview and credits.
- `PRODUCT.md` — product framing.
- `DESIGN.md` — design system (colors, typography) for the web UI.
- `docs/admin/self-hosting.mdx` — setup, local development, and the Docker stack.
- `docs/ai-agents/connect-an-agent.mdx` — connecting an AI agent over MCP.

# AWS Guidance

- Prefer the AWS MCP Server for AWS interactions — it provides sandboxed
  execution, observability, and audit logging. If unavailable, use the
  AWS CLI directly.
- Before starting a task, check whether a relevant AWS skill is available.
  Load the skill with `retrieve_skill` and prefer its guidance over
  general knowledge.
- When uncertain about specific AWS details (API parameters, permissions,
  limits, error codes), verify against documentation rather than guessing.
  State uncertainty explicitly if you cannot confirm.
- When creating infrastructure, prefer infrastructure-as-code (AWS CDK or
  CloudFormation) over direct CLI commands.
- When working with infrastructure, follow AWS Well-Architected Framework
  principles.
- Do not use em dashes in AWS resource names or descriptions. Use
  hyphens instead.

## Secret Safety

- MUST load the `aws-secrets-manager` skill first for any secret,
  credential, API key, token, or password task. MUST NOT call
  `secretsmanager get-secret-value` or `batch-get-secret-value`, and MUST
  NOT hit the Secrets Manager Agent daemon directly. MUST use
  `{{resolve:secretsmanager:secret-id:SecretString:json-key}}` with
  `asm-exec` so the secret resolves at runtime without entering context.
