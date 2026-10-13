import { canReadApprovedLibrary } from "../../core/library-access.js";
import { createHash, randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import type { ContractReviewSnapshot, ReviewRuleSnapshot } from "@workspace/contracts";
import {
  type PlaybookRule,
  type TabularColumn,
  documents,
  matterDocuments,
  tabularReviews,
  workflows,
} from "@workspace/db/schema";
import type { Actor } from "../../core/commit.js";
import { canAccessArtifact, canReadDocument, hasMatterAccess } from "../../core/access.js";
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
    `Return outcome: conforms, deviates, not_found (only after searching the prepared document), or inconclusive. Absence has no quotation; do not fabricate one.`,
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
  params: { playbookId: string; documentIds: string[]; matterId: string; requestId?: string }
): Promise<{ reviewId: string; ruleCount: number }> {
  if (!(await hasMatterAccess(actor, params.matterId, "editor"))) throw new Error("access_denied");
  const documentIds = [...new Set(params.documentIds)];
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({ playbookId: params.playbookId, matterId: params.matterId, documentIds })
    )
    .digest("hex");
  const requestKey = params.requestId
    ? createHash("sha256")
        .update(JSON.stringify({ actor, requestId: params.requestId, command: "run_playbook" }))
        .digest("hex")
    : undefined;
  if (requestKey) {
    const [prior] = await db
      .select()
      .from(tabularReviews)
      .where(eq(tabularReviews.requestKey, requestKey));
    if (prior) {
      if (prior.requestFingerprint !== fingerprint) throw new Error("request_conflict");
      if (!(await canAccessArtifact(actor, "tabular_review", prior.id)))
        throw new Error("access_denied");
      return { reviewId: prior.id, ruleCount: prior.columnsConfig.length };
    }
  }
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, params.playbookId));
  if (
    !wf ||
    wf.type !== "playbook" ||
    (!(await canReadApprovedLibrary(actor, "workflow", wf.id, params.matterId)) &&
      !(await canAccessArtifact(actor, "workflow", wf.id)))
  )
    throw new Error("Playbook not found");
  if (wf.status === "deprecated") throw new Error("Playbook is deprecated");
  if (wf.status !== "approved") throw new Error("Playbook must be approved before it can run");
  const rules = wf.rules ?? [];
  if (!rules.length) throw new Error("Playbook has no rules");
  if (!documentIds.length) throw new Error("No documents given");
  const sources: ContractReviewSnapshot["documents"] = [];
  for (const id of documentIds) {
    if (!(await canReadDocument(actor, id))) throw new Error("access_denied");
    const [link] = await db
      .select()
      .from(matterDocuments)
      .where(
        and(eq(matterDocuments.documentId, id), eq(matterDocuments.matterId, params.matterId))
      );
    const [doc] = await db.select().from(documents).where(eq(documents.id, id));
    if (
      !link ||
      !doc ||
      doc.deletedAt ||
      doc.staged ||
      doc.status !== "ready" ||
      !doc.markdown?.trim()
    )
      throw new Error("input_not_ready");
    if (doc.markdown.length > 120000)
      throw new Error(
        "Source exceeds the whole-document review limit; split the document before review"
      );
    sources.push({
      id,
      title: doc.title,
      versionId: doc.currentVersionId,
      headCommitId: doc.headCommitId,
      text: doc.markdown,
    });
  }
  const snapshotRules: ReviewRuleSnapshot[] = [];
  const frozenRules: PlaybookRule[] = [];
  for (const [columnIndex, rule] of rules.entries()) {
    const captured: ReviewRuleSnapshot["clauses"] = [];
    const captureClause = async (id: string) => {
      if (!wf.tenantId) throw new Error("Playbook has no firm library");
      const clause = await resolveClause(wf.tenantId, id, { matterId: params.matterId });
      if (!clause || !(await canReadApprovedLibrary(actor, "clause", clause.id, params.matterId)))
        throw new Error("Approved clause unavailable");
      captured.push({
        id: clause.id,
        title: clause.title,
        body: clause.body,
        revision:
          clause.headCommitId ??
          `seed:${clause.id}:${createHash("sha256").update(clause.body).digest("hex")}`,
      });
      return clause.body;
    };
    const standardPosition = rule.standardClauseId
      ? await captureClause(rule.standardClauseId)
      : rule.standardPosition;
    const fallbacks = [];
    for (const fallback of rule.fallbacks ?? [])
      fallbacks.push(
        typeof fallback === "string" ? fallback : await captureClause(fallback.clauseId)
      );
    frozenRules.push({ ...rule, standardClauseId: undefined, standardPosition, fallbacks });
    snapshotRules.push({
      id: rule.id,
      columnIndex,
      name: rule.clauseType,
      severity: rule.severity,
      standardPosition,
      clauses: captured,
    });
  }
  const inputSnapshot: ContractReviewSnapshot = {
    revision: 1,
    createdAt: new Date().toISOString(),
    playbookId: wf.id,
    playbookRevision:
      wf.headCommitId ??
      `seed:${wf.id}:${createHash("sha256").update(JSON.stringify(rules)).digest("hex")}`,
    rules: snapshotRules,
    documents: sources,
  };
  try {
    const reviewId = await createReview(actor, {
      title: `${wf.title} — playbook review`,
      columnsConfig: await playbookColumns(frozenRules, {
        tenantId: wf.tenantId,
        matterId: params.matterId,
      }),
      documentIds,
      workflowId: wf.id,
      matterId: params.matterId,
      inputSnapshot,
      requestKey,
      requestFingerprint: requestKey ? fingerprint : undefined,
    });
    return { reviewId, ruleCount: rules.length };
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("review_replay:"))
      return { reviewId: error.message.slice("review_replay:".length), ruleCount: rules.length };
    throw error;
  }
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
  spendContext?: Parameters<typeof completeText>[0]["spendContext"];
  documentText: string;
  filename: string;
  contractType?: string;
  model?: string;
  apiKey?: string | null;
  onUsage?: Parameters<typeof completeText>[0]["onUsage"];
}): Promise<PlaybookRule[]> {
  const raw = await completeText({
    spendContext: params.spendContext,
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
