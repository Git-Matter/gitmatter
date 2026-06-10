import { randomUUID } from "node:crypto";
import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type CellContent,
  type TabularColumn,
  commits,
  documents,
  tabularCells,
  tabularReviews,
} from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";
import { DEFAULT_MODEL, completeClaudeText } from "./claude.js";
import { buildCellPrompt } from "./prompts/tabular.js";

const FLAGS = ["green", "grey", "yellow", "red"] as const;

/** Extract a single cell value from a document via Claude. Ported from mike's queryTabularCell. */
export async function queryCell(params: {
  model?: string;
  filename: string;
  documentText: string;
  columnPrompt: string;
  format?: string;
  apiKey?: string | null;
}): Promise<CellContent> {
  const { system, user } = buildCellPrompt(params);
  const raw = await completeClaudeText({
    model: params.model ?? DEFAULT_MODEL,
    systemPrompt: system,
    user,
    maxTokens: 2048,
    apiKey: params.apiKey,
  });
  try {
    const parsed = JSON.parse(
      raw
        .replace(/^```(?:json)?\n?/i, "")
        .replace(/\n?```$/, "")
        .trim()
    ) as { summary?: string; value?: string; flag?: unknown; reasoning?: string };
    const flag = FLAGS.includes(parsed.flag as never)
      ? (parsed.flag as CellContent["flag"])
      : "grey";
    return {
      summary: String(parsed.summary ?? parsed.value ?? "").trim() || "Not addressed",
      flag,
      reasoning: String(parsed.reasoning ?? ""),
    };
  } catch {
    return { summary: raw.trim().slice(0, 500) || "Not addressed", flag: "grey", reasoning: "" };
  }
}

export async function createReview(
  actor: Actor,
  input: {
    title: string;
    columnsConfig: TabularColumn[];
    documentIds: string[];
    workflowId?: string;
    jurisdiction?: string | null;
  }
) {
  const reviewId = randomUUID();
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

/** Run (or re-run) one cell: extract via Claude, then commit the change. */
export async function runCell(
  actor: Actor,
  params: {
    reviewId: string;
    documentId: string;
    columnIndex: number;
    apiKey?: string | null;
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

  const content = await queryCell({
    model: params.model,
    filename: doc.title,
    documentText: doc.markdown ?? "",
    columnPrompt: col.prompt,
    format: col.format,
    apiKey: params.apiKey,
  });

  return recordCommit({
    artifactType: "tabular_review",
    artifactId: params.reviewId,
    actor,
    op: "run_cell",
    message: `Ran "${col.name}" on ${doc.title}`,
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
          status: "done",
          createdBy: actor.userId,
          lastCommitId: commitId,
          updatedAt: new Date(),
        })
        .onConflictDoUpdate({
          target: [tabularCells.reviewId, tabularCells.documentId, tabularCells.columnIndex],
          set: {
            content,
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

export async function listReviews(userId: string) {
  return db.select().from(tabularReviews).where(eq(tabularReviews.userId, userId));
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
