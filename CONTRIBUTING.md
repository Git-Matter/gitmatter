# Contributing to gitmatter

Thanks for helping improve gitmatter.

gitmatter is an audited legal backend. Contributions must protect the audit trail, document safety,
and provider-key safety. If a change makes the product faster or easier but weakens attribution,
history, encryption, or data handling, it is not acceptable.

## Code of Conduct

Be respectful, direct, and useful. Technical disagreement is welcome. Personal attacks, harassment,
or bad-faith behavior are not. Everyone participating in the project must follow the
[Code of Conduct](CODE_OF_CONDUCT.md).

## Questions and Support

Please use [GitHub Discussions](https://github.com/Git-Matter/gitmatter/discussions) for questions,
setup help, troubleshooting, and general support.

Use Discussions when you want to ask about:

- local setup
- Docker, Postgres, or object storage configuration
- connecting an AI agent over MCP
- LLM provider setup
- how a feature is supposed to work
- whether an idea is worth pursuing

Please open an issue instead when you have a reproducible bug, a docs problem, or a concrete feature
request. This keeps issues focused on work we can track and fix, while still giving questions a
public place where answers can help other people later.

## Bugs

Before opening a bug report, search existing issues.

If the bug may be a security vulnerability, do not report it publicly. Follow the private
reporting instructions in [SECURITY.md](SECURITY.md).

A good bug report includes:

- what you expected
- what happened
- steps to reproduce
- relevant logs or screenshots
- whether Docker, Postgres, and object storage were running
- whether the bug affects audit history, document changes, auth, provider keys, or MCP tools

Bugs that touch audit history, document mutation, authentication, encryption, or LLM provider calls
should be treated as high priority.

## Feature Requests

For small features, opening a pull request is fine.

For larger changes, open an issue first. This includes changes to:

- audit history, commits, diffs, or blame
- database schema
- document generation or extraction
- LLM provider behavior
- MCP tools
- authentication or permissions
- encrypted key storage
- shared package boundaries

Pull requests are not the best place to design large product changes from scratch.

## Pull Request Quality

Before opening a pull request:

1. Search existing issues and pull requests.
2. Keep the change focused.
3. Include tests when behavior changes.
4. Explain the user-facing behavior change.
5. Explain any audit, data safety, schema, provider, or MCP impact.
6. Avoid local duplicate logic when shared logic belongs in `packages/contracts`, `packages/core`,
   `packages/db`, or `packages/registry`.

We may close pull requests that are speculative, too broad, untested, or weaken audit/data-safety
guarantees.

## Coding Rules

- Keep code easy to read from top to bottom.
- Prefer simple function names.
- Prefer early returns.
- Do not hide important behavior behind clever abstractions.
- Public contracts should live in `packages/contracts`.
- Core legal, audit, and content behavior should live in `packages/core`.
- Database schema and migrations belong in `packages/db`.
- Shared registries belong in `packages/registry`.
- Do not log secrets, provider keys, document contents, access tokens, or raw sensitive provider
  payloads.
- Every user-visible or agent-made mutation must preserve author, message, diff, and blame through
  the audit spine.

## Validation

Run these before considering a change complete:

```bash
vp check
vp run typecheck
vp test
```

If the change touches database schema, also run:

```bash
vp run --filter=@workspace/db generate
```

Commit generated migration files with the schema change.

If a check cannot run because local services are missing, say that clearly in the pull request.

## Commit Messages

Use clear commit messages that explain the change.

Preferred format:

```text
<area>: <short summary>
```

Area examples:

- `web` for the TanStack Start app in `apps/web`
- `docs` for the docs app and markdown docs
- `video` for the Remotion project in `apps/video`
- `contracts` for shared schemas and TypeScript contracts
- `core` for the audited legal engine, AI loop, content tools, and platform adapters
- `db` for Drizzle schema, migrations, and database access
- `registry` for shared provider/tool registries
- `cli` for the packaged `gitmatter-cli`
- `infra` for deployment and infrastructure files
- `scripts` for operational scripts
- `ci` for GitHub Actions and release automation

Examples:

```text
web: add matter history filters
core: preserve author on tabular review commits
db: add workflow run audit fields
docs: clarify MCP setup
ci: run migrations before tests
```

Use the commit body when the reason is not obvious.

## Reviewing Pull Requests

Reviewers should block changes that:

- bypass or weaken the audit spine
- mutate documents without attribution
- expose secrets or sensitive legal data
- add schema changes without migrations
- add provider calls without clear error handling
- duplicate shared logic in app-local code
- skip tests for behavior changes
- make code harder to read without a real payoff

## AI-Assisted Contributions

AI-generated code is allowed, but the submitter is responsible for it.

Be extra careful with AI-generated changes to audit history, auth, encryption, database writes,
provider calls, document parsing, and MCP tools. These areas need human review and clear tests.
