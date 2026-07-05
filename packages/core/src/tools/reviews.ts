import { z } from "zod";
import { canAccessArtifact } from "../core/index.js";
import { createReview, getReview, listReviews, runCell, writeCell } from "../ai/index.js";
import { listMatterDocuments } from "../content/index.js";
import type { ToolContext, ToolSpec } from "./types.js";

// Tabular review tools: list/read reviews and their cells, create reviews, and
// run or hand-write a single cell (each cell write is a commit).
export function buildReviewTools({ actor, resolveMatter }: ToolContext): ToolSpec[] {
  return [
    {
      name: "list_reviews",
      description: "List the user's tabular reviews.",
      schema: {},
      handler: async () => {
        const rows = await listReviews(actor.userId);
        return rows.map((r) => ({
          id: r.id,
          title: r.title,
          documentIds: r.documentIds,
        }));
      },
    },
    {
      name: "get_review",
      description:
        "Get a tabular review's columns, cells, and per-cell blame (who last set each cell).",
      schema: { reviewId: z.string() },
      handler: async ({ reviewId }) => {
        const result = await getReview(reviewId as string);
        if (!result || !(await canAccessArtifact(actor, "tabular_review", reviewId as string)))
          return { error: "Not found" };
        return result;
      },
    },
    {
      name: "read_review_cells",
      description:
        "Read specific cells of a tabular review, filtered by column indices and/or document ids. Returns each cell's extracted value, flag, reasoning, and grounding citations with column + document names. Prefer this over get_review when answering a focused question (e.g. why a cell is flagged, what one column found) instead of dumping the whole grid.",
      schema: {
        reviewId: z.string(),
        columnIndices: z.array(z.number()).optional(),
        documentIds: z.array(z.string()).optional(),
      },
      handler: async ({ reviewId, columnIndices, documentIds }) => {
        if (!(await canAccessArtifact(actor, "tabular_review", reviewId as string)))
          return { error: "Not found" };
        const result = await getReview(reviewId as string);
        if (!result) return { error: "Not found" };
        const cols = columnIndices as number[] | undefined;
        const docs = documentIds as string[] | undefined;
        const colSet = cols?.length ? new Set(cols) : null;
        const docSet = docs?.length ? new Set(docs) : null;
        const colName = new Map(result.review.columnsConfig.map((col) => [col.index, col.name]));
        const title = new Map(
          (await listMatterDocuments(result.review.matterId)).map((d) => [d.id, d.title])
        );
        const cells = result.cells
          .filter(
            (cell) =>
              cell.content &&
              (!colSet || colSet.has(cell.columnIndex)) &&
              (!docSet || docSet.has(cell.documentId))
          )
          .map((cell) => ({
            columnIndex: cell.columnIndex,
            column: colName.get(cell.columnIndex) ?? `Column ${cell.columnIndex}`,
            documentId: cell.documentId,
            document: title.get(cell.documentId) ?? cell.documentId,
            summary: cell.content!.summary,
            flag: cell.content!.flag,
            reasoning: cell.content!.reasoning,
            citations: cell.citations ?? [],
          }));
        return { reviewId, cells };
      },
    },
    {
      name: "create_review",
      description: "Create a tabular review over documents with extraction columns.",
      schema: {
        title: z.string(),
        documentIds: z.array(z.string()),
        columns: z.array(
          z.object({
            name: z.string(),
            prompt: z.string(),
            format: z.string().optional(),
            tags: z.array(z.string()).optional(),
          })
        ),
        matterId: z.string().optional(),
      },
      handler: async ({ title, documentIds, columns, matterId }) => {
        const resolved = await resolveMatter(matterId as string | undefined);
        if (!resolved) return { error: "Forbidden: no access to that matter" };
        const reviewId = await createReview(actor, {
          title: title as string,
          documentIds: documentIds as string[],
          columnsConfig: (
            columns as Array<{
              name: string;
              prompt: string;
              format?: string;
              tags?: string[];
            }>
          ).map((c, i) => ({
            index: i,
            name: c.name,
            prompt: c.prompt,
            format: c.format,
            tags: c.tags,
          })),
          matterId: resolved,
        });
        return { reviewId };
      },
    },
    {
      name: "run_cell",
      description: "Extract (or re-extract) one cell with the chosen model and commit the change.",
      schema: {
        reviewId: z.string(),
        documentId: z.string(),
        columnIndex: z.number(),
        model: z.string().optional(),
      },
      handler: async ({ reviewId, documentId, columnIndex, model }) => {
        if (!(await canAccessArtifact(actor, "tabular_review", reviewId as string, "editor")))
          return { error: "Not found" };
        try {
          const result = await runCell(actor, {
            reviewId: reviewId as string,
            documentId: documentId as string,
            columnIndex: columnIndex as number,
            model: model as string | undefined,
          });
          return { committed: result.commit?.seq, changes: result.changes };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: "write_cell",
      description:
        "Write your own extracted value into one review cell — for when you have read the document yourself and produced the answer. Committed under your name. Use run_cell instead to have gitmatter run its own model. flag is the RAG status: green=ok, yellow=caution, red=problem, grey=n/a.",
      schema: {
        reviewId: z.string(),
        documentId: z.string(),
        columnIndex: z.number(),
        summary: z.string(),
        flag: z.enum(["green", "yellow", "red", "grey"]),
        reasoning: z.string(),
        citations: z.array(z.object({ page: z.number().optional(), quote: z.string() })).optional(),
      },
      handler: async ({
        reviewId,
        documentId,
        columnIndex,
        summary,
        flag,
        reasoning,
        citations,
      }) => {
        if (!(await canAccessArtifact(actor, "tabular_review", reviewId as string, "editor")))
          return { error: "Not found" };
        try {
          const result = await writeCell(actor, {
            reviewId: reviewId as string,
            documentId: documentId as string,
            columnIndex: columnIndex as number,
            summary: summary as string,
            flag: flag as string,
            reasoning: reasoning as string,
            citations: citations as { page?: number; quote: string }[] | undefined,
          });
          return { committed: result.commit?.seq, changes: result.changes };
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
