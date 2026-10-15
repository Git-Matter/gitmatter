# Synthetic provider-quality acceptance

This bounded pack evaluates generated findings for captured review instructions. It uses the existing
entirely fictional NDA source, not client material. Test positions and expected outcomes are authored
software evaluation cases, not a lawyer-approved benchmark or actual firm policy.

The plan, scorer and self-check scripts are offline: they import no provider, database, credential
or environment loader. They never call a model, create accounts, publish legal content or send
messages. The separately gated local HTTP runner is described below. Run with Node's native
TypeScript support so Bun does not automatically load a project `.env`.

```sh
vp exec node --experimental-strip-types test/acceptance/provider-quality/self-check.ts
vp exec tsc --project test/acceptance/provider-quality/tsconfig.json
vp exec node --experimental-strip-types test/acceptance/provider-quality/cli.ts plan receiving
vp exec node --experimental-strip-types test/acceptance/provider-quality/cli.ts score /absolute/path/synthetic-observation.json
```

`plan` also accepts `disclosing`, `unknown` and `instruction-conflict`. Each plan prints the exact
synthetic source, shared test positions, instruction object and expected checks. The source and
standards hashes must stay identical across role scenarios. Expected verdicts must not be given to
the inference model; prepare only the source, `playbookRules` and `reviewInstructions`.

## Live observation procedure

The coordinator owns credentials and paid-call authorization. Do not read an env file, print a key,
paste a token, change provider retention settings or bypass the shared spend ledger to run this pack.
Use the repository's Secrets Manager workflow for runtime resolution where a credential is needed.

Before a live run, record only the tested source commit, authorized environment, isolated synthetic
matter and actor IDs, exact provider/model, configuration-presence metadata, token/cost ceilings and
approved call count. An eligible human must authorize the test playbook in that isolated environment.
This does not approve these positions for client work. A legal reviewer must confirm expectations
before using them as a legal benchmark; do not tune them after seeing provider output.

For each explicitly selected scenario:

1. Add only `sourceText` as the synthetic document. Prepare `playbookRules` as the isolated test
   playbook, using the same rule IDs and positions. Record its approval/audit revision.
2. Call production `runPlaybook(actor, { playbookId, matterId, documentIds, requestId,
reviewInstructions })`. Confirm a revision 2 snapshot with the plan's exact instructions.
3. Execute the production `runDocument(actor, { reviewId, documentId, model })` path once. One row
   call covers four findings, with the production 4,096-output-token limit. Four chosen scenarios
   therefore require at most four planned row calls before any separately authorized retry.
   The normal provider admission applies current tenant/user caps and records actual/uncertain spend.
   No raw SDK or alternative unmetered call is needed.
4. Capture production `getReview(reviewId)` after completion. Preserve an execution/audit/usage
   receipt separately so a coordinator can verify a live provider produced the findings. A model
   timeout or uncertain paid outcome fails the observation; never silently retry it.
5. Save the following wrapper locally, containing only this synthetic review:

```json
{
  "origin": "live_provider",
  "scenarioId": "receiving",
  "capturedReview": { "review": { "inputSnapshot": {} }, "cells": [] }
}
```

Replace `capturedReview` with the complete production response. Keep the live provider/model,
source commit, timing, run/review/finding commit IDs and usage receipts in the dated evidence record.
Do not put credentials, account emails or real client text in that record. Run `score` against the
wrapper. Scoring checks captured inputs, source/standard identity, completed attributed findings,
expected outcomes/flags and literal source quotations. It emits no generated legal prose.

For single-cell or durable-path observations, use the same prepared review and explicit production
`runCell` or `queueReviewRun` path, and label the path in evidence. Those have different call budgets:
four cells per scenario and possible billable uncertainty on interruption. A passing row observation
does not independently establish live single-cell, durable recovery, staging or browser proof.

## Human review and sign-off

The scorer never independently authenticates provider origin or signs off legal quality. Its
`technicalChecksPassed` means only the supplied synthetic observation satisfied structural and
authored comparison checks. The self-check uses authored results; it is not provider evidence.

An eligible legal reviewer must inspect the actual output before sign-off:

- Receiving and disclosing verdicts follow the captured role and this test's conditional term rule.
  Do not treat a preferred client outcome as permission to replace the approved standard.
- The mandatory notice rule stays binding for both sides. Conflicting additional instructions must
  be surfaced for a human; never silently approve an unapproved position.
- Explicit unknown party/role/law remains unknown. A mutual agreement does not establish the client's
  role. No invented law or enforceability claim is acceptable, even in otherwise inconclusive prose.
- Quotes are semantically relevant, not merely substrings. Missing return language is genuine
  absence in this whole source, with no fabricated quotation. Execution failure is not absence.
- Record false positives/negatives, citation relevance, corrections and reviewer rationale. Keep
  failures visible and distinguish a model limitation from a broken snapshot/prompt/guard path.

Use `test/acceptance/pilot-review.md` for professional and representative-document review. Successful
synthetic model observations do not establish actual Word fidelity, authenticated staging, firm
adoption, willingness to pay or production release. All of those gates remain separate.

## Local authenticated HTTP runner

`local-http.ts` uses the real authenticated local HTTP routes and shared audited/spend-controlled
engine. It does not import an SDK or read provider keys. It refuses non-loopback origins, follows no
redirects, and reads a cookie header only from a private mode-0600 file under ignored `.scratch/`.
The cookie file may contain one raw Cookie header line or `{ "cookieHeader": "..." }`. Never put its
value on the command line. The caller must provide the expected isolated user and tenant IDs; the
runner checks a fresh session and requires that test account to be a tenant administrator.

The user authorized local synthetic credentials for this acceptance session. Keep them local and
private; this is not authorization to change another environment's credential workflow. The runner
creates no account and sends no messages. Its fixture preparation creates a synthetic client,
matter and pasted-text source, a test playbook with recorded approval under the authorized account,
and four instructed reviews. This recorded account approval is not independent lawyer approval of
the benchmark. Word-file acceptance remains a separate journey.

Use explicit local paths and metadata from the coordinator:

```sh
vp exec node --experimental-strip-types test/acceptance/provider-quality/local-http.ts prepare \
  --base-url http://127.0.0.1:4280 --cookie-file /absolute/repository/.scratch/cookies.json \
  --run-dir /absolute/repository/.scratch/provider-quality-run \
  --user-id ISOLATED_USER_ID --tenant-id ISOLATED_TENANT_UUID --source-commit EXACT_40_CHARACTER_COMMIT
```

`prepare` makes **zero provider calls**. It captures the actual configured OpenAI catalog and
conservative existing per-cell estimates for the four scenarios. Those estimates duplicate prompt
context and allow 8,192 output tokens per scenario, while one row call allows 4,096. They are
application estimates, not an independently verified invoice guarantee. No model ID is guessed.

After the coordinator explicitly authorizes paid execution, select an ID returned by the current
configured catalog. Set a positive tenant application cost cap through the normal admin controls
first; the runner refuses an absent cap or a cap larger than its explicit budget (maximum USD 5).
When specifically authorized, `configure-cap` with the same local identity/path arguments and
`--max-cost-usd 2` performs a revision-checked update that preserves all other controls. It only
tightens an unlimited or larger cap; it refuses to loosen an existing stricter cap. Its policy
receipt stays in the private run directory.

```sh
vp exec node --experimental-strip-types test/acceptance/provider-quality/local-http.ts execute \
  --base-url http://127.0.0.1:4280 --cookie-file /absolute/repository/.scratch/cookies.json \
  --run-dir /absolute/repository/.scratch/provider-quality-run \
  --user-id ISOLATED_USER_ID --tenant-id ISOLATED_TENANT_UUID \
  --model EXACT_CONFIGURED_MODEL_ID --allow-paid --max-calls 4 --max-cost-usd 1
```

Execution rechecks the session, configured model, cost cap, unexecuted review cells and frozen inputs
before dispatch. It records each attempted row before requesting it, stops on HTTP/provider failure,
and refuses replay of an attempted run. The first strict score failure also stops the remaining
cases. No automatic paid retries occur. Keep a failed or uncertain
attempt visible and inspect current usage before any separately authorized new attempt. Four
successful row calls do not validate other models, provider paths or quality beyond this fixed pack.

Private mode-0600 artifacts contain sanitized synthetic observations, scores, histories, completion,
usage, call state and configuration metadata. They omit credentials and actor email/name enrichment.
Terminal output contains only fixed status, model IDs, estimates and comparison summaries. The
offline scorer still reports provider origin and legal quality as independently unverified; the
coordinator must reconcile actual usage/audit receipts and obtain legal review before sign-off.
