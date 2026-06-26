import { type ProviderId, providersFor } from "@workspace/registry";
import { type Actor, getUserTenant, hasMatterAccess, logEvent } from "../core/index.js";
import { ensureDefaultMatter } from "../platform/index.js";
import { buildAuditTools } from "./audit.js";
import { buildDiscoveryTools } from "./discovery.js";
import { buildDocumentTools } from "./documents.js";
import { buildMatterTools } from "./matters.js";
import { buildResearchTools } from "./research.js";
import { buildReviewTools } from "./reviews.js";
import type { ToolContext, ToolSpec } from "./types.js";
import { buildWorkflowTools } from "./workflows.js";

export type { ToolSpec } from "./types.js";

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
      logEvent("info", "tool_call.start", { ...base, keys: Object.keys(input) });
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
  const resolveMatter = async (matterId?: string): Promise<string | null> => {
    if (matterId) {
      return (await hasMatterAccess(actor.userId, matterId, "editor")) ? matterId : null;
    }
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
    ...buildResearchTools(ctx, providerIds),
  ].map((t) => withToolLogging(t, actor));
}
