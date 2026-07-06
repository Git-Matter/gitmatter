import { and, eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  type CellCitation,
  type CellContent,
  documents,
  tabularCells,
  tabularReviews,
} from "@workspace/db/schema";
import { type Actor, recordCommit } from "../../core/commit.js";
import { getDocumentContext } from "../../content/chunks.js";
import { recordLlmUsage } from "../../platform/usage.js";
import {
  DEFAULT_MODEL,
  providerForModel,
  resolveLlmKey,
  resolveRunModel,
  type UsageInfo,
} from "../provider/index.js";
import { coerceCitations, coerceFlag, queryCell, queryRow } from "./extract.js";

/** Meter one extraction completion against the review's user/tenant/matter —
 *  tabular runs bill to the matter the review is filed under. Fire-and-forget. */
function meterFor(
  actor: Actor,
  review: { tenantId: string | null; matterId: string | null }
): (u: UsageInfo & { provider: string; model: string }) => void {
  return (u) =>
    void recordLlmUsage({
      userId: actor.userId,
      tenantId: review.tenantId,
      matterId: review.matterId,
      ...u,
    });
}

// The run-and-commit engine: extract cell values (via extract.ts) and persist
// each one as a commit on the audit spine. Single-cell (runCell), agent-written
// (writeCell), per-row batch (runDocument), and streaming "run all"
// (runReviewStreaming) all funnel through commitCell so blame is identical.

/** Upsert one cell as a commit on the audit spine. Shared by the model runner
 *  (single-cell + streaming run, which pass `model`) and the agent-written path
 *  (write_cell, which passes none), so all three persist + blame identically. */
function commitCell(
  actor: Actor,
  p: {
    reviewId: string;
    documentId: string;
    columnIndex: number;
    columnName: string;
    docTitle: string;
    // The model that produced the cell — recorded in the message so blame answers
    // "with what". Omitted when an agent wrote the value itself (write_cell).
    model?: string;
    op?: "run_cell" | "write_cell";
    content: CellContent;
    citations: CellCitation[];
  }
) {
  return recordCommit({
    artifactType: "tabular_review",
    artifactId: p.reviewId,
    actor,
    op: p.op ?? "run_cell",
    message: p.model
      ? `Ran "${p.columnName}" on ${p.docTitle} with ${p.model}`
      : `Wrote "${p.columnName}" on ${p.docTitle}`,
    apply: async ({ tx, commitId }) => {
      const [old] = await tx
        .select()
        .from(tabularCells)
        .where(
          and(
            eq(tabularCells.reviewId, p.reviewId),
            eq(tabularCells.documentId, p.documentId),
            eq(tabularCells.columnIndex, p.columnIndex)
          )
        );
      const set = {
        content: p.content,
        citations: p.citations,
        status: "done" as const,
        createdBy: actor.userId,
        lastCommitId: commitId,
        updatedAt: new Date(),
      };
      await tx
        .insert(tabularCells)
        .values({
          reviewId: p.reviewId,
          documentId: p.documentId,
          columnIndex: p.columnIndex,
          ...set,
        })
        .onConflictDoUpdate({
          target: [tabularCells.reviewId, tabularCells.documentId, tabularCells.columnIndex],
          set,
        });
      return {
        changes: [
          {
            path: `cell/${p.documentId}/${p.columnIndex}`,
            before: old?.content ?? null,
            after: p.content,
          },
        ],
      };
    },
  });
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

  const { model, key } = await resolveRunModel(actor.userId, params.model);

  const { content, citations } = await queryCell({
    model,
    filename: doc.title,
    documentText: (
      await getDocumentContext(doc, {
        mode: "query",
        query: col.prompt,
        task: "tabular",
        repeated: true,
      })
    ).text,
    columnPrompt: col.prompt,
    format: col.format,
    tags: col.tags,
    apiKey: key,
    onUsage: meterFor(actor, review),
  });

  return commitCell(actor, {
    reviewId: params.reviewId,
    documentId: params.documentId,
    columnIndex: params.columnIndex,
    columnName: col.name,
    docTitle: doc.title,
    model,
    content,
    citations,
  });
}

/**
 * Write a cell value directly — for a connected agent that has read the document
 * itself and produced the answer, instead of having gitmatter run its own model
 * (runCell). No LLM key needed. The value is sanitized to the same shape the
 * runner produces and committed under the agent's name, so blame shows the agent
 * wrote it. See the write_cell tool in the catalog.
 */
export async function writeCell(
  actor: Actor,
  params: {
    reviewId: string;
    documentId: string;
    columnIndex: number;
    summary: string;
    flag: string;
    reasoning: string;
    citations?: CellCitation[];
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

  const content: CellContent = {
    summary: params.summary,
    flag: coerceFlag(params.flag),
    reasoning: params.reasoning,
  };

  return commitCell(actor, {
    reviewId: params.reviewId,
    documentId: params.documentId,
    columnIndex: params.columnIndex,
    columnName: col.name,
    docTitle: doc.title,
    op: "write_cell",
    content,
    citations: coerceCitations(params.citations),
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
    documentText: (
      await getDocumentContext(doc, {
        mode: "query",
        query: review.columnsConfig.map((c) => `${c.name}: ${c.prompt}`).join("\n"),
        task: "tabular",
        repeated: true,
        maxChunks: 16,
      })
    ).text,
    columns: review.columnsConfig,
    apiKey: key,
    onUsage: meterFor(actor, review),
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

export type StreamedCell = {
  documentId: string;
  columnIndex: number;
  content: CellContent | null;
  citations: CellCitation[] | null;
  status: "pending" | "generating" | "done" | "error";
};

/**
 * Run every cell of a review with progress callbacks — the streaming "Run all".
 * Granularity is per cell: each column is its own query, so cells fill in one by
 * one. Documents run through a small concurrency pool (parallel); within a
 * document its columns run sequentially so the FIRST column primes the document
 * cache (the doc sits in the cacheable system prefix) and the rest reuse it —
 * cheap repeats instead of re-billing the full text per column.
 */
export async function runReviewStreaming(
  actor: Actor,
  params: { reviewId: string; model?: string; concurrency?: number },
  handlers: {
    onCellStart: (documentId: string, columnIndex: number) => void;
    onCell: (documentId: string, columnIndex: number, cell: StreamedCell) => void;
    onError: (documentId: string, columnIndex: number, message: string) => void;
  }
) {
  const [review] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, params.reviewId));
  if (!review) throw new Error("Review not found");
  const columns = review.columnsConfig;
  if (!columns.length) throw new Error("Review has no columns");

  const docIds = review.documentIds;
  const model = params.model ?? DEFAULT_MODEL;
  const concurrency = Math.max(1, Math.min(params.concurrency ?? 4, 8));
  const { key } = await resolveLlmKey(actor.userId, providerForModel(model));
  if (!key) throw new Error(`No API key for ${providerForModel(model)}`);

  const markStatus = (documentId: string, columnIndex: number, status: "generating" | "error") =>
    db
      .update(tabularCells)
      .set({ status, updatedAt: new Date() })
      .where(
        and(
          eq(tabularCells.reviewId, params.reviewId),
          eq(tabularCells.documentId, documentId),
          eq(tabularCells.columnIndex, columnIndex)
        )
      );

  const runDoc = async (documentId: string) => {
    const [doc] = await db.select().from(documents).where(eq(documents.id, documentId));
    if (!doc) {
      for (const col of columns) handlers.onError(documentId, col.index, "Document not found");
      return;
    }
    // Same key for every column of this document → the doc's cached prefix is hit.
    // documentId alone is unique; prompt_cache_key max length is 64 chars.
    const cacheKey = `doc:${documentId}`;
    for (const col of columns) {
      handlers.onCellStart(documentId, col.index);
      await markStatus(documentId, col.index, "generating");
      try {
        const context = await getDocumentContext(doc, {
          mode: "query",
          query: col.prompt,
          task: "tabular",
          repeated: true,
        });
        const { content, citations } = await queryCell({
          model,
          filename: doc.title,
          documentText: context.text,
          columnPrompt: col.prompt,
          format: col.format,
          tags: col.tags,
          apiKey: key,
          cache: true,
          cacheKey: `${cacheKey}:${context.chunks.map((c) => c.index).join("-") || "full"}`.slice(
            0,
            64
          ),
          onUsage: meterFor(actor, review),
        });
        await commitCell(actor, {
          reviewId: params.reviewId,
          documentId,
          columnIndex: col.index,
          columnName: col.name,
          docTitle: doc.title,
          model,
          content,
          citations,
        });
        handlers.onCell(documentId, col.index, {
          documentId,
          columnIndex: col.index,
          content,
          citations,
          status: "done",
        });
      } catch (e) {
        await markStatus(documentId, col.index, "error");
        handlers.onError(documentId, col.index, e instanceof Error ? e.message : "run failed");
      }
    }
  };

  // Bounded pool: `concurrency` workers pull from the document list.
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(concurrency, docIds.length) }, async () => {
      while (next < docIds.length) {
        const documentId = docIds[next++];
        if (documentId) await runDoc(documentId);
      }
    })
  );
}
