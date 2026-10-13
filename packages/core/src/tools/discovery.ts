import { db } from "@workspace/db/client";
import { clauses, matters, tabularCells, workflows } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canReadApprovedLibrary } from "../core/library-access.js";
import { hasMatterAccess, canReadDocument, hasClientAccess } from "../core/access.js";
import { searchMatterWork } from "../core/search.js";
import { z } from "zod";
import { canAccessArtifact } from "../core/index.js";
import { getReview } from "../ai/index.js";
import { getDocument } from "../content/index.js";
import type { ToolContext, ToolSpec } from "./types.js";

// Cross-artifact discovery (the ChatGPT company-knowledge schema): `search`
// finds reviews and documents by keyword and returns ids; `fetch` returns the
// full content of one result by its id.
export function buildDiscoveryTools({ actor }: ToolContext): ToolSpec[] {
  // Search lists by ownership, not through the artifact guard — so a scoped
  // token must filter here too, or it leaks out-of-scope titles.
  return [
    {
      name: "search",
      readOnly: true,
      description:
        "Search authorized document text, saved review values, clauses, playbooks and matter metadata. Ranked snippets and exact links; no hidden-matter counts.",
      schema: {
        query: z.string(),
        matterId: z.uuid().optional(),
        type: z.enum(["document", "cell", "clause", "playbook", "matter"]).optional(),
        page: z.number().int().nonnegative().optional(),
      },
      handler: async ({ query, matterId, type, page }) => {
        const result = await searchMatterWork(actor, {
          query: query as string,
          matterId: matterId as string | undefined,
          type: type as "document" | "cell" | "clause" | "playbook" | "matter" | undefined,
          page: page as number | undefined,
        });
        return {
          results: result.results.map((r) => ({
            ...r,
            id: `${r.type}:${r.id}${typeof matterId === "string" ? `:${matterId}` : ""}`,
          })),
          rowCount: result.rowCount,
        };
      },
    },
    {
      name: "fetch",
      readOnly: true,
      description:
        "Fetch the authorized content of a search result by its complete id, including any matter-context suffix.",
      schema: { id: z.string() },
      handler: async ({ id }) => {
        const [kind, artifactId, contextMatterId] = (id as string).split(":");
        if (!artifactId) return { error: "Not found" };
        if (kind === "review") {
          if (!(await canAccessArtifact(actor, "tabular_review", artifactId)))
            return { error: "Not found" };
          const r = await getReview(artifactId);
          if (!r) return { error: "Not found" };
          return {
            id,
            title: r.review.title,
            text: JSON.stringify(r, null, 2),
            url: `/reviews/${artifactId}`,
            metadata: { type: "tabular_review" },
          };
        }
        if (kind === "document") {
          if (!(await canReadDocument(actor, artifactId))) return { error: "Not found" };
          const d = await getDocument(artifactId);
          if (!d) return { error: "Not found" };
          return {
            id,
            title: d.title,
            text: d.markdown ?? "",
            url: `/documents/${artifactId}`,
            metadata: { type: "document", status: d.status },
          };
        }
        if (kind === "cell") {
          const [cell] = await db
            .select()
            .from(tabularCells)
            .where(eq(tabularCells.id, artifactId));
          if (!cell || !(await canAccessArtifact(actor, "tabular_review", cell.reviewId)))
            return { error: "Not found" };
          return {
            id,
            title: "Review finding",
            text: JSON.stringify({
              content: cell.content,
              citations: cell.citations,
              finding: cell.finding,
              disposition: cell.disposition,
            }),
            url: `/reviews/${cell.reviewId}?finding=${cell.id}`,
            metadata: { type: "cell" },
          };
        }
        if (kind === "clause") {
          const [clause] = await db.select().from(clauses).where(eq(clauses.id, artifactId));
          const allowed = contextMatterId
            ? await canReadApprovedLibrary(actor, "clause", artifactId, contextMatterId)
            : await canAccessArtifact(actor, "clause", artifactId);
          if (
            !clause ||
            !allowed ||
            (clause.clientId && !(await hasClientAccess(actor, clause.clientId)))
          )
            return { error: "Not found" };
          return {
            id,
            title: clause.title,
            text: clause.body,
            url: `/library?clause=${clause.id}`,
            metadata: { type: "clause", revision: clause.headCommitId, status: clause.status },
          };
        }
        if (kind === "playbook") {
          const [workflow] = await db.select().from(workflows).where(eq(workflows.id, artifactId));
          const allowed = contextMatterId
            ? await canReadApprovedLibrary(actor, "workflow", artifactId, contextMatterId)
            : workflow?.isSystem && workflow.status === "approved"
              ? actor.type !== "agent" || !actor.scope?.matterIds
              : await canAccessArtifact(actor, "workflow", artifactId);
          if (!workflow || !allowed) return { error: "Not found" };
          return {
            id,
            title: workflow.title,
            text: JSON.stringify(workflow.rules),
            url: `/workflows/tabular-review/${workflow.id}`,
            metadata: { type: "playbook", revision: workflow.headCommitId },
          };
        }
        if (kind === "matter") {
          if (!(await hasMatterAccess(actor, artifactId))) return { error: "Not found" };
          const [matter] = await db.select().from(matters).where(eq(matters.id, artifactId));
          if (!matter) return { error: "Not found" };
          return {
            id,
            title: matter.name,
            text: JSON.stringify({
              name: matter.name,
              practiceArea: matter.practiceArea,
              jurisdiction: matter.jurisdiction,
              status: matter.status,
            }),
            url: `/matters/${matter.id}`,
            metadata: { type: "matter" },
          };
        }
        return { error: "Not found" };
      },
    },
  ];
}
