import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { matterMembers, tenants, user, workflows } from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createWorkflow, updateWorkflow } from "../src/platform/workflow.js";
import { getCommitChanges, listCommits, type Actor } from "../src/core/commit.js";

const ownerId = `workflow-owner-${randomUUID()}`,
  viewerId = `workflow-viewer-${randomUUID()}`;
const human: Actor = { type: "user", userId: ownerId };
const agent: Actor = { type: "agent", userId: ownerId, agentLabel: "Synthetic workflow agent" };
let tenantId: string,
  otherTenantId: string,
  matterId: string,
  firmId: string,
  matterWorkflowId: string;
const input = {
  title: "Synthetic workflow",
  type: "playbook" as const,
  promptMd: "Synthetic prompt",
  rules: [],
};
describe("workflow mutation core authority", () => {
  beforeAll(async () => {
    const tenantsCreated = await db
      .insert(tenants)
      .values([{ name: "Synthetic workflow firm" }, { name: "Other synthetic firm" }])
      .returning();
    tenantId = tenantsCreated[0]!.id;
    otherTenantId = tenantsCreated[1]!.id;
    await db.insert(user).values(
      [ownerId, viewerId].map((id) => ({
        id,
        name: "Synthetic author",
        email: `${id}@example.com`,
        tenantId,
        emailVerified: true,
      }))
    );
    const client = await createClient(ownerId, tenantId, { name: "Synthetic workflow client" });
    matterId = (
      await createMatter(ownerId, { clientId: client.id, name: "Synthetic workflow matter" })
    ).id;
    await db.insert(matterMembers).values({ matterId, userId: viewerId, role: "viewer" });
  });
  afterAll(async () => {
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
    if (otherTenantId) await db.delete(tenants).where(eq(tenants.id, otherTenantId));
    await db.delete(user).where(eq(user.id, ownerId));
    await db.delete(user).where(eq(user.id, viewerId));
    await sql.end();
  });
  test("draft authors can edit without acquiring firm publication authority", async () => {
    firmId = await createWorkflow(human, input);
    await updateWorkflow(human, firmId, { title: "Human draft" });
    await updateWorkflow(agent, firmId, { promptMd: "Agent draft, not publication" });
    await expect(updateWorkflow(human, firmId, { status: "approved" })).rejects.toThrow(
      "human firm admin"
    );
    await expect(createWorkflow(human, { ...input, status: "approved" })).rejects.toThrow(
      "human firm admin"
    );
    const [draft] = await db.select().from(workflows).where(eq(workflows.id, firmId));
    expect(draft?.status).toBe("draft");
  });
  test("only human firm admins publish and alter published Library content", async () => {
    await db.update(user).set({ tenantRole: "admin" }).where(eq(user.id, ownerId));
    await expect(updateWorkflow(agent, firmId, { status: "approved" })).rejects.toThrow(
      "human firm admin"
    );
    await updateWorkflow(human, firmId, { status: "approved" });
    await expect(updateWorkflow(agent, firmId, { title: "Agent bypass" })).rejects.toThrow(
      "human firm admin"
    );
    await db.update(user).set({ tenantRole: "member" }).where(eq(user.id, ownerId));
    await expect(
      updateWorkflow(human, firmId, { status: "draft", title: "Owner bypass" })
    ).rejects.toThrow("human firm admin");
    expect((await db.select().from(workflows).where(eq(workflows.id, firmId)))[0]?.title).toBe(
      "Human draft"
    );
  });
  test("tenant injection, scoped tokens, and viewer roles cannot bypass creation", async () => {
    await expect(createWorkflow(human, { ...input, tenantId: otherTenantId })).rejects.toThrow(
      "access_denied"
    );
    const scoped: Actor = {
      type: "agent",
      userId: ownerId,
      agentLabel: "Scoped",
      scope: { matterIds: [matterId], maxRole: "editor" },
    };
    await expect(createWorkflow(scoped, input)).rejects.toThrow("access_denied");
    await expect(
      createWorkflow(
        { ...scoped, scope: { matterIds: [randomUUID()], maxRole: "owner" } },
        { ...input, matterId }
      )
    ).rejects.toThrow("access_denied");
    await expect(
      createWorkflow(
        { ...scoped, scope: { matterIds: [matterId], maxRole: "viewer" } },
        { ...input, matterId }
      )
    ).rejects.toThrow("access_denied");
    await expect(
      createWorkflow({ type: "user", userId: viewerId }, { ...input, matterId })
    ).rejects.toThrow("access_denied");
    matterWorkflowId = await createWorkflow(scoped, { ...input, matterId });
    await updateWorkflow(scoped, matterWorkflowId, { promptMd: "Authorized matter draft" });
  });
  test("revoked membership denies even an intrinsic workflow owner", async () => {
    await db
      .update(matterMembers)
      .set({ role: "viewer" })
      .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, ownerId)));
    await expect(
      updateWorkflow(human, matterWorkflowId, { promptMd: "No longer permitted" })
    ).rejects.toThrow("access_denied");
    await db
      .update(matterMembers)
      .set({ role: "owner" })
      .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, ownerId)));
  });
  test("concurrent edits record the true previous content under the artifact lock", async () => {
    await Promise.all([
      updateWorkflow(human, matterWorkflowId, { title: "Concurrent A" }),
      updateWorkflow(human, matterWorkflowId, { title: "Concurrent B" }),
    ]);
    const history = (await listCommits("workflow", matterWorkflowId))
      .filter((c) => c.op === "update")
      .sort((a, b) => a.seq - b.seq);
    const titleChanges = (await Promise.all(history.map((c) => getCommitChanges(c.id))))
      .flat()
      .filter((c) => c.path === "field/title");
    expect(titleChanges).toHaveLength(2);
    expect(titleChanges[1]?.before).toBe(titleChanges[0]?.after);
  });
});
