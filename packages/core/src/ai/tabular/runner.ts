import { stageCellProposal } from "../../core/approval.js";
import { recordFindingRevision, findingRevisionChanges, validateFinding } from "./finding.js";
import {
  canAccessArtifact,
  canReadDocument,
  hasMatterAccessInTransaction,
} from "../../core/access.js";
import { refreshProviderActor } from "../../core/jobs.js";
import { canonicalFingerprint } from "../../core/fingerprint.js";
import { reviewPolicySnapshotCurrent } from "../../core/review-policy.js";
import { recordFunnel } from "../../core/funnel.js";
import { and, eq } from "drizzle-orm";
import { db, type Tx } from "@workspace/db/client";
import {
  type CellCitation,
  type CellContent,
  type TabularReview,
  type Document,
  documents,
  tabularCells,
  tabularReviews,
  mcpAccessTokens,
} from "@workspace/db/schema";
import { type Actor, recordCommit, recordCommitInTransaction } from "../../core/commit.js";
import {
  DEFAULT_MODEL,
  providerForModel,
  resolveLlmKey,
  resolveRunModel,
} from "../provider/index.js";
import { coerceCitations, coerceFlag, queryCell, queryRow } from "./extract.js";
import { capturedReviewInstructions } from "../prompts/tabular.js";

/** Meter one extraction completion against the review's user/tenant/matter —
 *  tabular runs bill to the matter the review is filed under. Fire-and-forget. */
function meterFor(
  actor: Actor,
  review: { id: string; tenantId: string | null; matterId: string | null }
): (u: { provider: string; model: string; inputTokens: number; outputTokens: number }) => void {
  return (u) => {
    recordFunnel("review_usage", {
      actorType: actor.type,
      reviewId: review.id,
      matterId: review.matterId ?? undefined,
      provider: providerForModel(u.model),
      model: u.model,
      inputTokens: u.inputTokens,
      outputTokens: u.outputTokens,
    });
  };
}

// Observe every cell/row execution through one shared boundary. Reading telemetry
// state is best effort; it can never turn a successful audited mutation into an error.
async function observePlaybookOperation<T>(
  actor: Actor,
  review: TabularReview,
  work: () => Promise<T>
): Promise<T> {
  if (!review.workflowId) return work();
  const started = performance.now();
  const funnel = {
    actorType: actor.type,
    reviewId: review.id,
    matterId: review.matterId ?? undefined,
    workflowId: review.workflowId,
  };
  try {
    const cells = await db
      .select({ status: tabularCells.status })
      .from(tabularCells)
      .where(eq(tabularCells.reviewId, review.id));
    if (
      cells.every((cell) => cell.status === "pending") ||
      cells.every((cell) => cell.status === "done")
    )
      recordFunnel("playbook_started", funnel);
  } catch {
    /* best effort observation */
  }
  let result: T;
  try {
    result = await work();
  } catch (error) {
    recordFunnel("playbook_failed", {
      ...funnel,
      durationMs: performance.now() - started,
      outcome: "failed",
      failureCategory: "unknown",
    });
    throw error;
  }
  try {
    const cells = await db
      .select({ status: tabularCells.status })
      .from(tabularCells)
      .where(eq(tabularCells.reviewId, review.id));
    const expected = review.documentIds.length * review.columnsConfig.length;
    if (expected > 0 && cells.length === expected && cells.every((cell) => cell.status === "done"))
      recordFunnel("playbook_completed", {
        ...funnel,
        durationMs: performance.now() - started,
        cellCount: expected,
        outcome: "succeeded",
      });
  } catch {
    /* committed work remains successful */
  }
  return result;
}

// The run-and-commit engine: extract cell values (via extract.ts) and persist
// each one as a commit on the audit spine. Single-cell (runCell), agent-written
// (writeCell), per-row batch (runDocument), and streaming "run all"
// (runReviewStreaming) all funnel through commitCell so blame is identical.

/** Provider output remains agent-authored even when a person requested inference. */
function providerActor(actor: Actor): Actor {
  return actor.type === "agent"
    ? actor
    : { type: "agent", userId: actor.userId, agentLabel: "review-runner" };
}

type FrozenRunInput = {
  reviewFingerprint: string;
  documentId: string;
  sourceVersionId: string | null;
  sourceText: string;
  cells: Array<{ index: number; commitId: string | null }>;
  credentialId?: string;
};
const runFingerprint = (review: TabularReview) =>
  canonicalFingerprint({
    columns: review.columnsConfig,
    inputSnapshot: review.inputSnapshot,
    documentIds: review.documentIds,
  });

async function freezeRunInput(
  actor: Actor,
  review: TabularReview,
  doc: Document,
  credentialId?: string,
  columnIndex?: number
): Promise<FrozenRunInput> {
  const source = review.inputSnapshot?.documents.find((s) => s.id === doc.id);
  if (
    doc.deletedAt ||
    doc.status !== "ready" ||
    (source && (source.versionId !== doc.currentVersionId || source.text !== (doc.markdown ?? "")))
  )
    throw new Error("stale_source");
  if (!(await reviewPolicySnapshotCurrent(actor, review))) throw new Error("stale_source");
  const cells = await db
    .select({ index: tabularCells.columnIndex, commitId: tabularCells.lastCommitId })
    .from(tabularCells)
    .where(and(eq(tabularCells.reviewId, review.id), eq(tabularCells.documentId, doc.id)));
  return {
    reviewFingerprint: runFingerprint(review),
    documentId: doc.id,
    sourceVersionId: doc.currentVersionId,
    sourceText: doc.markdown ?? "",
    cells: review.columnsConfig
      .filter((c) => columnIndex === undefined || c.index === columnIndex)
      .map((c) => ({
        index: c.index,
        commitId: cells.find((cell) => cell.index === c.index)?.commitId ?? null,
      })),
    credentialId,
  };
}

async function verifyRunInput(tx: Tx, actor: Actor, reviewId: string, frozen: FrozenRunInput) {
  if (frozen.credentialId)
    await tx
      .select({ id: mcpAccessTokens.id })
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.id, frozen.credentialId))
      .for("share");
  const currentActor = await refreshProviderActor(actor, frozen.credentialId, tx);
  const [review] = await tx.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
  if (
    !review ||
    runFingerprint(review) !== frozen.reviewFingerprint ||
    !(await hasMatterAccessInTransaction(tx, currentActor, review.matterId, "editor"))
  )
    throw new Error("stale_source");
  const [doc] = await tx
    .select()
    .from(documents)
    .where(eq(documents.id, frozen.documentId))
    .for("share");
  if (
    !doc ||
    doc.deletedAt ||
    doc.status !== "ready" ||
    doc.currentVersionId !== frozen.sourceVersionId ||
    (doc.markdown ?? "") !== frozen.sourceText ||
    !(await canReadDocument(currentActor, doc.id, tx))
  )
    throw new Error("stale_source");
  const cells = await tx
    .select({ index: tabularCells.columnIndex, commitId: tabularCells.lastCommitId })
    .from(tabularCells)
    .where(and(eq(tabularCells.reviewId, reviewId), eq(tabularCells.documentId, doc.id)));
  for (const expected of frozen.cells)
    if (
      (cells.find((cell) => cell.index === expected.index)?.commitId ?? null) !== expected.commitId
    )
      throw new Error("stale_source");
  return currentActor;
}

/** Upsert one cell as a commit on the audit spine. Shared by the model runner
 *  (single-cell + streaming run, which pass `model`) and the agent-written path
 *  (write_cell, which passes none), so all three persist + blame identically. */
export function commitCell(
  actor: Actor,
  p: {
    review: TabularReview;
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
    expectedCellCommitId?: string | null;
    initiatingActor?: Actor;
    jobId?: string;
    preparedInput?: FrozenRunInput;
  },
  transaction?: Tx
) {
  const source = p.review.inputSnapshot?.documents.find((d) => d.id === p.documentId);
  if (source) {
    const validated = validateFinding(source.text, p.content, p.citations);
    p = { ...p, content: validated.content, citations: validated.citations };
  }
  const args: Parameters<typeof recordCommit>[0] = {
    artifactType: "tabular_review",
    artifactId: p.reviewId,
    actor,
    op: p.op ?? "run_cell",
    message: p.model
      ? `Ran "${p.columnName}" on ${p.docTitle} with ${p.model}`
      : `Wrote "${p.columnName}" on ${p.docTitle}`,
    apply: async ({ tx, commitId }) => {
      const currentActor = p.preparedInput
        ? providerActor(
            await verifyRunInput(tx, p.initiatingActor ?? actor, p.reviewId, p.preparedInput)
          )
        : actor;
      if (p.expectedCellCommitId !== undefined) {
        const [current] = await tx
          .select({ commitId: tabularCells.lastCommitId })
          .from(tabularCells)
          .where(
            and(
              eq(tabularCells.reviewId, p.reviewId),
              eq(tabularCells.documentId, p.documentId),
              eq(tabularCells.columnIndex, p.columnIndex)
            )
          );
        if ((current?.commitId ?? null) !== p.expectedCellCommitId) throw new Error("stale_source");
      }

      const proposal = await stageCellProposal(tx, {
        actor: currentActor,
        commitId,
        reviewId: p.reviewId,
        documentId: p.documentId,
        columnIndex: p.columnIndex,
        content: p.content,
        citations: p.citations,
        requireCurrentSource: !!p.model,
        sourceVersionId: p.preparedInput
          ? p.preparedInput.sourceVersionId
          : source
            ? source.versionId
            : undefined,
      });
      if (proposal)
        return {
          ...proposal,
          summary: { ...proposal.summary, initiatingActor: p.initiatingActor, jobId: p.jobId },
        };
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
      const finding = await recordFindingRevision(tx, {
        review: p.review,
        documentId: p.documentId,
        columnIndex: p.columnIndex,
        commitId,
        content: p.content,
        citations: p.citations,
      });
      return {
        summary: { initiatingActor: p.initiatingActor, jobId: p.jobId },
        changes: [
          ...(finding
            ? findingRevisionChanges(
                p.documentId,
                p.columnIndex,
                finding,
                p.content,
                p.citations,
                old?.disposition
              )
            : []),
          {
            path: `cell/${p.documentId}/${p.columnIndex}/citations`,
            before: old?.citations ?? null,
            after: p.citations,
          },
          {
            path: `cell/${p.documentId}/${p.columnIndex}`,
            before: old?.content ?? null,
            after: p.content,
          },
        ],
      };
    },
  };
  return transaction ? recordCommitInTransaction(transaction, args) : recordCommit(args);
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
    credentialId?: string;
  }
) {
  const [review] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, params.reviewId));
  if (!review) throw new Error("Review not found");
  if (!(await canAccessArtifact(actor, "tabular_review", review.id, "editor")))
    throw new Error("access_denied");
  return observePlaybookOperation(actor, review, async () => {
    const col = review.columnsConfig.find((c) => c.index === params.columnIndex);
    if (!col) throw new Error("Column not found");

    const [doc] = await db.select().from(documents).where(eq(documents.id, params.documentId));
    if (!doc || !review.documentIds.includes(doc.id) || !(await canReadDocument(actor, doc.id)))
      throw new Error("Document not found");

    const { model, key } = await resolveRunModel(actor.userId, params.model);
    const preparedInput = await freezeRunInput(actor, review, doc, params.credentialId, col.index);

    const { content, citations } = await queryCell({
      spendContext: {
        actor,
        matterId: review.matterId,
        credentialId: params.credentialId,
        sourceKind: "sync_review",
      },
      model,
      filename: doc.title,
      documentText:
        review.inputSnapshot?.documents.find((d) => d.id === doc.id)?.text ?? doc.markdown ?? "",
      columnPrompt: col.prompt,
      reviewInstructions: capturedReviewInstructions(review.inputSnapshot),
      format: col.format,
      tags: col.tags,
      apiKey: key,
      onUsage: meterFor(actor, review),
    });

    return commitCell(providerActor(actor), {
      initiatingActor: actor,
      review,
      reviewId: params.reviewId,
      documentId: params.documentId,
      columnIndex: params.columnIndex,
      columnName: col.name,
      docTitle: doc.title,
      model,
      content,
      citations,
      preparedInput,
      expectedCellCommitId:
        preparedInput.cells.find((cell) => cell.index === col.index)?.commitId ?? null,
    });
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
    outcome?: CellContent["outcome"];
  }
) {
  const [review] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, params.reviewId));
  if (!review) throw new Error("Review not found");
  if (!(await canAccessArtifact(actor, "tabular_review", review.id, "editor")))
    throw new Error("access_denied");
  const col = review.columnsConfig.find((c) => c.index === params.columnIndex);
  if (!col) throw new Error("Column not found");

  const [doc] = await db.select().from(documents).where(eq(documents.id, params.documentId));
  if (!doc || !review.documentIds.includes(doc.id) || !(await canReadDocument(actor, doc.id)))
    throw new Error("Document not found");

  const content: CellContent = {
    summary: params.summary,
    flag: coerceFlag(params.flag),
    reasoning: params.reasoning,
    ...(params.outcome ? { outcome: params.outcome } : {}),
  };

  return observePlaybookOperation(actor, review, async () => {
    const result = await commitCell(actor, {
      review,
      reviewId: params.reviewId,
      documentId: params.documentId,
      columnIndex: params.columnIndex,
      columnName: col.name,
      docTitle: doc.title,
      op: "write_cell",
      content,
      citations: coerceCitations(params.citations),
    });
    return result;
  });
}

/**
 * Run every column for one document in a single LLM call, then commit all cells
 * in one commit. The batch path: one request per row instead of one per cell.
 */
export async function runDocument(
  actor: Actor,
  params: { reviewId: string; documentId: string; model?: string; credentialId?: string }
) {
  const [review] = await db
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, params.reviewId));
  if (!review) throw new Error("Review not found");
  if (!(await canAccessArtifact(actor, "tabular_review", review.id, "editor")))
    throw new Error("access_denied");
  return observePlaybookOperation(actor, review, async () => {
    if (!review.columnsConfig.length) throw new Error("Review has no columns");

    const [doc] = await db.select().from(documents).where(eq(documents.id, params.documentId));
    if (!doc || !review.documentIds.includes(doc.id) || !(await canReadDocument(actor, doc.id)))
      throw new Error("Document not found");

    const model = params.model ?? DEFAULT_MODEL;
    const preparedInput = await freezeRunInput(actor, review, doc, params.credentialId);
    const { key } = await resolveLlmKey(actor.userId, providerForModel(model));
    if (!key) throw new Error(`No API key for ${providerForModel(model)}`);

    const results = await queryRow({
      spendContext: {
        actor,
        matterId: review.matterId,
        credentialId: params.credentialId,
        sourceKind: "sync_review",
      },
      model,
      filename: doc.title,
      documentText:
        review.inputSnapshot?.documents.find((d) => d.id === doc.id)?.text ?? doc.markdown ?? "",
      columns: review.columnsConfig,
      reviewInstructions: capturedReviewInstructions(review.inputSnapshot),
      apiKey: key,
      onUsage: meterFor(actor, review),
    });

    return recordCommit({
      artifactType: "tabular_review",
      artifactId: params.reviewId,
      actor: providerActor(actor),
      op: "run_cell",
      message: `Ran ${results.size} column(s) on ${doc.title} with ${model}`,
      apply: async ({ tx, commitId }) => {
        const currentActor = providerActor(
          await verifyRunInput(tx, actor, review.id, preparedInput)
        );
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
        const oldCellsByIndex = new Map(existing.map((c) => [c.columnIndex, c]));
        const changes: Array<{ path: string; before: unknown; after: unknown }> = [];

        for (const [columnIndex, result] of results) {
          const source = review.inputSnapshot?.documents.find((d) => d.id === params.documentId);
          const { content, citations } = source
            ? validateFinding(source.text, result.content, result.citations)
            : result;
          const proposal = await stageCellProposal(tx, {
            actor: currentActor,
            commitId,
            reviewId: params.reviewId,
            documentId: params.documentId,
            columnIndex,
            content,
            citations,
            requireCurrentSource: true,
            sourceVersionId: preparedInput.sourceVersionId,
          });
          if (proposal) {
            changes.push(...proposal.changes);
            continue;
          }
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
          const finding = await recordFindingRevision(tx, {
            review,
            documentId: params.documentId,
            columnIndex,
            commitId,
            content,
            citations,
          });
          if (finding)
            changes.push(
              ...findingRevisionChanges(
                params.documentId,
                columnIndex,
                finding,
                content,
                citations,
                oldCellsByIndex.get(columnIndex)?.disposition
              )
            );
          changes.push({
            path: `cell/${params.documentId}/${columnIndex}/citations`,
            before: oldCellsByIndex.get(columnIndex)?.citations ?? null,
            after: citations,
          });
          changes.push({
            path: `cell/${params.documentId}/${columnIndex}`,
            before: oldByIndex.get(columnIndex) ?? null,
            after: content,
          });
        }
        return { changes, summary: { initiatingActor: actor } };
      },
    });
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
  params: {
    reviewId: string;
    model?: string;
    concurrency?: number;
    requestId?: string;
    credentialId?: string;
  },
  handlers: {
    onCellStart: (documentId: string, columnIndex: number) => void;
    onCell: (documentId: string, columnIndex: number, cell: StreamedCell) => void;
    onError: (documentId: string, columnIndex: number, message: string) => void;
    shouldStop?: () => boolean;
  }
) {
  const { queueReviewRun } = await import("./jobs.js");
  const { getJob } = await import("../../core/jobs.js");
  const { startExtractionWorker } = await import("../../content/extractionQueue.js");
  const queued = await queueReviewRun(actor, params);
  startExtractionWorker().wake();
  const pending = new Set(queued.jobIds);
  const started = new Set<string>();
  while (pending.size && !handlers.shouldStop?.()) {
    for (const id of pending) {
      const job = await getJob(actor, id);
      if (!job) return; // authorization changed; no further count/result disclosure
      const columnIndex = job.columnIndex!;
      if (job.state === "running" && !started.has(id)) {
        started.add(id);
        handlers.onCellStart(job.documentId, columnIndex);
      }
      if (job.state === "succeeded") {
        const [persisted] = await db
          .select()
          .from(tabularCells)
          .where(
            and(
              eq(tabularCells.reviewId, params.reviewId),
              eq(tabularCells.documentId, job.documentId),
              eq(tabularCells.columnIndex, columnIndex)
            )
          );
        handlers.onCell(job.documentId, columnIndex, {
          documentId: job.documentId,
          columnIndex,
          content: persisted?.content ?? null,
          citations: persisted?.citations ?? null,
          status: persisted?.status ?? "pending",
        });
        pending.delete(id);
      } else if (job.state === "failed" || job.state === "cancelled") {
        handlers.onError(job.documentId, columnIndex, job.errorCode ?? "cancelled");
        pending.delete(id);
      }
    }
    if (pending.size) await new Promise<void>((resolve) => setTimeout(resolve, 500));
  }
  return queued;
}
