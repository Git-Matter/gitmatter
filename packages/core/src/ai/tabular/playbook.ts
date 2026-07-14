import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { type PlaybookRule, type TabularColumn, workflows } from "@workspace/db/schema";
import type { Actor } from "../../core/commit.js";
import { resolveClause } from "../../content/clauses.js";
import { completeText } from "../provider/index.js";
import { stripJsonFence } from "./extract.js";
import { createReview } from "./reviews.js";

// Playbook execution rides the tabular engine: each rule becomes a review
// column whose prompt asks for a compliance verdict, so the existing
// green/grey/yellow/red cell flags ARE the verdict (acceptable / needs review /
// unacceptable) and every result is a commit with citations. No new engine.

/** Render one rule as a column extraction prompt. Clause-library fallbacks are
 *  resolved to their current text at run time, so the review always negotiates
 *  from the library's live language. */
export async function rulePrompt(
  rule: PlaybookRule,
  context: { tenantId: string | null; matterId?: string | null } | string | null
): Promise<string> {
  const resolvedContext =
    context && typeof context === "object"
      ? context
      : { tenantId: typeof context === "string" ? context : null, matterId: null };
  let standardPosition = rule.standardPosition;
  let standardSource = "written playbook standard";
  if (rule.standardClauseId) {
    if (!resolvedContext.tenantId) throw new Error("Playbook has no firm library");
    const resolved = await resolveClause(resolvedContext.tenantId, rule.standardClauseId, {
      matterId: resolvedContext.matterId,
    });
    if (!resolved) throw new Error("Playbook references a missing or unavailable approved clause");
    standardPosition = resolved.body;
    standardSource = `${resolved.appliedScope} library clause "${resolved.title}" (id: ${resolved.id})`;
  }
  const fallbacks: string[] = [];
  for (const [i, fb] of (rule.fallbacks ?? []).entries()) {
    if (typeof fb === "string") fallbacks.push(`${i + 1}. ${fb}`);
    else {
      if (!resolvedContext.tenantId) throw new Error("Playbook has no firm library");
      const resolved = await resolveClause(resolvedContext.tenantId, fb.clauseId, {
        matterId: resolvedContext.matterId,
      });
      if (!resolved)
        throw new Error("Playbook references a missing or unavailable approved clause");
      fallbacks.push(
        `${i + 1}. ${resolved.body} (${resolved.appliedScope} library clause "${resolved.title}")`
      );
    }
  }
  return [
    `You are reviewing this document against the firm's playbook rule for "${rule.clauseType}".`,
    ``,
    `Applied standard (${standardSource}): ${standardPosition}`,
    fallbacks.length
      ? `Acceptable fallback positions, in order of preference:\n${fallbacks.join("\n")}`
      : "",
    rule.unacceptable ? `Unacceptable (red line): ${rule.unacceptable}` : "",
    rule.guidance ? `Guidance: ${rule.guidance}` : "",
    ``,
    `Find the clause(s) in the document addressing this. Verdict:`,
    `- flag green if the language matches our standard position or better,`,
    `- flag yellow if it matches a listed fallback or needs lawyer review,`,
    `- flag ${rule.severity === "red" ? "red" : "yellow"} if it crosses the red line or the clause is missing entirely.`,
    `Quote the operative language in your citations and say which position (standard / fallback N / non-compliant / absent) it matches.`,
  ]
    .filter(Boolean)
    .join("\n");
}

/** Rules -> review columns (verdict flag + quoted language per rule). */
export async function playbookColumns(
  rules: PlaybookRule[],
  context: { tenantId: string | null; matterId?: string | null } | string | null
): Promise<TabularColumn[]> {
  return Promise.all(
    rules.map(async (rule, index) => ({
      index,
      name: rule.clauseType,
      prompt: await rulePrompt(rule, context),
    }))
  );
}

/**
 * Materialize a playbook run: a tabular review over the given documents with
 * one column per rule, linked back via workflowId. Returns the reviewId — run
 * it with the existing runners (run-all stream in the UI, run_cell/runDocument
 * over MCP).
 */
export async function runPlaybook(
  actor: Actor,
  params: { playbookId: string; documentIds: string[]; matterId: string }
): Promise<{ reviewId: string; ruleCount: number }> {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, params.playbookId));
  if (!wf || wf.type !== "playbook") throw new Error("Playbook not found");
  if (wf.status === "deprecated") throw new Error("Playbook is deprecated");
  if (wf.status !== "approved") throw new Error("Playbook must be approved before it can run");
  const rules = wf.rules ?? [];
  if (!rules.length) throw new Error("Playbook has no rules");
  if (!params.documentIds.length) throw new Error("No documents given");

  const reviewId = await createReview(actor, {
    title: `${wf.title} — playbook review`,
    columnsConfig: await playbookColumns(rules, {
      tenantId: wf.tenantId,
      matterId: params.matterId,
    }),
    documentIds: params.documentIds,
    workflowId: wf.id,
    matterId: params.matterId,
  });
  return { reviewId, ruleCount: rules.length };
}

const RULES_SCHEMA = {
  type: "object",
  properties: {
    rules: {
      type: "array",
      items: {
        type: "object",
        properties: {
          clauseType: { type: "string" },
          standardPosition: { type: "string" },
          fallbacks: { type: "array", items: { type: "string" } },
          unacceptable: { type: "string" },
          guidance: { type: "string" },
          severity: { type: "string", enum: ["red", "yellow"] },
        },
        required: ["clauseType", "standardPosition", "severity"],
      },
    },
  },
  required: ["rules"],
} as const;

/**
 * Draft playbook rules from a document — the "from standard paper / convert an
 * existing guide" authoring flows. One structured pass; the lawyer edits the
 * result, they don't fill in a blank form.
 */
export async function generatePlaybookRules(params: {
  documentText: string;
  filename: string;
  contractType?: string;
  model?: string;
  apiKey?: string | null;
  onUsage?: Parameters<typeof completeText>[0]["onUsage"];
}): Promise<PlaybookRule[]> {
  const raw = await completeText({
    model: params.model,
    systemPrompt: [
      `You convert legal documents into contract-review playbook rules.`,
      `The document is either the firm's own template (extract its positions as the standard), or a written negotiation guide (convert its guidance into rules).`,
      `Write one self-contained rule per clause type${params.contractType ? ` for a ${params.contractType}` : ""}. For each: the standard position (one or two sentences of substance, not a quote dump), ordered fallbacks if the document implies any, the unacceptable red line if apparent, short guidance on why/when, and severity ("red" for deal-blocking clause types like liability and indemnity, "yellow" otherwise).`,
      `Cover only what the document supports — do not invent positions. At most 25 rules.`,
    ].join("\n"),
    user: `Document: ${params.filename}\n\n${params.documentText}`,
    maxTokens: 4096,
    apiKey: params.apiKey,
    temperature: 0,
    jsonSchema: RULES_SCHEMA as unknown as Record<string, unknown>,
    onUsage: params.onUsage,
  });
  let parsed: { rules?: Array<Omit<PlaybookRule, "id">> };
  try {
    parsed = JSON.parse(stripJsonFence(raw)) as typeof parsed;
  } catch {
    throw new Error("Rule generation returned malformed JSON");
  }
  return (parsed.rules ?? []).slice(0, 25).map((r) => ({
    ...r,
    id: randomUUID(),
    severity: r.severity === "red" ? "red" : "yellow",
  }));
}
