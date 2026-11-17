import { chmodSync, lstatSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { randomUUID } from "node:crypto";
import { plan, scenarios, sourceText, rules, sourceHash, standardsHash } from "./scenarios.ts";
import { scoreObservation } from "./scorer.ts";

type ObjectValue = Record<string, unknown>;
const obj = (value: unknown): ObjectValue =>
  value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as ObjectValue)
    : {};
const rows = (value: unknown): ObjectValue[] => (Array.isArray(value) ? value.map(obj) : []);
const uuid = (value: unknown): string => {
  if (typeof value !== "string" || !/^[a-f0-9-]{36}$/i.test(value))
    throw new Error("invalid_record_id");
  return value;
};
const repoRoot = fileURLToPath(new URL("../../../", import.meta.url));
const scratchRoot = resolve(repoRoot, ".scratch");

function privatePath(value: string): string {
  const path = resolve(value);
  if (!path.startsWith(`${scratchRoot}${sep}`)) throw new Error("private_scratch_path_required");
  return path;
}
function readPrivate(path: string): string {
  const file = lstatSync(path);
  if (
    !file.isFile() ||
    file.isSymbolicLink() ||
    (file.mode & 0o077) !== 0 ||
    file.size > 1024 * 1024
  )
    throw new Error("private_file_required");
  return readFileSync(path, "utf8");
}
function save(path: string, value: unknown) {
  mkdirSync(dirname(path), { recursive: true, mode: 0o700 });
  chmodSync(dirname(path), 0o700);
  writeFileSync(path, JSON.stringify(value, null, 2), { mode: 0o600 });
  chmodSync(path, 0o600);
}
function argument(name: string, required = true): string {
  const index = process.argv.indexOf(name);
  const value = index >= 0 ? process.argv[index + 1] : undefined;
  if (value && !value.startsWith("--")) return value;
  if (required) throw new Error("missing_argument");
  return "";
}

class HttpFailure extends Error {
  readonly operation: string;
  readonly status: number;
  readonly classification: string;
  constructor(operation: string, status: number, classification: string) {
    super(classification);
    this.operation = operation;
    this.status = status;
    this.classification = classification;
  }
}

async function main() {
  const command = process.argv[2];
  if (!["prepare", "configure-cap", "execute"].includes(command ?? ""))
    throw new Error("invalid_command");
  const base = new URL(argument("--base-url"));
  if (
    base.protocol !== "http:" ||
    !["127.0.0.1", "localhost", "[::1]"].includes(base.hostname) ||
    base.username ||
    base.password ||
    base.pathname !== "/" ||
    base.search ||
    base.hash
  )
    throw new Error("loopback_origin_required");
  const cookieFile = privatePath(argument("--cookie-file"));
  const cookieInput = readPrivate(cookieFile).trim();
  const cookieHeader = cookieInput.startsWith("{")
    ? obj(JSON.parse(cookieInput)).cookieHeader
    : cookieInput;
  if (
    typeof cookieHeader !== "string" ||
    !cookieHeader ||
    cookieHeader.length > 65536 ||
    /[^\x20-\x7e]/.test(cookieHeader)
  )
    throw new Error("invalid_private_cookie_file");
  const authCookie = cookieHeader as string;
  const runDir = privatePath(argument("--run-dir"));
  const statePath = resolve(runDir, "run.json");
  const expectedUserId = argument("--user-id");
  const expectedTenantId = uuid(argument("--tenant-id"));

  async function http(
    path: string,
    method = "GET",
    body?: unknown,
    timeoutMs = 30000
  ): Promise<unknown> {
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith("/api/"))
      throw new Error("local_api_only");
    let response: Response;
    try {
      response = await fetch(url, {
        method,
        headers: {
          Cookie: authCookie,
          Origin: base.origin,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        ...(method === "GET" || method === "HEAD" || body === undefined
          ? {}
          : { body: JSON.stringify(body) }),
        redirect: "error",
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch {
      throw new HttpFailure(
        method === "POST" && path.endsWith("/run-doc") ? "paid_row" : "local_api",
        0,
        "network_or_timeout_no_automatic_retry"
      );
    }
    const text = await response.text();
    if (text.length > 2 * 1024 * 1024)
      throw new HttpFailure("local_api", response.status, "response_too_large");
    let data: unknown;
    try {
      data = JSON.parse(text);
    } catch {
      throw new HttpFailure("local_api", response.status, "invalid_json_response");
    }
    if (!response.ok) {
      const rawMessage = obj(data).error;
      const message = typeof rawMessage === "string" ? rawMessage : "";
      const known = [
        "access_denied",
        "limit_reached",
        "input_not_ready",
        "stale_source",
        "provider_outcome_unknown",
        "insufficient_quota",
        "model_not_found",
      ];
      throw new HttpFailure(
        method === "POST" && path.endsWith("/run-doc") ? "paid_row" : "local_api",
        response.status,
        known.find((code) => message.includes(code)) ?? "request_failed_details_withheld"
      );
    }
    return data;
  }
  const session = obj(await http("/api/auth/get-session?disableCookieCache=true"));
  const account = obj(session.user);
  if (
    account.id !== expectedUserId ||
    account.tenantId !== expectedTenantId ||
    account.tenantRole !== "admin"
  )
    throw new Error("isolated_admin_identity_mismatch");
  const catalog = rows(await http("/api/models"));
  const openai = catalog.find(
    (provider) => provider.provider === "openai" && provider.available === true
  );
  if (!openai) throw new Error("configured_openai_provider_required");
  const modelIds = rows(openai.models)
    .map((model) => model.id)
    .filter(
      (value): value is string =>
        typeof value === "string" && /^[a-zA-Z0-9._:/-]{1,200}$/.test(value)
    );
  const controls = obj(await http("/api/admin/job-controls"));

  if (command === "configure-cap") {
    const cap = Number(argument("--max-cost-usd"));
    const effective = obj(controls.effective);
    const prior = Number(effective.tenantCostLimitUsd);
    if (!(cap > 0 && cap <= 5) || (prior > 0 && prior < cap))
      throw new Error("only_tighten_bounded_local_cap");
    const after =
      prior === cap
        ? controls
        : obj(
            await http("/api/admin/job-controls", "PATCH", {
              expectedRevision: controls.revision,
              reason:
                "Bounded synthetic local provider acceptance: at most four planned row calls; preserve other controls.",
              policy: { ...effective, tenantCostLimitUsd: cap },
            })
          );
    save(resolve(runDir, "cap-policy-change.json"), {
      before: controls,
      after,
      changed: prior !== cap,
    });
    console.log(
      JSON.stringify({
        status: "local_cost_cap_configured",
        tenantCostLimitUsd: cap,
        providerCalls: 0,
      })
    );
    return;
  }

  if (command === "prepare") {
    if (lstatExists(statePath)) throw new Error("new_run_directory_required");
    const sourceCommitClaim = argument("--source-commit");
    if (!/^[a-f0-9]{40}$/i.test(sourceCommitClaim)) throw new Error("exact_source_commit_required");
    const runId = randomUUID();
    const state: ObjectValue = {
      schemaVersion: 1,
      kind: "local_synthetic_provider_quality",
      runId,
      status: "preparing",
      baseOrigin: base.origin,
      expectedUserId,
      expectedTenantId,
      sourceCommitClaim,
      sourceHash,
      standardsHash,
      provider: "openai",
      configuredModelIds: modelIds,
      providerConfigurationSource: openai.source === "env" ? "env" : "user",
      controlsAtPreparation: controls,
      attemptedCalls: 0,
      createdAt: new Date().toISOString(),
      scenarios: [],
    };
    save(statePath, state);
    const client = obj(
      await http("/api/clients", "POST", {
        name: `Synthetic provider evaluation ${runId}`,
        type: "organization",
      })
    );
    state.clientId = uuid(client.id);
    save(statePath, state);
    const matter = obj(
      await http("/api/matters", "POST", {
        clientId: state.clientId,
        name: `Synthetic instruction evaluation ${runId}`,
      })
    );
    state.matterId = uuid(matter.id);
    save(statePath, state);
    const document = obj(
      await http("/api/documents", "POST", {
        matterId: state.matterId,
        title: "Fictional NDA for provider evaluation",
        markdown: sourceText,
      })
    );
    state.documentId = uuid(document.id);
    save(statePath, state);
    const created = obj(
      await http("/api/workflows", "POST", {
        title: `Synthetic evaluation positions ${runId}`,
        type: "playbook",
        promptMd: "Fictional software test positions, not an approved client-work policy.",
        rules,
      })
    );
    const workflowId = uuid(obj(created.workflow).id);
    state.workflowId = workflowId;
    save(statePath, state);
    const approved = obj(
      await http(`/api/workflows/${workflowId}`, "PATCH", { status: "approved" })
    );
    const workflow = obj(approved.workflow);
    if (
      workflow.status !== "approved" ||
      workflow.isSystem !== false ||
      workflow.tenantId !== expectedTenantId
    )
      throw new Error("synthetic_standard_approval_not_verified");
    state.playbookRevision = workflow.headCommitId;
    save(
      resolve(runDir, "playbook-history.json"),
      sanitizeHistory(await http(`/api/workflows/${workflowId}/history`))
    );
    for (const scenario of scenarios) {
      const requestId = randomUUID();
      const prepared = obj(
        await http(`/api/workflows/${workflowId}/run-playbook`, "POST", {
          matterId: state.matterId,
          documentIds: [state.documentId],
          requestId,
          reviewInstructions: plan(scenario.id).reviewInstructions,
        })
      );
      const reviewId = uuid(prepared.reviewId);
      const capturedReview = await http(`/api/tabular/reviews/${reviewId}`);
      if (
        scoreObservation({ origin: "live_provider", scenarioId: scenario.id, capturedReview })
          .metadataFailures.length
      )
        throw new Error("prepared_snapshot_mismatch");
      (state.scenarios as unknown[]).push({ id: scenario.id, reviewId, requestId });
      save(resolve(runDir, `${scenario.id}-prepared.json`), sanitizeReview(capturedReview));
      save(statePath, state);
    }
    const conservativeEstimatedUsdByModel: Array<{ model: string; estimatedUsd: number | null }> =
      [];
    for (const model of modelIds) {
      let total = 0;
      let priced = true;
      for (const scenario of rows(state.scenarios)) {
        const estimate = obj(
          await http(
            `/api/tabular/reviews/${uuid(scenario.reviewId)}/estimate?model=${encodeURIComponent(model)}`
          )
        );
        if (typeof estimate.costUsd !== "number" || estimate.costUsd < 0) priced = false;
        else total += estimate.costUsd;
      }
      conservativeEstimatedUsdByModel.push({ model, estimatedUsd: priced ? total : null });
    }
    state.conservativePerCellEstimatedUsdByModel = conservativeEstimatedUsdByModel;
    state.status = "prepared";
    save(statePath, state);
    console.log(
      JSON.stringify({
        status: "prepared",
        providerCalls: 0,
        configuredProvider: "openai",
        configuredModelIds: modelIds,
        conservativePerCellEstimatedUsdByModel: conservativeEstimatedUsdByModel,
        runDir,
        legalQualitySignoff: "not_established",
      })
    );
    return;
  }

  if (!process.argv.includes("--allow-paid"))
    throw new Error("explicit_paid_execution_flag_required");
  const maxCalls = Number(argument("--max-calls"));
  const maxCostUsd = Number(argument("--max-cost-usd"));
  if (maxCalls !== 4 || !(maxCostUsd > 0 && maxCostUsd <= 5))
    throw new Error("bounded_call_and_dollar_budget_required");
  const model = argument("--model");
  if (!modelIds.includes(model)) throw new Error("model_not_in_current_configured_openai_catalog");
  const policy = obj(controls.effective);
  if (!(Number(policy.tenantCostLimitUsd) > 0 && Number(policy.tenantCostLimitUsd) <= maxCostUsd))
    throw new Error("set_positive_application_cost_cap_before_execution");
  const state = obj(JSON.parse(readPrivate(statePath)));
  if (
    state.schemaVersion !== 1 ||
    state.kind !== "local_synthetic_provider_quality" ||
    state.status !== "prepared" ||
    state.attemptedCalls !== 0 ||
    state.baseOrigin !== base.origin ||
    state.expectedUserId !== expectedUserId ||
    state.expectedTenantId !== expectedTenantId ||
    state.sourceHash !== sourceHash ||
    state.standardsHash !== standardsHash
  )
    throw new Error("fresh_matching_preparation_required_no_automatic_retry");
  const preparedScenarios = rows(state.scenarios);
  if (
    preparedScenarios.length !== 4 ||
    preparedScenarios.some((scenario, index) => scenario.id !== scenarios[index]!.id)
  )
    throw new Error("exact_four_scenarios_required");
  const estimates: ObjectValue[] = [];
  for (const scenario of preparedScenarios) {
    const reviewId = uuid(scenario.reviewId);
    const capturedReview = obj(await http(`/api/tabular/reviews/${reviewId}`));
    if (
      scoreObservation({ origin: "live_provider", scenarioId: scenario.id, capturedReview })
        .metadataFailures.length ||
      rows(capturedReview.cells).some(
        (cell) => cell.status !== "pending" || cell.lastCommitId || cell.content
      )
    )
      throw new Error("review_already_executed_or_inputs_changed");
    const history = rows(await http(`/api/tabular/reviews/${reviewId}/history`));
    if (history.some((commit) => commit.op === "run_cell" || commit.op === "run_queued"))
      throw new Error("review_execution_already_attempted");
    const estimate = obj(
      await http(`/api/tabular/reviews/${reviewId}/estimate?model=${encodeURIComponent(model)}`)
    );
    if (!(typeof estimate.costUsd === "number" && estimate.costUsd >= 0))
      throw new Error("priced_model_estimate_required");
    estimates.push(estimate);
  }
  const conservativeEstimatedUsd = estimates.reduce(
    (total, estimate) => total + Number(estimate.costUsd),
    0
  );
  if (conservativeEstimatedUsd > maxCostUsd)
    throw new Error("conservative_estimate_exceeds_explicit_budget");
  // These are the existing per-cell estimates, deliberately conservative for one row call.
  state.conservativePerCellEstimates = estimates;
  state.conservativeEstimatedUsd = conservativeEstimatedUsd;
  state.model = model;
  state.controlsAtExecution = controls;
  state.status = "running";
  state.maxCalls = maxCalls;
  state.maxCostUsd = maxCostUsd;
  save(statePath, state);
  let technicalFailures = 0;
  for (const scenario of preparedScenarios) {
    const scenarioId = scenario.id;
    if (typeof scenarioId !== "string" || !scenarios.some((known) => known.id === scenarioId))
      throw new Error("unknown_scenario");
    const reviewId = uuid(scenario.reviewId),
      matterId = uuid(state.matterId);
    state.attemptedCalls = Number(state.attemptedCalls) + 1;
    state.activeScenario = scenarioId;
    save(statePath, state);
    try {
      const capturedReview = sanitizeReview(
        await http(
          `/api/tabular/reviews/${reviewId}/run-doc`,
          "POST",
          { documentId: uuid(state.documentId), model },
          210000
        )
      );
      const observation = { origin: "live_provider", scenarioId, capturedReview };
      const score = scoreObservation(observation);
      save(resolve(runDir, `${scenarioId}-observation.json`), observation);
      save(resolve(runDir, `${scenarioId}-score.json`), score);
      save(
        resolve(runDir, `${scenarioId}-history.json`),
        sanitizeHistory(await http(`/api/tabular/reviews/${reviewId}/history`))
      );
      save(
        resolve(runDir, `${scenarioId}-completion.json`),
        await http(`/api/tabular/reviews/${reviewId}/completion`)
      );
      save(resolve(runDir, "matter-usage.json"), await http(`/api/matters/${matterId}/usage`));
      if (!score.technicalChecksPassed) technicalFailures++;
      state.completedScenarios = [
        ...(Array.isArray(state.completedScenarios) ? state.completedScenarios : []),
        scenarioId,
      ];
      save(statePath, state);
      console.log(
        JSON.stringify({
          scenarioId,
          observation: "local_http_provider_response",
          technicalChecksPassed: score.technicalChecksPassed,
          legalQualitySignoff: "not_established",
        })
      );
      if (!score.technicalChecksPassed) {
        state.status = "halted_quality";
        state.technicalFailures = technicalFailures;
        save(statePath, state);
        console.log(
          JSON.stringify({
            status: "halted_on_first_strict_score_failure",
            plannedRowCallsAttempted: state.attemptedCalls,
            providerRetryDispatched: false,
            legalQualitySignoff: "not_established",
          })
        );
        process.exitCode = 1;
        return;
      }
    } catch (error) {
      state.status = "halted";
      state.failure = safeFailure(error);
      save(statePath, state);
      // Preserve safe ledger metadata without ever retrying an uncertain paid row.
      try {
        save(resolve(runDir, "controls-after-halt.json"), await http("/api/admin/job-controls"));
        save(resolve(runDir, "matter-usage.json"), await http(`/api/matters/${matterId}/usage`));
      } catch {
        /* no additional execution */
      }
      throw error;
    }
  }
  state.status = "complete";
  state.technicalFailures = technicalFailures;
  state.legalQualitySignoff = "not_established";
  state.finishedAt = new Date().toISOString();
  save(statePath, state);
  console.log(
    JSON.stringify({
      status: "complete",
      plannedRowCallsAttempted: state.attemptedCalls,
      technicalFailures,
      runDir,
      legalQualitySignoff: "not_established",
    })
  );
  if (technicalFailures) process.exitCode = 1;
}

function lstatExists(path: string) {
  try {
    lstatSync(path);
    return true;
  } catch {
    return false;
  }
}
function sanitizeReview(value: unknown) {
  const captured = obj(value),
    review = obj(captured.review);
  return {
    review: {
      id: review.id,
      matterId: review.matterId,
      headCommitId: review.headCommitId,
      inputSnapshot: review.inputSnapshot,
    },
    cells: rows(captured.cells).map((cell) => ({
      id: cell.id,
      documentId: cell.documentId,
      columnIndex: cell.columnIndex,
      content: cell.content,
      citations: cell.citations,
      finding: cell.finding,
      status: cell.status,
      lastCommitId: cell.lastCommitId,
    })),
  };
}
function sanitizeHistory(value: unknown) {
  return rows(value).map((commit) =>
    Object.fromEntries(
      Object.entries(commit).filter(([key]) => key !== "actorName" && key !== "actorEmail")
    )
  );
}
function safeFailure(error: unknown) {
  return error instanceof HttpFailure
    ? { operation: error.operation, httpStatus: error.status, classification: error.classification }
    : {
        classification:
          error instanceof Error && /^[a-z_]+$/.test(error.message)
            ? error.message
            : "local_runner_failed_details_withheld",
      };
}
main().catch((error) => {
  console.error(
    JSON.stringify({
      status: "failed",
      ...safeFailure(error),
      retry:
        "No automatic retries. Inspect private run state and current usage before a separately authorized attempt.",
    })
  );
  process.exitCode = 1;
});
