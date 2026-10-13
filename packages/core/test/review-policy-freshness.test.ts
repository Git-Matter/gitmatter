import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { db, sql } from "@workspace/db/client";
import { documents, tabularReviews, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createDocument } from "../src/content/documents.js";
import { createWorkflow, updateWorkflow } from "../src/platform/workflow.js";
import { runPlaybook } from "../src/ai/tabular/playbook.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import { stageCellProposal, setApprovalPolicy } from "../src/core/approval.js";
import { recordCommit, type Actor } from "../src/core/commit.js";
import { reviewPolicySnapshotCurrent } from "../src/core/review-policy.js";
const userId = `policy-freshness-${randomUUID()}`;
const owner: Actor = { type: "user", userId },
  agent: Actor = { type: "agent", userId, agentLabel: "Synthetic reviewer" };
let tenantId: string, matterId: string, documentId: string, workflowId: string, reviewId: string;
const current = async () => {
  const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
  return reviewPolicySnapshotCurrent(owner, review!);
};
const strictProvider = async () =>
  recordCommit({
    artifactType: "tabular_review",
    artifactId: reviewId,
    actor: agent,
    op: "run_cell",
    message: "Synthetic prepared provider result",
    skipIfNoChanges: true,
    apply: async ({ tx, commitId }) => {
      const proposal = await stageCellProposal(tx, {
        actor: agent,
        commitId,
        reviewId,
        documentId,
        columnIndex: 0,
        content: { summary: "Conforms", flag: "green", reasoning: "Synthetic result" },
        citations: [{ quote: "Synthetic source" }],
        sourceVersionId: null,
        requireCurrentSource: true,
      });
      return proposal ?? { changes: [] };
    },
  });
describe("review source and approved positions cannot be bypassed by direct cell policy", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Synthetic review positions" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values({
      id: userId,
      email: `${userId}@example.com`,
      name: "Synthetic human",
      emailVerified: true,
      tenantId,
    });
    const client = await createClient(userId, tenantId, { name: "Synthetic client" });
    matterId = (await createMatter(userId, { clientId: client.id, name: "Synthetic matter" })).id;
    documentId = (
      await createDocument(userId, {
        matterId,
        title: "Synthetic text",
        markdown: "Synthetic source",
      })
    ).id;
    workflowId = await createWorkflow(owner, {
      matterId,
      title: "Synthetic playbook",
      type: "playbook",
      promptMd: "",
      status: "approved",
      rules: [
        {
          id: "rule-1",
          clauseType: "Synthetic rule",
          standardPosition: "Synthetic source",
          severity: "red",
        },
      ],
    });
    reviewId = (
      await runPlaybook(owner, { playbookId: workflowId, matterId, documentIds: [documentId] })
    ).reviewId;
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
    await sql.end();
  });
  test("proposal-only audit entries retain the accepted playbook revision", async () => {
    expect(await current()).toBe(true);
    await setApprovalPolicy(owner, matterId, {
      policy: { agentCells: "direct", agentWorkflows: "owner" },
      expectedRevision: 0,
      reason: "Synthetic workflow gate",
    });
    await updateWorkflow(agent, workflowId, { title: "Pending proposed title" });
    expect(await current()).toBe(true);
    expect((await strictProvider()).commit).toBeNull();
  });
  test("direct prepared provider output rejects source drift, while native historical findings keep their pinned source", async () => {
    await db
      .update(documents)
      .set({ currentVersionId: randomUUID() })
      .where(eq(documents.id, documentId));
    await expect(strictProvider()).rejects.toMatchObject({ code: "stale_proposal" });
    await writeCell(agent, {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "Historical source still conforms",
      flag: "green",
      reasoning: "Explicit native finding on immutable reviewed source",
      citations: [{ quote: "Synthetic source" }],
    });
    await db.update(documents).set({ currentVersionId: null }).where(eq(documents.id, documentId));
  });
  test("material accepted playbook changes and deprecation block a prepared output under direct policy", async () => {
    await updateWorkflow(owner, workflowId, {
      rules: [
        {
          id: "rule-1",
          clauseType: "Changed accepted rule",
          standardPosition: "Changed position",
          severity: "red",
        },
      ],
    });
    expect(await current()).toBe(false);
    await expect(strictProvider()).rejects.toMatchObject({ code: "stale_proposal" });
    await updateWorkflow(owner, workflowId, { status: "deprecated" });
    await expect(strictProvider()).rejects.toMatchObject({ code: "stale_proposal" });
  });
});
