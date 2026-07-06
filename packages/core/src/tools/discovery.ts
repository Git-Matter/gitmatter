import { z } from "zod";
import { canAccessArtifact, scopeAllowsMatter } from "../core/index.js";
import { getReview, listReviews } from "../ai/index.js";
import { getDocument, getDocumentContext, listDocuments } from "../content/index.js";
import type { ToolContext, ToolSpec } from "./types.js";

// Cross-artifact discovery (the ChatGPT company-knowledge schema): `search`
// finds reviews and documents by keyword and returns ids; `fetch` returns the
// full content of one result by its id.
export function buildDiscoveryTools({ actor }: ToolContext): ToolSpec[] {
  // Search lists by ownership, not through the artifact guard — so a scoped
  // token must filter here too, or it leaks out-of-scope titles.
  const scope = actor.type === "agent" ? (actor.scope ?? null) : null;
  return [
    {
      name: "search",
      description: "Search your reviews and documents by keyword. Returns ids to pass to `fetch`.",
      schema: { query: z.string() },
      handler: async ({ query }) => {
        const ql = (query as string).toLowerCase();
        const hit = (title: string) => title.toLowerCase().includes(ql);
        const [reviews, docs] = await Promise.all([
          listReviews(actor.userId),
          listDocuments(actor.userId),
        ]);
        const results = [
          ...reviews
            .filter((r) => hit(r.title) && scopeAllowsMatter(scope, r.matterId))
            .map((r) => ({
              id: `review:${r.id}`,
              title: r.title,
              url: `/reviews/${r.id}`,
            })),
          ...docs
            .filter((d) => hit(d.title) && scopeAllowsMatter(scope, d.matterId))
            .map((d) => ({
              id: `document:${d.id}`,
              title: d.title,
              url: `/documents/${d.id}`,
            })),
        ];
        return { results };
      },
    },
    {
      name: "fetch",
      description: "Fetch the full content of a search result by its id.",
      schema: { id: z.string() },
      handler: async ({ id }) => {
        const [kind, artifactId] = (id as string).split(":");
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
          if (!(await canAccessArtifact(actor, "document", artifactId)))
            return { error: "Not found" };
          const d = await getDocument(artifactId);
          if (!d) return { error: "Not found" };
          // `fetch` means "give me the content": small docs return full text,
          // large docs return bounded chunks + refs (page more via get_document).
          const context = await getDocumentContext(d, { mode: "auto", task: "chat" });
          return {
            id,
            title: d.title,
            text: context.text,
            url: `/documents/${artifactId}`,
            metadata: {
              type: "document",
              status: d.status,
              contextMode: context.mode,
              contextPipeline: context.pipeline,
              chunks: context.chunks.map((c) => c.ref),
            },
          };
        }
        return { error: "Not found" };
      },
    },
  ];
}
