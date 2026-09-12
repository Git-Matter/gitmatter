# Subscription agent workflow validation

Date: 2026-09-13 (Australia/Sydney). Implementation: `851d77ec`.

## Implemented behavior

- Matter pages provide a review prompt scoped to that matter, with a direct link to agent setup.
- Connection setup leads with the existing AI client's sign-in flow. Manual access remains under advanced settings.
- The MCP catalog exposes workspace operations for the connected assistant's own reasoning. Provider inference tools are excluded; the built-in assistant retains them.
- Tool results include structured data, artifact links and protocol error indicators, including partial-write failures.
- Generated DOCX files are immediately readable and listed in their matter. Pasted documents also receive a matter link and creation audit commit.
- Agents propose document edits; only people can accept or reject them. Saved review cells remain agent findings, not human approvals.
- MCP documentation is generated from the actual catalog, with a CI drift check.
- Public OAuth discovery uses the configured public `BETTER_AUTH_URL` ahead of internal proxy addresses.

## Local evidence

- `vp check --fix`: passed formatting, lint and configured type checks.
- `vp run typecheck --force`: all six tasks passed without cached results.
- `vp test`: 32 files, 166 tests passed, including database and object-storage integration.
- `vp run docs:tools:check`: passed.
- `vp run build --filter=web` and `vp run docs:build`: passed.
- `git diff --check`: passed.
- The real handoff and connection components were exercised in an isolated browser preview: expand prompt, copy prompt, switch client instructions and copy connection address succeeded.

The MCP integration uses the official SDK client and in-memory transport with synthetic documents.
It covers generation, immediate source reading, a cited review cell, a proposed edit, rejected agent
approval, successful human approval, stored DOCX content, audit export and viewer access boundaries.
It does not exercise HTTP OAuth or inference by a real subscribed assistant.

## Staging evidence

Deployment workflow: [34698466608](https://github.com/Git-Matter/gitmatter/actions/runs/34698466608).
The clean-runner CI gate passed: 154 tests passed and 12 storage-dependent tests were skipped.
Both image builds and webhook steps passed, but **Dokploy failed both deployments** with
`ghcr.io` registry login denied. The previous containers remained running.

- Web deployment `grPKbvmfnhz7cI10MIT3t`: error before image pull.
- Docs deployment `5oJ6uAu3j4ehZi74qvbBU`: same registry login error.
- Published web digest: `sha256:656542ab28e8a846344da50840ea14d8bf23c880cbf41a81f2754e3d884d0a62`.
- Published docs digest: `sha256:0d7c06459f71052106e35c7f9e00cc02d3c9fdea0da9fa60ff7e3b9beb04c97f`.
- The docs application's obsolete `ghcr.io/peteqian/gitmatter-docs:staging` image setting was
  corrected to `ghcr.io/git-matter/gitmatter-docs:staging` through Dokploy.

Before deployment, the HTTPS staging site advertised `http://staging.gitmatter.com/api/mcp` and
HTTP authorization endpoints. The installed staging connector required reauthentication.
After the failed deployment, discovery was unchanged and health/readiness still passed on the
old service. The documentation URL also returned a 308 redirect to itself. No successful live
release or authenticated external-agent journey is claimed.

Registry credential repair requires the repository-mandated `aws-secrets-manager` skill, which
was unavailable. No credentials were retrieved or rotated. After restoring registry access,
redeploy these images, verify actual running digests, check HTTPS discovery and the docs route,
then reconnect a real subscribed assistant and exercise a synthetic review.

## Remaining acceptance boundaries

- A real ChatGPT or Claude subscription completing sign-in and the review journey remains unverified.
- Browser checks used isolated components, not an authenticated matter session.
- Existing historical documents missing source extraction or matter links were not backfilled.
- This does not implement the entire real-usage roadmap or establish pilot/production readiness.
