import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type CellCitation,
  type CellContent,
  type TabularColumn,
  commits,
  documents,
  matters,
  tabularCells,
  tabularReviews,
} from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";
import { completeText, DEFAULT_MODEL, providerForModel, resolveLlmKey } from "./provider.js";
import { buildCellPrompt, buildRowPrompt, normalizeCell } from "./prompts/tabular.js";

const FLAGS = ["green", "grey", "yellow", "red"] as const;

const CITATIONS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { page: { type: "number" }, quote: { type: "string" } },
    required: ["quote"],
    additionalProperties: false,
  },
} as const;

// Structured-output schema for one extracted cell — lets the provider return clean
// JSON instead of us scraping it out of free text.
const CELL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    flag: { type: "string", enum: FLAGS },
    reasoning: { type: "string" },
    citations: CITATIONS_SCHEMA,
  },
  required: ["summary", "flag", "reasoning"],
  additionalProperties: false,
} as const;

// Batch schema: every column for one document in a single call.
const ROW_SCHEMA = {
  type: "object",
  properties: {
    cells: {
      type: "array",
      items: {
        type: "object",
        properties: {
          column_index: { type: "number" },
          summary: { type: "string" },
          flag: { type: "string", enum: FLAGS },
          reasoning: { type: "string" },
          citations: CITATIONS_SCHEMA,
        },
        required: ["column_index", "summary", "flag", "reasoning"],
        additionalProperties: false,
      },
    },
  },
  required: ["cells"],
  additionalProperties: false,
} as const;

export type CellResult = { content: CellContent; citations: CellCitation[] };

function coerceFlag(flag: unknown): CellContent["flag"] {
  return FLAGS.includes(flag as never) ? (flag as CellContent["flag"]) : "grey";
}

function coerceCitations(raw: unknown): CellCitation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is { page?: unknown; quote?: unknown } => !!c && typeof c === "object")
    .map((c) => ({
      quote: String(c.quote ?? "").trim(),
      ...(typeof c.page === "number" ? { page: c.page } : {}),
    }))
    .filter((c) => c.quote);
}

function stripJsonFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
}

/** Extract a single cell value from a document. Ported from mike's queryTabularCell. */
export async function queryCell(params: {
  model?: string;
  filename: string;
  documentText: string;
  columnPrompt: string;
  format?: string;
  tags?: string[];
  apiKey?: string | null;
}): Promise<CellResult> {
  const { system, user } = buildCellPrompt(params);
  const raw = await completeText({
    model: params.model ?? DEFAULT_MODEL,
    systemPrompt: system,
    user,
    maxTokens: 2048,
    apiKey: params.apiKey,
    // Deterministic, schema-constrained extraction so cell values are reproducible.
    temperature: 0,
    jsonSchema: CELL_SCHEMA as unknown as Record<string, unknown>,
  });
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as {
      summary?: string;
      value?: string;
      flag?: unknown;
      reasoning?: string;
      citations?: unknown;
    };
    return {
      content: normalizeCell(
        {
          summary: String(parsed.summary ?? parsed.value ?? "").trim() || "Not addressed",
          flag: coerceFlag(parsed.flag),
          reasoning: String(parsed.reasoning ?? ""),
        },
        params.format,
        params.tags
      ),
      citations: coerceCitations(parsed.citations),
    };
  } catch {
    return {
      content: {
        summary: raw.trim().slice(0, 500) || "Not addressed",
        flag: "grey",
        reasoning: "",
      },
      citations: [],
    };
  }
}

/**
 * Extract every column for one document in a single LLM call, keyed by column
 * index. One request per row instead of one per cell — the batch path used by
 * runDocument. Missing columns simply don't appear in the returned map.
 */
export async function queryRow(params: {
  model?: string;
  filename: string;
  documentText: string;
  columns: TabularColumn[];
  apiKey?: string | null;
}): Promise<Map<number, CellResult>> {
  const { system, user } = buildRowPrompt(params);
  const raw = await completeText({
    model: params.model ?? DEFAULT_MODEL,
    systemPrompt: system,
    user,
    maxTokens: 4096,
    apiKey: params.apiKey,
    temperature: 0,
    jsonSchema: ROW_SCHEMA as unknown as Record<string, unknown>,
  });
  const out = new Map<number, CellResult>();
  let cells: Array<Record<string, unknown>> = [];
  try {
    cells =
      (JSON.parse(stripJsonFence(raw)) as { cells?: Array<Record<string, unknown>> }).cells ?? [];
  } catch {
    return out;
  }
  for (const cell of cells) {
    const idx = cell.column_index;
    if (typeof idx !== "number") continue;
    const col = params.columns.find((c) => c.index === idx);
    if (!col) continue;
    out.set(idx, {
      content: normalizeCell(
        {
          summary: String(cell.summary ?? "").trim() || "Not addressed",
          flag: coerceFlag(cell.flag),
          reasoning: String(cell.reasoning ?? ""),
        },
        col.format,
        col.tags
      ),
      citations: coerceCitations(cell.citations),
    });
  }
  return out;
}

export async function createReview(
  actor: Actor,
  input: {
    title: string;
    columnsConfig: TabularColumn[];
    documentIds: string[];
    workflowId?: string;
    jurisdiction?: string | null;
    matterId: string;
  }
) {
  const reviewId = randomUUID();
  const [matter] = await db
    .select({ tenantId: matters.tenantId })
    .from(matters)
    .where(eq(matters.id, input.matterId));
  if (!matter) throw new Error("Matter not found");
  await recordCommit({
    artifactType: "tabular_review",
    artifactId: reviewId,
    actor,
    op: "create",
    message: `Created review "${input.title}"`,
    apply: async ({ tx }) => {
      await tx.insert(tabularReviews).values({
        id: reviewId,
        userId: actor.userId,
        tenantId: matter.tenantId,
        matterId: input.matterId,
        createdBy: actor.userId,
        title: input.title,
        columnsConfig: input.columnsConfig,
        documentIds: input.documentIds,
        workflowId: input.workflowId ?? null,
        jurisdiction: input.jurisdiction ?? null,
      });
      const cells = input.documentIds.flatMap((docId) =>
        input.columnsConfig.map((col) => ({
          reviewId,
          documentId: docId,
          columnIndex: col.index,
          status: "pending" as const,
        }))
      );
      if (cells.length) await tx.insert(tabularCells).values(cells);
      return {
        changes: [
          { path: "meta/title", before: null, after: input.title },
          { path: "document_ids", before: null, after: input.documentIds },
          ...input.columnsConfig.map((col) => ({
            path: `column/${col.index}`,
            before: null,
            after: col as unknown,
          })),
        ],
      };
    },
  });
  return reviewId;
}

/**
 * Run (or re-run) one cell: extract with the chosen model, then commit. The
 * model picks the provider; the key is the user's own or the server fallback.
 */
export async function runCell(
  actor: Actor,
  params: {
    reviewId: string;
    documentId: string;
    columnIndex: number;
    model?: string;
  }
) {
  const [review] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, params.reviewId));
  if (!review) throw new Error("Review not found");
  const col = review.columnsConfig.find((c) => c.index === params.columnIndex);
  if (!col) throw new Error("Column not found");

  const [doc] = await db.select().from(documents).where(eq(documents.id, params.documentId));
  if (!doc) throw new Error("Document not found");

  const model = params.model ?? DEFAULT_MODEL;
  const { key } = await resolveLlmKey(actor.userId, providerForModel(model));
  if (!key) throw new Error(`No API key for ${providerForModel(model)}`);

  const { content, citations } = await queryCell({
    model,
    filename: doc.title,
    documentText: doc.markdown ?? "",
    columnPrompt: col.prompt,
    format: col.format,
    tags: col.tags,
    apiKey: key,
  });

  return recordCommit({
    artifactType: "tabular_review",
    artifactId: params.reviewId,
    actor,
    op: "run_cell",
    // Record the model so blame answers "with what" — the model that produced the cell.
    message: `Ran "${col.name}" on ${doc.title} with ${model}`,
    apply: async ({ tx, commitId }) => {
      const [old] = await tx
        .select()
        .from(tabularCells)
        .where(
          and(
            eq(tabularCells.reviewId, params.reviewId),
            eq(tabularCells.documentId, params.documentId),
            eq(tabularCells.columnIndex, params.columnIndex)
          )
        );
      await tx
        .insert(tabularCells)
        .values({
          reviewId: params.reviewId,
          documentId: params.documentId,
          columnIndex: params.columnIndex,
          content,
          citations,
          status: "done",
          createdBy: actor.userId,
          lastCommitId: commitId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [tabularCells.reviewId, tabularCells.documentId, tabularCells.columnIndex],
          set: {
            content,
            citations,
            status: "done",
            createdBy: actor.userId,
            lastCommitId: commitId,
            updatedAt: new Date(),
          },
        });
      return {
        changes: [
          {
            path: `cell/${params.documentId}/${params.columnIndex}`,
            before: old?.content ?? null,
            after: content,
          },
        ],
      };
    },
  });
}

/**
 * Run every column for one document in a single LLM call, then commit all cells
 * in one commit. The batch path: one request per row instead of one per cell.
 */
export async function runDocument(
  actor: Actor,
  params: { reviewId: string; documentId: string; model?: string }
) {
  const [review] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, params.reviewId));
  if (!review) throw new Error("Review not found");
  if (!review.columnsConfig.length) throw new Error("Review has no columns");

  const [doc] = await db.select().from(documents).where(eq(documents.id, params.documentId));
  if (!doc) throw new Error("Document not found");

  const model = params.model ?? DEFAULT_MODEL;
  const { key } = await resolveLlmKey(actor.userId, providerForModel(model));
  if (!key) throw new Error(`No API key for ${providerForModel(model)}`);

  const results = await queryRow({
    model,
    filename: doc.title,
    documentText: doc.markdown ?? "",
    columns: review.columnsConfig,
    apiKey: key,
  });

  return recordCommit({
    artifactType: "tabular_review",
    artifactId: params.reviewId,
    actor,
    op: "run_cell",
    message: `Ran ${results.size} column(s) on ${doc.title} with ${model}`,
    apply: async ({ tx, commitId }) => {
      const existing = await tx
        .select()
        .from(tabularCells)
        .where(
          and(
            eq(tabularCells.reviewId, params.reviewId),
            eq(tabularCells.documentId, params.documentId)
          )
        );
      const oldByIndex = new Map(existing.map((c) => [c.columnIndex, c.content ?? null]));
      const changes: Array<{ path: string; before: unknown; after: unknown }> = [];

      for (const [columnIndex, { content, citations }] of results) {
        await tx
          .insert(tabularCells)
          .values({
            reviewId: params.reviewId,
            documentId: params.documentId,
            columnIndex,
            content,
            citations,
            status: "done",
            createdBy: actor.userId,
            lastCommitId: commitId,
            updatedAt: new Date(),
          })
          .onConflictDoUpdate({
            target: [tabularCells.reviewId, tabularCells.documentId, tabularCells.columnIndex],
            set: {
              content,
              citations,
              status: "done",
              createdBy: actor.userId,
              lastCommitId: commitId,
              updatedAt: new Date(),
            },
          });
        changes.push({
          path: `cell/${params.documentId}/${columnIndex}`,
          before: oldByIndex.get(columnIndex) ?? null,
          after: content,
        });
      }
      return { changes };
    },
  });
}

/**
 * Draft a column extraction prompt from its title (and optional format/tags), so
 * the UI can offer "write this for me". Returns prompt text only — never throws
 * to the caller's flow; on failure it surfaces the provider error.
 */
export async function generateColumnPrompt(params: {
  userId: string;
  title: string;
  format?: string;
  tags?: string[];
  documentName?: string;
  model?: string;
}): Promise<string> {
  const model = params.model ?? DEFAULT_MODEL;
  const { key } = await resolveLlmKey(params.userId, providerForModel(model));
  if (!key) throw new Error(`No API key for ${providerForModel(model)}`);

  const lines = [`Column title: ${params.title}`];
  if (params.documentName) lines.push(`Document type/name: ${params.documentName}`);
  if (params.format) lines.push(`Expected response format: ${params.format}`);
  if (params.tags?.length) lines.push(`Available tags: ${params.tags.join(", ")}`);
  lines.push(
    "",
    "Write the best extraction prompt for a legal tabular review column with this title.",
    "Focus solely on WHAT to extract — never on how to format the response (format handling is applied separately)."
  );

  const raw = await completeText({
    model,
    systemPrompt:
      'You write high-quality column prompts for legal tabular review workflows. Return only valid JSON with a single field: {"prompt": string}. The prompt must focus only on what to extract, never on formatting.',
    user: lines.join("\n"),
    maxTokens: 512,
    apiKey: key,
    temperature: 0,
    jsonSchema: {
      type: "object",
      properties: { prompt: { type: "string" } },
      required: ["prompt"],
      additionalProperties: false,
    },
  });
  const parsed = JSON.parse(stripJsonFence(raw)) as { prompt?: unknown };
  const prompt = typeof parsed.prompt === "string" ? parsed.prompt.trim() : "";
  if (!prompt) throw new Error("LLM returned an empty prompt");
  return prompt;
}

export async function listReviews(userId: string) {
  return db.select().from(tabularReviews).where(eq(tabularReviews.userId, userId));
}

export type ReviewListSort = "title" | "createdAt";

export type ReviewListParams = {
  q?: string;
  page: number;
  pageSize: number;
  sort?: ReviewListSort;
  dir?: "asc" | "desc";
};

export async function listReviewsPage(userId: string, params: ReviewListParams) {
  const q = params.q?.trim();
  const where = and(
    eq(tabularReviews.userId, userId),
    q ? ilike(tabularReviews.title, `%${q}%`) : undefined
  );
  const sortCols = {
    title: tabularReviews.title,
    createdAt: tabularReviews.createdAt,
  };
  const sortCol = sortCols[params.sort ?? "createdAt"];
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const offset = params.page * params.pageSize;

  const [rows, countRows] = await Promise.all([
    db
      .select()
      .from(tabularReviews)
      .where(where)
      .orderBy(order)
      .limit(params.pageSize)
      .offset(offset),
    db.select({ count: count() }).from(tabularReviews).where(where),
  ]);

  return { rows, rowCount: Number(countRows[0]?.count ?? 0) };
}

/** Full review with cells and per-cell blame (commit that last set each cell). */
export async function getReview(reviewId: string) {
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
  if (!review) return null;

  const cells = await db
    .select()
    .from(tabularCells)
    .where(eq(tabularCells.reviewId, reviewId))
    .orderBy(asc(tabularCells.columnIndex));

  const commitIds = [...new Set(cells.map((c) => c.lastCommitId).filter((x): x is string => !!x))];
  const blameRows = commitIds.length
    ? await db.select().from(commits).where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));

  return {
    review,
    cells: cells.map((c) => ({
      ...c,
      blame: c.lastCommitId ? (blameById.get(c.lastCommitId) ?? null) : null,
    })),
  };
}
