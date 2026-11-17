import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { matterMembers, tenants, user, workflows } from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createWorkflow, updateWorkflow } from "../src/platform/workflow.js";
import {
  decideProposal,
  getApprovalPolicy,
  getProposal,
  listProposals,
  setApprovalPolicy,
} from "../src/core/approval.js";
import { getCommitChanges, listCommits, type Actor } from "../src/core/commit.js";
const ownerId = `workflow-approval-owner-${randomUUID()}`,
  editorId = `workflow-approval-editor-${randomUUID()}`;
const owner: Actor = { type: "user", userId: ownerId },
  editor: Actor = { type: "user", userId: editorId },
  agent: Actor = { type: "agent", userId: ownerId, agentLabel: "Synthetic workflow proposer" };
let tenantId: string, matterId: string, workflowId: string;
const policy = async (gate: "direct" | "editor" | "owner") =>
  setApprovalPolicy(owner, matterId, {
    policy: { agentCells: "direct", agentWorkflows: gate },
    expectedRevision: (await getApprovalPolicy(owner, matterId)).revision,
    reason: "Synthetic workflow approval gate",
  });
const decision = (
  proposal: Awaited<ReturnType<typeof getProposal>>,
  kind: "approve" | "reject" = "approve"
) => ({
  requestId: randomUUID(),
  proposalId: proposal.id,
  revision: proposal.revision,
  contentHash: proposal.contentHash,
  policyRevision: proposal.policyRevision,
  decision: kind,
  ...(kind === "reject" ? { note: "Synthetic rejection" } : {}),
});
const row = async () => (await db.select().from(workflows).where(eq(workflows.id, workflowId)))[0];
const proposedUpdate = async (title: string) => {
  const result = await updateWorkflow(agent, workflowId, { title });
  const proposal = await getProposal(
    owner,
    (result.commit!.summary as { proposalId: string }).proposalId
  );
  if (proposal.kind !== "workflow") throw new Error("Expected workflow proposal");
  return proposal;
};
describe("immutable matter workflow approval proposals", { timeout: 15_000 }, () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Synthetic workflow approval firm" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values(
      [ownerId, editorId].map((id) => ({
        id,
        name: "Synthetic human",
        email: `${id}@example.com`,
        emailVerified: true,
        tenantId,
      }))
    );
    const client = await createClient(ownerId, tenantId, {
      name: "Synthetic workflow approval client",
    });
    matterId = (
      await createMatter(ownerId, {
        clientId: client.id,
        name: "Synthetic workflow approval matter",
      })
    ).id;
    await db.insert(matterMembers).values({ matterId, userId: editorId, role: "editor" });
  });
  afterAll(async () => {
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, ownerId));
    await db.delete(user).where(eq(user.id, editorId));
    await sql.end();
  });
  test("gated agent creation records exact proposed content without a usable workflow", async () => {
    await policy("owner");
    workflowId = await createWorkflow(agent, {
      matterId,
      title: "Proposed workflow",
      type: "assistant",
      promptMd: "Proposed synthetic instructions",
    });
    expect(await row()).toBeUndefined();
    const proposal = (await listProposals(owner, matterId)).items.find(
      (p) => p.artifactId === workflowId
    )!;
    expect(proposal.kind).toBe("workflow");
    expect(proposal.status).toBe("pending");
    await expect(decideProposal(agent, decision(proposal))).rejects.toMatchObject({
      code: "access_denied",
    });
    await expect(decideProposal(editor, decision(proposal))).rejects.toMatchObject({
      code: "access_denied",
    });
    const result = await decideProposal(owner, decision(proposal));
    expect((await row())?.title).toBe("Proposed workflow");
    expect((await row())?.headCommitId).toBe(result.commit?.id);
    expect(result.commit?.actorType).toBe("user");
    expect(result.commit?.summary).toMatchObject({ originalAgent: "Synthetic workflow proposer" });
    expect(await getCommitChanges(result.commit!.id)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "field/prompt_md",
          before: null,
          after: "Proposed synthetic instructions",
        }),
      ])
    );
  });
  test("staging other proposals advances audit head without changing accepted content or staling peers", async () => {
    const first = await proposedUpdate("First exact candidate");
    await proposedUpdate("Second exact candidate");
    expect((await row())?.title).toBe("Proposed workflow");
    expect((await getProposal(owner, first.id)).stale).toBe(false);
    const input = decision(first);
    await decideProposal(owner, input);
    expect((await row())?.title).toBe("First exact candidate");
    expect((await decideProposal(owner, input)).replayed).toBe(true);
  });
  test("source and policy changes invalidate displayed proposals and apply nothing", async () => {
    const proposal = await proposedUpdate("Stale candidate");
    await updateWorkflow(owner, workflowId, { promptMd: "Changed accepted prompt" });
    await expect(decideProposal(owner, decision(proposal))).rejects.toMatchObject({
      code: "stale_proposal",
    });
    await decideProposal(owner, decision(proposal, "reject"));
    const next = await proposedUpdate("Captured under owner policy");
    await policy("editor");
    await expect(decideProposal(owner, decision(next))).rejects.toMatchObject({
      code: "policy_changed",
    });
    expect((await row())?.title).toBe("First exact candidate");
    await decideProposal(owner, decision(next, "reject"));
  });
  test("current editor gate applies exact proposed fields, concurrent decisions have one terminal outcome", async () => {
    const proposal = await proposedUpdate("Editor approved candidate");
    const results = await Promise.allSettled([
      decideProposal(editor, decision(proposal)),
      decideProposal(owner, decision(proposal)),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await row())?.title).toBe("Editor approved candidate");
    expect((await listCommits("workflow", workflowId))[0]?.op).toBe("decide_proposal");
  });
  test("matter gate cannot grant firm Library publication authority", async () => {
    await expect(
      createWorkflow(agent, {
        title: "Illegal firm publication",
        type: "playbook",
        promptMd: "",
        status: "approved",
      })
    ).rejects.toThrow("human firm admin");
  });
});
