import { hasMatterAccess } from "../../core/access.js";
import { randomUUID } from "node:crypto";
import { eq, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import type { ContractReviewSnapshot } from "@workspace/contracts";
import {
  type TabularColumn,
  documents,
  matters,
  tabularCells,
  tabularReviews,
} from "@workspace/db/schema";
import { type Actor, recordCommit } from "../../core/commit.js";
import { DEFAULT_MODEL, completeText, providerForModel, resolveLlmKey } from "../provider/index.js";
import { stripJsonFence } from "./extract.js";

// Review and column definition: create a review (with its pending cell grid),
// edit a column's config, and draft a column prompt from its title. The actual
// cell-running lives in runner.ts; reads live in queries.ts.

export async function createReview(
  actor: Actor,
  input: {
    title: string;
    inputSnapshot?: ContractReviewSnapshot;
    requestKey?: string;
    requestFingerprint?: string;
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
      if (!(await hasMatterAccess(actor, input.matterId, "editor", tx)))
        throw new Error("access_denied");
      if (input.requestKey) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${input.requestKey}))`);
        const [prior] = await tx
          .select()
          .from(tabularReviews)
          .where(eq(tabularReviews.requestKey, input.requestKey));
        if (prior)
          throw new Error(
            prior.requestFingerprint === input.requestFingerprint
              ? `review_replay:${prior.id}`
              : "request_conflict"
          );
      }
      for (const source of input.inputSnapshot?.documents ?? []) {
        const [current] = await tx.select().from(documents).where(eq(documents.id, source.id));
        if (
          !current ||
          current.deletedAt ||
          current.status !== "ready" ||
          current.headCommitId !== source.headCommitId ||
          current.currentVersionId !== source.versionId ||
          current.markdown !== source.text
        )
          throw new Error("stale_source");
      }
      await tx.insert(tabularReviews).values({
        id: reviewId,
        userId: actor.userId,
        tenantId: matter.tenantId,
        matterId: input.matterId,
        createdBy: actor.userId,
        title: input.title,
        inputSnapshot: input.inputSnapshot ?? null,
        requestKey: input.requestKey ?? null,
        requestFingerprint: input.requestFingerprint ?? null,
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
          ...(input.inputSnapshot
            ? [{ path: "review/input_snapshot", before: null, after: input.inputSnapshot }]
            : []),
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
 * Edit one column's config (prompt/name/format/tags) in place, recorded as a
 * commit so the change is attributable. Existing cells keep their values — the
 * new prompt applies the next time the column is run. Returns the commit.
 */
export async function updateReviewColumn(
  actor: Actor,
  params: {
    reviewId: string;
    columnIndex: number;
    patch: { name?: string; prompt?: string; format?: string | null; tags?: string[] };
  }
) {
  const [review] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, params.reviewId));
  if (!review) throw new Error("Review not found");
  if (review.inputSnapshot)
    throw new Error("Review inputs are immutable; start a new review to change rules");
  const cols = review.columnsConfig;
  const idx = cols.findIndex((c) => c.index === params.columnIndex);
  if (idx === -1) throw new Error("Column not found");
  const before = cols[idx]!;
  // format is nullable on the wire (null = clear); the column type uses undefined.
  const { format, ...rest } = params.patch;
  const after: TabularColumn = {
    ...before,
    ...rest,
    ...(format !== undefined ? { format: format ?? undefined } : {}),
  };
  const nextCols = cols.map((c, i) => (i === idx ? after : c));
  return recordCommit({
    artifactType: "tabular_review",
    artifactId: params.reviewId,
    actor,
    op: "edit_column",
    message: `Edited column "${after.name}"`,
    apply: async ({ tx }) => {
      await tx
        .update(tabularReviews)
        .set({ columnsConfig: nextCols })
        .where(eq(tabularReviews.id, params.reviewId));
      return {
        changes: [
          {
            path: `column/${params.columnIndex}`,
            before: before as unknown,
            after: after as unknown,
          },
        ],
      };
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
