import { type ProviderId, providersFor } from "@workspace/registry";
import { type Actor, getUserTenant, hasMatterAccess, logEvent } from "../core/index.js";
import { ensureDefaultMatter } from "../platform/index.js";
import { buildAuditTools } from "./audit.js";
import { buildClauseTools } from "./clauses.js";
import { buildDiscoveryTools } from "./discovery.js";
import { buildDocumentTools } from "./documents.js";
import { buildMatterTools } from "./matters.js";
import { buildResearchTools } from "./research.js";
import { buildReviewTools } from "./reviews.js";
import type { ToolContext, ToolSpec } from "./types.js";
import { buildWorkflowTools } from "./workflows.js";

export type { ToolSpec } from "./types.js";

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function arrayCount(value: unknown): number | undefined {
  return Array.isArray(value) ? value.length : undefined;
}

function idKind(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  return value.includes(":") ? value.split(":")[0] : undefined;
}

export function summarizeToolInput(tool: string, input: Record<string, unknown>) {
  switch (tool) {
    case "generate_docx":
      return {
        blockCount: arrayCount(input.blocks) ?? 0,
        matterProvided: typeof input.matterId === "string",
      };
    case "get_document":
      return { documentId: input.documentId };
    case "propose_document_edit":
      return {
        documentId: input.documentId,
        editCount: arrayCount(input.edits) ?? 0,
      };
    case "resolve_document_edit":
      return {
        documentId: input.documentId,
        changeId: input.changeId,
        decision: input.decision,
      };
    case "create_review":
      return {
        documentCount: arrayCount(input.documentIds) ?? 0,
        columnCount: arrayCount(input.columns) ?? 0,
        matterProvided: typeof input.matterId === "string",
      };
    case "read_review_cells":
      return {
        reviewId: input.reviewId,
        columnCount: arrayCount(input.columnIndices),
        documentCount: arrayCount(input.documentIds),
      };
    case "run_cell":
      return {
        reviewId: input.reviewId,
        documentId: input.documentId,
        columnIndex: input.columnIndex,
        model: input.model,
      };
    case "write_cell":
      return {
        reviewId: input.reviewId,
        documentId: input.documentId,
        columnIndex: input.columnIndex,
        citationCount: arrayCount(input.citations) ?? 0,
      };
    case "search":
      return { queryLength: typeof input.query === "string" ? input.query.length : undefined };
    case "fetch":
      return { idKind: idKind(input.id) };
    default:
      return { keys: Object.keys(input) };
  }
}

export function summarizeToolOutput(tool: string, output: unknown) {
  const obj = asRecord(output);
  if (Array.isArray(output)) return { resultType: "array", count: output.length };
  if (!output || typeof output !== "object") return { resultType: typeof output };

  switch (tool) {
    case "generate_docx":
      return { documentId: obj.documentId };
    case "propose_document_edit":
      return {
        changeCount: arrayCount(obj.changeIds) ?? 0,
        requested: obj.requested,
        applied: obj.applied,
        failed: obj.failed,
        errorCount: arrayCount(obj.errors) ?? 0,
      };
    case "resolve_document_edit":
      return { committed: obj.committed };
    case "create_review":
      return { reviewId: obj.reviewId };
    case "read_review_cells":
      return { reviewId: obj.reviewId, cellCount: arrayCount(obj.cells) ?? 0 };
    case "run_cell":
    case "write_cell":
      return { committed: obj.committed, changeCount: arrayCount(obj.changes) };
    case "search":
      return { resultCount: arrayCount(obj.results) ?? 0 };
    case "fetch":
      return { idKind: idKind(obj.id), metadataType: asRecord(obj.metadata).type };
    default:
      return { resultType: "object", keys: Object.keys(obj).slice(0, 12) };
  }
}

// Wrap a tool handler so every call emits a start + finish log line (greppable
// JSON, same shape as the request log). Used at both call sites — MCP and chat —
// via the catalog, so neither can skip it. We log input *keys* only, never values,
// to keep legal content/PII out of logs. Handlers return `{ error }` on failure
// rather than throwing, so the finish line inspects the result for that.
function withToolLogging(spec: ToolSpec, actor: Actor): ToolSpec {
  const source = actor.type === "agent" ? actor.agentLabel : actor.type;
  const base = { tool: spec.name, source, userId: actor.userId };
  return {
    ...spec,
    handler: async (input) => {
      logEvent("info", "tool_call.start", {
        ...base,
        keys: Object.keys(input),
        inputSummary: summarizeToolInput(spec.name, input),
      });
      const started = performance.now();
      try {
        const result = await spec.handler(input);
        const ms = Math.round(performance.now() - started);
        const err =
          result && typeof result === "object" && "error" in result
            ? String((result as { error: unknown }).error).slice(0, 300)
            : null;
        logEvent(err ? "warn" : "info", "tool_call.finish", {
          ...base,
          ms,
          ok: !err,
          outputSummary: summarizeToolOutput(spec.name, result),
          ...(err ? { error: err } : {}),
        });
        return result;
      } catch (e) {
        const ms = Math.round(performance.now() - started);
        logEvent("error", "tool_call.finish", {
          ...base,
          ms,
          ok: false,
          error: e instanceof Error ? e.message : "failed",
        });
        throw e;
      }
    },
  };
}

/**
 * The gitmatter tool catalog, bound to one acting user. Every tool runs as that
 * user (attributed as an agent) and enforces the same per-artifact access checks
 * regardless of whether it's reached over MCP or from the in-app assistant.
 *
 * Tools live in per-domain modules (reviews, documents, workflows, audit,
 * matters, discovery, research); this assembler builds the shared context and
 * concatenates them, gating the research tools by jurisdiction.
 */
export function buildToolCatalog(
  actor: Actor,
  opts: { jurisdiction: string; defaultMatterLabel: string; sourceIds?: ProviderId[] }
): ToolSpec[] {
  const allowedSourceIds = opts.sourceIds ? new Set(opts.sourceIds) : null;
  const providerIds = new Set<ProviderId>(
    providersFor(opts.jurisdiction)
      .filter((p) => !allowedSourceIds || allowedSourceIds.has(p.id))
      .map((p) => p.id)
  );

  // Resolve the matter a new artifact lands in: an explicit (editor-checked)
  // matterId, or the acting user's default matter. Returns null when forbidden.
  const scope = actor.type === "agent" ? (actor.scope ?? null) : null;
  const resolveMatter = async (matterId?: string): Promise<string | null> => {
    if (matterId) {
      return (await hasMatterAccess(actor, matterId, "editor")) ? matterId : null;
    }
    // A scoped token gets no implicit default matter: a matter-restricted token
    // must name one of its matters, and a viewer-capped token cannot create.
    if (scope?.matterIds) return null;
    if (scope?.maxRole === "viewer") return null;
    const tenantId = await getUserTenant(actor.userId);
    if (!tenantId) return null;
    return ensureDefaultMatter(actor.userId, opts.defaultMatterLabel, tenantId);
  };

  const ctx: ToolContext = { actor, resolveMatter };

  return [
    ...buildReviewTools(ctx),
    ...buildAuditTools(ctx),
    ...buildMatterTools(ctx),
    ...buildDocumentTools(ctx),
    ...buildDiscoveryTools(ctx),
    ...buildWorkflowTools(ctx),
    ...buildClauseTools(ctx),
    ...buildResearchTools(ctx, providerIds),
  ].map((t) => withToolLogging(t, actor));
}
