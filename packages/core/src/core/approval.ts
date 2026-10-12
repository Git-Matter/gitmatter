import { randomUUID } from "node:crypto";
import { and, asc, eq, gt, or, sql } from "drizzle-orm";
import { db, type Tx } from "@workspace/db/client";
import {
  type ApprovalPolicy,
  type CellCitation,
  type CellContent,
  type CellProposalPayload,
  approvalProposals,
  commitApprovals,
  documents,
  matters,
  tabularCells,
  tabularReviews,
} from "@workspace/db/schema";
import { z } from "zod";
import { recordFindingRevision } from "../ai/tabular/finding.js";
import {
  type AccessReader,
  canAccessArtifact,
  canReadDocument,
  hasMatterAccess,
  hasMatterAccessInTransaction,
} from "./access.js";
import { type Actor, recordCommit, recordCommitInTransaction } from "./commit.js";

export const approvalPolicySchema = z
  .object({
    agentCells: z.enum(["direct", "editor", "owner"]),
    escalationDecisions: z.enum(["editor", "owner"]).optional(),
  })
  .strict();
export const proposalDecisionSchema = z
  .object({
    requestId: z.uuid(),
    proposalId: z.uuid(),
    revision: z.number().int().positive(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    policyRevision: z.number().int().nonnegative(),
    decision: z.enum(["approve", "reject", "withdraw"]),
    note: z.string().trim().max(4000).optional(),
  })
  .strict();
export type ProposalDecision = z.infer<typeof proposalDecisionSchema>;

export class ApprovalError extends Error {
  constructor(
    public code:
      | "access_denied"
      | "stale_proposal"
      | "policy_changed"
      | "invalid_input"
      | "request_conflict",
    message: string
  ) {
    super(message);
    this.name = "ApprovalError";
  }
}
export { canonicalFingerprint as approvalHash } from "./fingerprint.js";
import { canonicalFingerprint as approvalHash } from "./fingerprint.js";
function human(actor: Actor) {
  if (actor.type !== "user")
    throw new ApprovalError("access_denied", "A person must decide proposals.");
}
async function requireRoleInTransaction(
  tx: Tx,
  actor: Actor,
  matterId: string,
  minimum: "viewer" | "editor" | "owner"
) {
  if (!(await hasMatterAccessInTransaction(tx, actor, matterId, minimum)))
    throw new ApprovalError("access_denied", `Current matter ${minimum} access required.`);
}
async function policyInTransaction(tx: Tx, actor: Actor, matterId: string) {
  await requireRoleInTransaction(tx, actor, matterId, "viewer");
  const [matter] = await tx.select().from(matters).where(eq(matters.id, matterId)).for("share");
  if (!matter) throw new ApprovalError("access_denied", "Matter access required.");
  return matter;
}
export async function getApprovalPolicy(actor: Actor, matterId: string, reader: AccessReader = db) {
  if (!(await hasMatterAccess(actor, matterId, "viewer", reader)))
    throw new ApprovalError("access_denied", "Matter access required.");
  const [matter] = await reader.select().from(matters).where(eq(matters.id, matterId));
  if (!matter) throw new ApprovalError("access_denied", "Matter access required.");
  return {
    policy: {
      ...matter.approvalPolicy,
      escalationDecisions: matter.approvalPolicy.escalationDecisions ?? "editor",
    },
    revision: matter.approvalPolicyRevision,
  };
}
export async function setApprovalPolicy(
  actor: Actor,
  matterId: string,
  input: { policy: ApprovalPolicy; expectedRevision: number; reason: string }
) {
  human(actor);
  const requestedPolicy = approvalPolicySchema.parse(input.policy);
  if (!input.reason.trim() || input.reason.length > 4000)
    throw new ApprovalError("invalid_input", "A policy change reason is required.");
  return recordCommit({
    artifactType: "matter",
    artifactId: matterId,
    actor,
    op: "approval_policy",
    message: "Changed matter approval policy",
    apply: async ({ tx }) => {
      await requireRoleInTransaction(tx, actor, matterId, "owner");
      const [matter] = await tx
        .select()
        .from(matters)
        .where(eq(matters.id, matterId))
        .for("update");
      if (!matter || matter.approvalPolicyRevision !== input.expectedRevision)
        throw new ApprovalError("policy_changed", "Policy changed; review the current policy.");
      const policy = {
        ...requestedPolicy,
        escalationDecisions:
          requestedPolicy.escalationDecisions ??
          matter.approvalPolicy.escalationDecisions ??
          "editor",
      };
      const revision = matter.approvalPolicyRevision + 1;
      await tx
        .update(matters)
        .set({ approvalPolicy: policy, approvalPolicyRevision: revision, updatedAt: new Date() })
        .where(eq(matters.id, matterId));
      return {
        changes: [
          { path: "approval/policy", before: matter.approvalPolicy, after: policy },
          {
            path: "approval/policyRevision",
            before: matter.approvalPolicyRevision,
            after: revision,
          },
        ],
        summary: { reason: input.reason.trim(), revision },
      };
    },
  });
}

/** A request to escalate needs an editor; resolving/closing it follows the configured
 * human decision authority and binds the exact finding plus current policy. */
export async function guardFindingDisposition(
  tx: Tx,
  actor: Actor,
  input: {
    reviewId: string;
    documentId: string;
    columnIndex: number;
    revisionId: string;
    status: "left_unchanged" | "escalated";
    policyRevision?: number;
  }
) {
  human(actor);
  if (
    !(await canAccessArtifact(actor, "tabular_review", input.reviewId, "editor", tx)) ||
    !(await canReadDocument(actor, input.documentId, tx))
  )
    throw new ApprovalError("access_denied", "Review decision access required.");
  const [review] = await tx
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, input.reviewId));
  if (!review || !review.documentIds.includes(input.documentId))
    throw new ApprovalError("access_denied", "Review decision access required.");
  const matter = await policyInTransaction(tx, actor, review.matterId);
  const configuredRole = matter.approvalPolicy.escalationDecisions ?? "editor";
  const requiredRole = input.status === "escalated" ? "editor" : configuredRole;
  await requireRoleInTransaction(tx, actor, matter.id, requiredRole);
  if (
    (input.policyRevision !== undefined &&
      input.policyRevision !== matter.approvalPolicyRevision) ||
    (input.status === "left_unchanged" &&
      configuredRole === "owner" &&
      input.policyRevision === undefined)
  )
    throw new ApprovalError(
      "policy_changed",
      "Review current approval policy before deciding this finding."
    );
  const [cell] = await tx
    .select()
    .from(tabularCells)
    .where(
      and(
        eq(tabularCells.reviewId, review.id),
        eq(tabularCells.documentId, input.documentId),
        eq(tabularCells.columnIndex, input.columnIndex)
      )
    )
    .for("update");
  if (!cell?.finding || cell.finding.revisionId !== input.revisionId)
    throw new ApprovalError("stale_proposal", "Finding changed; review its current revision.");
  return { policyRevision: matter.approvalPolicyRevision, requiredRole };
}

/** Called inside the artifact commit BEFORE accepted cell writes. Returning a proposal
 * requires the caller to skip all accepted-content/provenance writes. */
export async function stageCellProposal(
  tx: Tx,
  input: {
    actor: Actor;
    commitId: string;
    reviewId: string;
    documentId: string;
    columnIndex: number;
    content: CellContent;
    citations: CellCitation[];
    sourceVersionId?: string | null;
  }
) {
  const { actor } = input;
  if (
    !(await canAccessArtifact(actor, "tabular_review", input.reviewId, "editor", tx)) ||
    !(await canReadDocument(actor, input.documentId, tx))
  )
    throw new ApprovalError("access_denied", "Review write and document read access required.");
  const [review] = await tx
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, input.reviewId));
  if (!review || !review.documentIds.includes(input.documentId))
    throw new ApprovalError("invalid_input", "Document is not in this review.");
  const column = review.columnsConfig.find((c) => c.index === input.columnIndex);
  if (!column) throw new ApprovalError("invalid_input", "Column is not in this review.");
  await requireRoleInTransaction(tx, actor, review.matterId, "editor");
  const matter = await policyInTransaction(tx, actor, review.matterId);
  if (actor.type !== "agent" || matter.approvalPolicy.agentCells === "direct") return null;
  const [doc] = await tx
    .select()
    .from(documents)
    .where(eq(documents.id, input.documentId))
    .for("share");
  if (!doc || doc.deletedAt !== null)
    throw new ApprovalError("invalid_input", "Document not found.");
  if (input.sourceVersionId !== undefined && doc.currentVersionId !== input.sourceVersionId)
    throw new ApprovalError("stale_proposal", "Source changed; rerun the review.");
  const [old] = await tx
    .select()
    .from(tabularCells)
    .where(
      and(
        eq(tabularCells.reviewId, input.reviewId),
        eq(tabularCells.documentId, input.documentId),
        eq(tabularCells.columnIndex, input.columnIndex)
      )
    );
  const payload: CellProposalPayload = {
    reviewId: input.reviewId,
    documentId: input.documentId,
    columnIndex: input.columnIndex,
    content: input.content,
    beforeContent: old?.content ?? null,
    citations: input.citations,
    baseCellCommitId: old?.lastCommitId ?? null,
    sourceVersionId: doc.currentVersionId,
    sourceHash: approvalHash({ markdown: doc.markdown, version: doc.currentVersionId }),
    columnHash: approvalHash(column),
  };
  const proposalId = randomUUID();
  await tx.insert(approvalProposals).values({
    id: proposalId,
    matterId: matter.id,
    kind: "cell",
    artifactId: review.id,
    proposalCommitId: input.commitId,
    contentHash: approvalHash(payload),
    policyRevision: matter.approvalPolicyRevision,
    requiredRole: matter.approvalPolicy.agentCells,
    proposerId: actor.userId,
    agentLabel: actor.agentLabel,
    payload,
    lastCommitId: input.commitId,
  });
  // Execution completion is separate from approval and preserves accepted values.
  if (old)
    await tx
      .update(tabularCells)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(tabularCells.id, old.id));
  return {
    proposalId,
    changes: [
      {
        path: `proposal/${proposalId}`,
        before: null,
        after: {
          kind: "cell",
          status: "pending",
          payload,
          policyRevision: matter.approvalPolicyRevision,
        },
      },
    ],
    summary: { outcome: "proposed", proposalId },
  };
}

async function readable(
  actor: Actor,
  proposal: typeof approvalProposals.$inferSelect,
  reader: AccessReader = db
) {
  return (
    (await hasMatterAccess(actor, proposal.matterId, "viewer", reader)) &&
    (await canAccessArtifact(actor, "tabular_review", proposal.artifactId, "viewer", reader)) &&
    (await canReadDocument(actor, proposal.payload.documentId, reader))
  );
}
export async function getProposal(actor: Actor, proposalId: string, reader: AccessReader = db) {
  const [proposal] = await reader
    .select()
    .from(approvalProposals)
    .where(eq(approvalProposals.id, proposalId));
  if (!proposal || !(await readable(actor, proposal, reader)))
    throw new ApprovalError("access_denied", "Proposal access required.");
  const policy = await getApprovalPolicy(actor, proposal.matterId, reader);
  const mayDecide =
    actor.type === "user" &&
    (await hasMatterAccess(actor, proposal.matterId, proposal.requiredRole, reader)) &&
    (await canAccessArtifact(actor, "tabular_review", proposal.artifactId, "editor", reader));
  const p = proposal.payload;
  const [review] = await reader
    .select()
    .from(tabularReviews)
    .where(eq(tabularReviews.id, p.reviewId));
  const [doc] = await reader.select().from(documents).where(eq(documents.id, p.documentId));
  const [cell] = await reader
    .select()
    .from(tabularCells)
    .where(
      and(
        eq(tabularCells.reviewId, p.reviewId),
        eq(tabularCells.documentId, p.documentId),
        eq(tabularCells.columnIndex, p.columnIndex)
      )
    );
  const col = review?.columnsConfig.find((c) => c.index === p.columnIndex);
  const stale =
    proposal.status === "pending" &&
    (!review?.documentIds.includes(p.documentId) ||
      !doc ||
      doc.deletedAt !== null ||
      !col ||
      (cell?.lastCommitId ?? null) !== p.baseCellCommitId ||
      doc.currentVersionId !== p.sourceVersionId ||
      approvalHash({ markdown: doc.markdown, version: doc.currentVersionId }) !== p.sourceHash ||
      approvalHash(col) !== p.columnHash);
  const decisions = await reader
    .select()
    .from(commitApprovals)
    .where(eq(commitApprovals.proposalId, proposalId));
  return {
    ...proposal,
    policyChanged: policy.revision !== proposal.policyRevision,
    mayDecide,
    stale,
    decisions,
  };
}
export async function listProposals(
  actor: Actor,
  matterId: string,
  options: {
    status?: "pending" | "applied" | "rejected" | "withdrawn";
    limit?: number;
    afterId?: string;
  } = {}
) {
  if (!(await hasMatterAccess(actor, matterId)))
    throw new ApprovalError("access_denied", "Matter access required.");
  const limit = Math.max(1, Math.min(options.limit ?? 25, 50));
  let cursor: { createdAt: Date; id: string } | undefined;
  if (options.afterId) {
    const [row] = await db
      .select()
      .from(approvalProposals)
      .where(
        and(eq(approvalProposals.id, options.afterId), eq(approvalProposals.matterId, matterId))
      );
    if (!row || !(await readable(actor, row)))
      throw new ApprovalError("access_denied", "Invalid queue cursor.");
    cursor = row;
  }
  // Filter access on the server and scan bounded chunks, never return hidden counts.
  const items: Awaited<ReturnType<typeof getProposal>>[] = [];
  let scanned = 0;
  let lastId: string | undefined;
  while (items.length < limit && scanned < 500) {
    const rows = await db
      .select()
      .from(approvalProposals)
      .where(
        and(
          eq(approvalProposals.matterId, matterId),
          eq(approvalProposals.status, options.status ?? "pending"),
          cursor
            ? or(
                gt(approvalProposals.createdAt, cursor.createdAt),
                and(
                  eq(approvalProposals.createdAt, cursor.createdAt),
                  gt(approvalProposals.id, cursor.id)
                )
              )
            : undefined
        )
      )
      .orderBy(asc(approvalProposals.createdAt), asc(approvalProposals.id))
      .limit(Math.min(50, 500 - scanned));
    if (!rows.length) return { items, nextCursor: null };
    for (const row of rows) {
      scanned++;
      cursor = row;
      lastId = row.id;
      if (await readable(actor, row)) items.push(await getProposal(actor, row.id));
      if (items.length >= limit) break;
    }
  }
  // A cursor itself must be readable; use a separate opaque scan token in a future large queue.
  return { items, nextCursor: items.length && lastId === items.at(-1)?.id ? lastId : null };
}

async function decideProposalInTransaction(tx: Tx, actor: Actor, input: ProposalDecision) {
  const parsed = proposalDecisionSchema.parse(input);
  if (parsed.decision !== "withdraw") human(actor);
  if ((parsed.decision === "reject" || parsed.decision === "withdraw") && !parsed.note?.trim())
    throw new ApprovalError("invalid_input", "A decision note is required.");
  const proposal = await getProposal(actor, parsed.proposalId, tx);
  const fingerprint = approvalHash({ actor, input: parsed });

  // Consistent artifact-before-policy lock order with all cell mutations.
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`tabular_review:${proposal.artifactId}`}))`
  );
  await tx.execute(
    sql`select pg_advisory_xact_lock(hashtext(${`approval-request:${actor.userId}:${parsed.requestId}`}))`
  );
  await requireRoleInTransaction(tx, actor, proposal.matterId, "viewer");
  const [oldDecision] = await tx
    .select()
    .from(commitApprovals)
    .where(
      and(
        eq(commitApprovals.actorId, actor.userId),
        eq(commitApprovals.requestId, parsed.requestId)
      )
    );
  if (oldDecision) {
    if (oldDecision.requestFingerprint !== fingerprint)
      throw new ApprovalError("request_conflict", "Request id already used for another decision.");
    return {
      outcome:
        oldDecision.decision === "approve"
          ? ("applied" as const)
          : oldDecision.decision === "reject"
            ? ("rejected" as const)
            : ("withdrawn" as const),
      decision: oldDecision,
      replayed: true,
    };
  }
  const result = await recordCommitInTransaction(tx, {
    artifactType: "tabular_review",
    artifactId: proposal.artifactId,
    actor,
    op: "decide_proposal",
    message: `${parsed.decision === "approve" ? "Applied" : parsed.decision === "reject" ? "Rejected" : "Withdrew"} cell proposal`,
    apply: async ({ commitId }) => {
      const [live] = await tx
        .select()
        .from(approvalProposals)
        .where(eq(approvalProposals.id, parsed.proposalId))
        .for("update");
      if (
        !live ||
        !(await readable(actor, live, tx)) ||
        !(await canAccessArtifact(actor, "tabular_review", live.artifactId, "editor", tx))
      )
        throw new ApprovalError("access_denied", "Proposal decision access required.");
      if (parsed.decision === "withdraw") {
        if (
          live.proposerId !== actor.userId ||
          (actor.type === "agent" && live.agentLabel !== actor.agentLabel)
        )
          throw new ApprovalError(
            "access_denied",
            "Only the authorized proposer can withdraw this proposal."
          );
      } else await requireRoleInTransaction(tx, actor, live.matterId, live.requiredRole);
      if (
        live.status !== "pending" ||
        parsed.revision !== live.revision ||
        parsed.contentHash !== live.contentHash ||
        approvalHash(live.payload) !== live.contentHash
      )
        throw new ApprovalError("stale_proposal", "Proposal changed or already decided.");
      const matter = await policyInTransaction(tx, actor, live.matterId);
      if (
        parsed.decision === "approve" &&
        (parsed.policyRevision !== live.policyRevision ||
          matter.approvalPolicyRevision !== live.policyRevision)
      )
        throw new ApprovalError(
          "policy_changed",
          "Policy changed; withdraw and create a revised proposal."
        );
      const changes = [];
      if (parsed.decision === "approve") {
        const p = live.payload;
        const [review] = await tx
          .select()
          .from(tabularReviews)
          .where(eq(tabularReviews.id, p.reviewId));
        const [doc] = await tx
          .select()
          .from(documents)
          .where(eq(documents.id, p.documentId))
          .for("share");
        const [cell] = await tx
          .select()
          .from(tabularCells)
          .where(
            and(
              eq(tabularCells.reviewId, p.reviewId),
              eq(tabularCells.documentId, p.documentId),
              eq(tabularCells.columnIndex, p.columnIndex)
            )
          )
          .for("update");
        const col = review?.columnsConfig.find((c) => c.index === p.columnIndex);
        if (
          !review?.documentIds.includes(p.documentId) ||
          !doc ||
          doc.deletedAt !== null ||
          !col ||
          (cell?.lastCommitId ?? null) !== p.baseCellCommitId ||
          doc.currentVersionId !== p.sourceVersionId ||
          approvalHash({ markdown: doc.markdown, version: doc.currentVersionId }) !==
            p.sourceHash ||
          approvalHash(col) !== p.columnHash
        )
          throw new ApprovalError(
            "stale_proposal",
            "Source, column, or accepted cell changed; create a revised proposal."
          );
        const values = {
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
            ...values,
          })
          .onConflictDoUpdate({
            target: [tabularCells.reviewId, tabularCells.documentId, tabularCells.columnIndex],
            set: values,
          });
        await recordFindingRevision(tx, {
          review,
          documentId: p.documentId,
          columnIndex: p.columnIndex,
          commitId,
          content: p.content,
          citations: p.citations,
        });
        const [applied] = await tx
          .select()
          .from(tabularCells)
          .where(
            and(
              eq(tabularCells.reviewId, p.reviewId),
              eq(tabularCells.documentId, p.documentId),
              eq(tabularCells.columnIndex, p.columnIndex)
            )
          );
        changes.push({
          path: `cell/${p.documentId}/${p.columnIndex}`,
          before: cell?.content ?? null,
          after: applied?.content ?? null,
        });
        changes.push({
          path: `cell/${p.documentId}/${p.columnIndex}/citations`,
          before: cell?.citations ?? null,
          after: applied?.citations ?? null,
        });
        changes.push({
          path: `cell/${p.documentId}/${p.columnIndex}/finding`,
          before: cell?.finding ?? null,
          after: applied?.finding ?? null,
        });
        changes.push({
          path: `cell/${p.documentId}/${p.columnIndex}/disposition`,
          before: cell?.disposition ?? null,
          after: applied?.disposition ?? null,
        });
      }
      const status =
        parsed.decision === "approve"
          ? "applied"
          : parsed.decision === "reject"
            ? "rejected"
            : "withdrawn";
      await tx
        .update(approvalProposals)
        .set({ status, lastCommitId: commitId })
        .where(eq(approvalProposals.id, live.id));
      const decisionId = randomUUID();
      const decisionEvidence = {
        id: decisionId,
        proposalId: live.id,
        proposalRevision: live.revision,
        proposalCommitId: live.proposalCommitId,
        contentHash: live.contentHash,
        capturedPolicyRevision: live.policyRevision,
        currentPolicyRevision: matter.approvalPolicyRevision,
        sourceVersionId: live.payload.sourceVersionId,
        baseCellCommitId: live.payload.baseCellCommitId,
        actorId: actor.userId,
        requestId: parsed.requestId,
        requestFingerprint: fingerprint,
        decision: parsed.decision,
        note: parsed.note?.trim() ?? null,
        applicationCommitId: commitId,
      };
      await tx.insert(commitApprovals).values(decisionEvidence);
      changes.push({ path: `approval/${decisionId}`, before: null, after: decisionEvidence });
      changes.push({ path: `proposal/${live.id}/status`, before: "pending", after: status });
      return {
        changes,
        summary: {
          proposalId: live.id,
          proposalCommitId: live.proposalCommitId,
          originalAgent: live.agentLabel,
          originalProposerId: live.proposerId,
          decision: parsed.decision,
          contentHash: live.contentHash,
          policyRevision: live.policyRevision,
          currentPolicyRevision: matter.approvalPolicyRevision,
          decisionId,
          note: parsed.note?.trim() ?? null,
          sourceVersionId: live.payload.sourceVersionId,
          baseCellCommitId: live.payload.baseCellCommitId,
        },
      };
    },
  });
  const [decision] = await tx
    .select()
    .from(commitApprovals)
    .where(
      and(
        eq(commitApprovals.actorId, actor.userId),
        eq(commitApprovals.requestId, parsed.requestId)
      )
    );
  return {
    outcome:
      parsed.decision === "approve"
        ? ("applied" as const)
        : parsed.decision === "reject"
          ? ("rejected" as const)
          : ("withdrawn" as const),
    decision,
    commit: result.commit,
    replayed: false,
  };
}

export async function decideProposal(actor: Actor, input: ProposalDecision) {
  return db.transaction((tx) => decideProposalInTransaction(tx, actor, input));
}

/** Cell-only atomic batches, limited to one reviewed source and approval context. */
export async function decideProposalBatch(actor: Actor, inputs: ProposalDecision[]) {
  human(actor);
  if (
    !inputs.length ||
    inputs.length > 50 ||
    new Set(inputs.map((i) => i.proposalId)).size !== inputs.length ||
    new Set(inputs.map((i) => i.requestId)).size !== inputs.length
  )
    throw new ApprovalError(
      "invalid_input",
      "Choose between 1 and 50 distinct proposals and request ids."
    );
  if (inputs.some((i) => i.decision === "withdraw"))
    throw new ApprovalError("invalid_input", "Withdraw proposals individually.");
  const proposals = await Promise.all(inputs.map((i) => getProposal(actor, i.proposalId)));
  const context = (p: (typeof proposals)[number]) =>
    approvalHash({
      matterId: p.matterId,
      artifactId: p.artifactId,
      policyRevision: p.policyRevision,
      requiredRole: p.requiredRole,
      sourceVersionId: p.payload.sourceVersionId,
      sourceHash: p.payload.sourceHash,
      documentId: p.payload.documentId,
    });
  if (
    new Set(proposals.map(context)).size !== 1 ||
    new Set(inputs.map((i) => i.decision)).size !== 1
  )
    throw new ApprovalError(
      "invalid_input",
      "Batch items must share source, review, policy, authority, and decision."
    );
  return db.transaction(async (tx) => {
    const results = [];
    for (const input of [...inputs].sort((a, b) => a.proposalId.localeCompare(b.proposalId)))
      results.push(await decideProposalInTransaction(tx, actor, input));
    return results;
  });
}
