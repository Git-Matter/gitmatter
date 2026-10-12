import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import {
  approvalProposals,
  commitApprovals,
  documents,
  matterMembers,
  tabularCells,
  tenants,
  user,
} from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import { getUserTenant, sameTenant, hasClientAccess } from "../src/core/access.js";
import { setFindingDisposition } from "../src/ai/tabular/contract-review.js";
import { createReview } from "../src/ai/tabular/reviews.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import {
  approvalHash,
  decideProposal,
  decideProposalBatch,
  getApprovalPolicy,
  getProposal,
  listProposals,
  setApprovalPolicy,
} from "../src/core/approval.js";
import { listCommits, type Actor } from "../src/core/commit.js";
import { buildToolCatalog } from "../src/tools/catalog.js";

const ownerId = `approval-owner-${randomUUID()}`;
const editorId = `approval-editor-${randomUUID()}`;
const viewerId = `approval-viewer-${randomUUID()}`;
const owner: Actor = { type: "user", userId: ownerId };
const editor: Actor = { type: "user", userId: editorId };
const viewer: Actor = { type: "user", userId: viewerId };
const agent: Actor = { type: "agent", userId: ownerId, agentLabel: "mcp:approval-fixture" };
let tenantId: string, matterId: string, documentId: string, reviewId: string, clientId: string;
const write = (actor: Actor, columnIndex: number, summary: string) =>
  writeCell(actor, {
    reviewId,
    documentId,
    columnIndex,
    summary,
    flag: "red",
    reasoning: "Synthetic rationale",
    citations: [{ quote: "Synthetic source" }],
  });
const accepted = async (columnIndex: number) =>
  (
    await db
      .select()
      .from(tabularCells)
      .where(
        and(
          eq(tabularCells.reviewId, reviewId),
          eq(tabularCells.documentId, documentId),
          eq(tabularCells.columnIndex, columnIndex)
        )
      )
  )[0];
const stage = async (columnIndex: number, summary: string) => {
  const result = await write(agent, columnIndex, summary);
  const receipt = result.commit?.summary as { outcome?: string; proposalId?: string } | null;
  expect(receipt?.outcome).toBe("proposed");
  return getProposal(owner, receipt!.proposalId!);
};
const decision = (
  p: Awaited<ReturnType<typeof getProposal>>,
  kind: "approve" | "reject" = "approve"
) => ({
  requestId: randomUUID(),
  proposalId: p.id,
  revision: p.revision,
  contentHash: p.contentHash,
  policyRevision: p.policyRevision,
  decision: kind,
  ...(kind === "reject" ? { note: "Synthetic rejection reason" } : {}),
});
const policy = async (gate: "direct" | "editor" | "owner") =>
  setApprovalPolicy(owner, matterId, {
    policy: { agentCells: gate },
    expectedRevision: (await getApprovalPolicy(owner, matterId)).revision,
    reason: "Synthetic policy test",
  });

// Real Postgres round trips run alongside the monorepo integration suite.
describe("audited cell approval policy", { timeout: 15_000 }, () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Synthetic approval acceptance" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values(
      [ownerId, editorId, viewerId].map((id) => ({
        id,
        name: "Synthetic reviewer",
        email: `${id}@example.com`,
        emailVerified: true,
        tenantId,
      }))
    );
    const client = await createClient(ownerId, tenantId, { name: "Synthetic client" });
    clientId = client.id;
    matterId = (
      await createMatter(ownerId, { clientId: client.id, name: "Synthetic approval matter" })
    ).id;
    await db.insert(matterMembers).values([
      { matterId, userId: editorId, role: "editor" },
      { matterId, userId: viewerId, role: "viewer" },
    ]);
    const [doc] = await db
      .insert(documents)
      .values({
        userId: ownerId,
        tenantId,
        matterId,
        title: "Synthetic source",
        fileType: "txt",
        markdown: "Synthetic source",
        status: "ready",
      })
      .returning();
    documentId = doc!.id;
    reviewId = await createReview(owner, {
      title: "Synthetic approval review",
      matterId,
      documentIds: [documentId],
      columnsConfig: Array.from({ length: 25 }, (_, index) => ({
        index,
        name: `Column ${index}`,
        prompt: "Synthetic extraction",
      })),
    });
  });
  afterAll(async () => {
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(and(eq(user.id, ownerId)));
    await db.delete(user).where(eq(user.id, editorId));
    await db.delete(user).where(eq(user.id, viewerId));
    await sql.end();
  });
  test("legacy defaults keep direct writes attributable", async () => {
    expect((await getApprovalPolicy(owner, matterId)).policy.agentCells).toBe("direct");
    await write(agent, 0, "Legacy direct result");
    expect((await accepted(0))?.content?.summary).toBe("Legacy direct result");
    expect((await listCommits("tabular_review", reviewId))[0]?.actorType).toBe("agent");
  });
  test("policy is owner-human only and has a durable baseline/revision", async () => {
    await expect(
      setApprovalPolicy(agent, matterId, {
        policy: { agentCells: "owner" },
        expectedRevision: 0,
        reason: "Synthetic",
      })
    ).rejects.toMatchObject({ code: "access_denied" });
    await expect(
      setApprovalPolicy(editor, matterId, {
        policy: { agentCells: "owner" },
        expectedRevision: 0,
        reason: "Synthetic",
      })
    ).rejects.toMatchObject({ code: "access_denied" });
    await policy("owner");
    const commits = await listCommits("matter", matterId);
    expect(commits[0]?.op).toBe("approval_policy");
    expect(commits[0]?.actorId).toBe(ownerId);
  });
  test("staged content stays separate; exact owner decision and replay apply once", async () => {
    const p = await stage(0, "Proposed replacement");
    expect((await accepted(0))?.content?.summary).toBe("Legacy direct result");
    expect(p.payload.beforeContent?.summary).toBe("Legacy direct result");
    expect((await listProposals(owner, matterId)).items.map((item) => item.id)).toContain(p.id);
    await expect(decideProposal(agent, decision(p))).rejects.toMatchObject({
      code: "access_denied",
    });
    await expect(decideProposal(editor, decision(p))).rejects.toMatchObject({
      code: "access_denied",
    });
    await expect(
      decideProposal(owner, { ...decision(p), contentHash: "0".repeat(64) })
    ).rejects.toMatchObject({ code: "stale_proposal" });
    const input = decision(p);
    const first = await decideProposal(owner, input);
    const replay = await decideProposal(owner, input);
    expect(first.replayed).toBe(false);
    expect(replay.replayed).toBe(true);
    expect(first.decision?.id).toBe(replay.decision?.id);
    expect((await accepted(0))?.content?.summary).toBe("Proposed replacement");
    await expect(
      decideProposal(owner, { ...input, note: "Different input" })
    ).rejects.toMatchObject({ code: "request_conflict" });
    const history = await listCommits("tabular_review", reviewId);
    expect(history[0]?.actorType).toBe("user");
    expect(history[0]?.actorId).toBe(ownerId);
    expect(history[0]?.summary).toMatchObject({
      originalAgent: agent.type === "agent" ? agent.agentLabel : "",
      proposalId: p.id,
    });
  });
  test("rejection is durable and does not change accepted content", async () => {
    const p = await stage(1, "Rejected proposal");
    await decideProposal(owner, decision(p, "reject"));
    expect((await accepted(1))?.content).toBeNull();
    expect((await getProposal(owner, p.id)).status).toBe("rejected");
    const [entry] = await db
      .select()
      .from(commitApprovals)
      .where(eq(commitApprovals.proposalId, p.id));
    expect(entry?.note).toBe("Synthetic rejection reason");
  });
  test("unrelated lifecycle commits do not stale accepted-cell binding", async () => {
    const one = await stage(2, "First independent proposal");
    const two = await stage(3, "Second independent proposal");
    await decideProposal(owner, decision(one));
    await decideProposal(owner, decision(two));
    expect((await accepted(2))?.content?.summary).toBe("First independent proposal");
    expect((await accepted(3))?.content?.summary).toBe("Second independent proposal");
  });
  test("source drift and both policy strengthening/weakening fail closed", async () => {
    const source = await stage(4, "Source drift proposal");
    await db
      .update(documents)
      .set({ markdown: "Synthetic changed source" })
      .where(eq(documents.id, documentId));
    await expect(decideProposal(owner, decision(source))).rejects.toMatchObject({
      code: "stale_proposal",
    });
    await db
      .update(documents)
      .set({ markdown: "Synthetic source" })
      .where(eq(documents.id, documentId));
    const p = await stage(5, "Policy drift proposal");
    await policy("editor");
    await expect(decideProposal(owner, decision(p))).rejects.toMatchObject({
      code: "policy_changed",
    });
    await policy("direct");
    await expect(decideProposal(owner, decision(p))).rejects.toMatchObject({
      code: "policy_changed",
    });
    await decideProposal(owner, decision(p, "reject"));
    await policy("owner");
  });
  test("competing reviewers produce one terminal decision", async () => {
    const p = await stage(6, "Concurrent proposal");
    const results = await Promise.allSettled([
      decideProposal(owner, decision(p)),
      decideProposal(owner, decision(p)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(
      await db.select().from(commitApprovals).where(eq(commitApprovals.proposalId, p.id))
    ).toHaveLength(1);
  });
  test("batch stale member rolls back every decision and content change", async () => {
    const one = await stage(7, "Batch first"),
      two = await stage(8, "Batch second");
    await write(owner, 8, "New accepted value");
    await expect(decideProposalBatch(owner, [decision(one), decision(two)])).rejects.toMatchObject({
      code: "stale_proposal",
    });
    expect((await getProposal(owner, one.id)).status).toBe("pending");
    expect((await accepted(7))?.content).toBeNull();
    expect(
      await db.select().from(commitApprovals).where(eq(commitApprovals.proposalId, one.id))
    ).toHaveLength(0);
  });
  test("successful batches preserve individual decisions and exact replay", async () => {
    const one = await stage(9, "Successful batch first"),
      two = await stage(10, "Successful batch second");
    const inputs = [decision(one), decision(two)];
    const results = await decideProposalBatch(owner, inputs);
    expect(results).toHaveLength(2);
    expect(results.every((r) => r.outcome === "applied")).toBe(true);
    expect((await decideProposalBatch(owner, inputs)).every((r) => r.replayed)).toBe(true);
    expect((await accepted(9))?.content?.summary).toBe("Successful batch first");
    expect((await getProposal(owner, two.id)).decisions).toHaveLength(1);
  });
  test("withdrawal receipts bind the actual agent and retain lifecycle evidence", async () => {
    const p = await stage(11, "Withdrawal proposal");
    const input = {
      ...decision(p),
      decision: "withdraw" as const,
      note: "Synthetic withdrawal reason",
    };
    await decideProposal(agent, input);
    expect((await decideProposal(agent, input)).replayed).toBe(true);
    const another: Actor = {
      type: "agent",
      userId: ownerId,
      agentLabel: "Another connected agent",
    };
    await expect(decideProposal(another, input)).rejects.toMatchObject({
      code: "request_conflict",
    });
    expect((await accepted(11))?.content).toBeNull();
    expect((await getProposal(owner, p.id)).status).toBe("withdrawn");
  });
  test("tampered proposed content cannot reuse an earlier hash", async () => {
    const p = await stage(12, "Exact proposal hash");
    await db
      .update(approvalProposals)
      .set({
        payload: {
          ...p.payload,
          content: { ...p.payload.content, summary: "Changed after inspection" },
        },
      })
      .where(eq(approvalProposals.id, p.id));
    await expect(decideProposal(owner, decision(p))).rejects.toMatchObject({
      code: "stale_proposal",
    });
    expect((await accepted(12))?.content).toBeNull();
    // Restore immutable fixture data so the later integrity scan is meaningful.
    await db
      .update(approvalProposals)
      .set({ payload: p.payload })
      .where(eq(approvalProposals.id, p.id));
  });
  test("editor policy is enforced and revoked membership invalidates decisions", async () => {
    await policy("editor");
    const p = await stage(13, "Editor approved proposal");
    await decideProposal(editor, decision(p));
    expect((await accepted(13))?.createdBy).toBe(editorId);
    const pending = await stage(14, "Revoked editor proposal");
    await db
      .delete(matterMembers)
      .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, editorId)));
    await expect(decideProposal(editor, decision(pending))).rejects.toMatchObject({
      code: "access_denied",
    });
    await policy("owner");
  });
  test("owner-gated finding decisions bind policy while editors can request escalation", async () => {
    await db
      .insert(matterMembers)
      .values({ matterId, userId: editorId, role: "editor" })
      .onConflictDoNothing();
    const cell = await accepted(0);
    const revisionId = cell!.lastCommitId!;
    await db
      .update(tabularCells)
      .set({
        finding: {
          revisionId,
          sourceVersionId: null,
          sourceHeadCommitId: null,
          ruleId: "synthetic-risk",
          outcome: "deviates",
          citationsValid: true,
        },
      })
      .where(eq(tabularCells.id, cell!.id));
    await setApprovalPolicy(owner, matterId, {
      policy: { agentCells: "owner", escalationDecisions: "owner" },
      expectedRevision: (await getApprovalPolicy(owner, matterId)).revision,
      reason: "Synthetic owner review gate",
    });
    const policyRevision = (await getApprovalPolicy(owner, matterId)).revision;
    const input = {
      documentId,
      columnIndex: 0,
      revisionId,
      status: "left_unchanged" as const,
      rationale: "Synthetic negotiated exception",
      policyRevision,
    };
    await expect(setFindingDisposition(agent, reviewId, input)).rejects.toThrow("access_denied");
    await expect(setFindingDisposition(editor, reviewId, input)).rejects.toMatchObject({
      code: "access_denied",
    });
    await setFindingDisposition(editor, reviewId, { ...input, status: "escalated" });
    expect((await accepted(0))?.disposition?.status).toBe("escalated");
    await expect(
      setFindingDisposition(owner, reviewId, { ...input, policyRevision: undefined })
    ).rejects.toMatchObject({ code: "policy_changed" });
    await setFindingDisposition(owner, reviewId, input);
    expect((await accepted(0))?.disposition).toMatchObject({
      status: "left_unchanged",
      actorId: ownerId,
      policyRevision,
      requiredRole: "owner",
    });
    await setApprovalPolicy(owner, matterId, {
      policy: { agentCells: "owner", escalationDecisions: "editor" },
      expectedRevision: policyRevision,
      reason: "Synthetic revised review gate",
    });
    await expect(setFindingDisposition(owner, reviewId, input)).rejects.toMatchObject({
      code: "policy_changed",
    });
  });
  test("decision reads use the transaction connection without borrowing a second pool slot", async () => {
    const p = await stage(0, "Transaction-bound application");
    // With a saturated pool, any db.select here would wait forever for a second
    // connection. Fail that dependency directly instead of opening 20 sockets.
    const outsideRead = vi.spyOn(db, "select").mockImplementation(() => {
      throw new Error("Approval borrowed another database connection");
    });
    try {
      expect((await decideProposal(owner, decision(p))).outcome).toBe("applied");
      await db.transaction(async (tx) => {
        expect(await getUserTenant(ownerId, tx)).toBe(tenantId);
        expect(await sameTenant(ownerId, tenantId, tx)).toBe(true);
        expect(await hasClientAccess(owner, clientId, "owner", tx)).toBe(true);
      });
    } finally {
      outsideRead.mockRestore();
    }
    expect((await accepted(0))?.content?.summary).toBe("Transaction-bound application");
  });
  test("twenty concurrent decisions complete with every pool connection in use", async () => {
    const proposals = [];
    for (let column = 0; column < 20; column++)
      proposals.push(await stage(column, `Pool concurrency proposal ${column}`));
    const results = await Promise.all(proposals.map((p) => decideProposal(owner, decision(p))));
    expect(results).toHaveLength(20);
    expect(results.every((r) => r.outcome === "applied" && !r.replayed)).toBe(true);
    expect(new Set(results.map((r) => r.decision?.id)).size).toBe(20);
    for (const [column, proposal] of proposals.entries())
      expect((await accepted(column))?.content?.summary).toBe(proposal.payload.content.summary);
  }, 30_000);
  test("role/scope clamp and revoked access cannot stage or read the queue", async () => {
    const restricted: Actor = {
      ...agent,
      type: "agent",
      agentLabel: "Restricted",
      scope: { matterIds: [matterId], maxRole: "viewer" },
    };
    await expect(write(restricted, 9, "Restricted write")).rejects.toThrow("access_denied");
    const outside: Actor = {
      ...agent,
      type: "agent",
      agentLabel: "Outside",
      scope: { matterIds: [randomUUID()], maxRole: "owner" },
    };
    await expect(listProposals(outside, matterId)).rejects.toMatchObject({ code: "access_denied" });
    await expect(write(viewer, 9, "Viewer write")).rejects.toThrow("access_denied");
    await db
      .delete(matterMembers)
      .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, editorId)));
    await expect(listProposals(editor, matterId)).rejects.toMatchObject({ code: "access_denied" });
    await db
      .delete(matterMembers)
      .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, viewerId)));
    await db.update(user).set({ tenantRole: "admin" }).where(eq(user.id, viewerId));
    await expect(listProposals(viewer, matterId)).rejects.toMatchObject({ code: "access_denied" });
    const proposals = await db
      .select()
      .from(approvalProposals)
      .where(eq(approvalProposals.matterId, matterId));
    expect(proposals.every((p) => approvalHash(p.payload) === p.contentHash)).toBe(true);
  });
  test("agent catalogs expose inspection/withdrawal and exclude human approval", () => {
    const catalog = buildToolCatalog(agent, {
      jurisdiction: "US",
      defaultMatterLabel: "Synthetic",
      executionMode: "subscription",
    });
    expect(catalog.map((t) => t.name)).toEqual(
      expect.arrayContaining([
        "get_approval_policy",
        "list_proposals",
        "get_proposal",
        "withdraw_proposal",
      ])
    );
    expect(catalog.map((t) => t.name)).not.toContain("decide_proposal");
    expect(catalog.map((t) => t.name)).not.toContain("decide_proposal_batch");
  });
});
