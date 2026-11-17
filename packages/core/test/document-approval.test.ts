import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { and, eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import {
  documents,
  documentEdits,
  documentEditDecisions,
  matterDocuments,
  matterMembers,
  tenants,
  user,
} from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import {
  createDocument,
  getDocumentDetail,
  proposeEdit,
  resolveEdit,
  resolveEdits,
  resolveAllEdits,
} from "../src/content/documents.js";
import { getApprovalPolicy, setApprovalPolicy } from "../src/core/approval.js";
import { assertApprovedDocumentBaseline } from "../src/core/document-approval.js";
import { listCommits, type Actor } from "../src/core/commit.js";

const ownerId = `document-policy-owner-${randomUUID()}`,
  editorId = `document-policy-editor-${randomUUID()}`;
const owner: Actor = { type: "user", userId: ownerId },
  editor: Actor = { type: "user", userId: editorId };
const agent: Actor = { type: "agent", userId: ownerId, agentLabel: "Synthetic document agent" };
let tenantId: string, matterId: string, documentId: string, clientId: string;
const policy = async (role: "editor" | "owner") =>
  setApprovalPolicy(owner, matterId, {
    policy: { agentCells: "direct", documentEdits: role },
    expectedRevision: (await getApprovalPolicy(owner, matterId)).revision,
    reason: "Synthetic document policy",
  });
const context = async () => {
  const detail = await getDocumentDetail(documentId, owner);
  return {
    expectedHeadCommitId: detail!.document.headCommitId,
    approvalContext: detail!.resolutionPolicy.approvalContext ?? undefined,
  };
};
const doc = async () => (await db.select().from(documents).where(eq(documents.id, documentId)))[0]!;
describe("accepted document baseline and exact human policy decisions", { timeout: 15_000 }, () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Synthetic document policy firm" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values(
      [ownerId, editorId].map((id) => ({
        id,
        email: `${id}@example.com`,
        name: "Synthetic human",
        tenantId,
        emailVerified: true,
      }))
    );
    const client = await createClient(ownerId, tenantId, { name: "Synthetic document client" });
    clientId = client.id;
    matterId = (await createMatter(ownerId, { clientId, name: "Synthetic document matter" })).id;
    await db.insert(matterMembers).values({ matterId, userId: editorId, role: "editor" });
    documentId = (
      await createDocument(ownerId, {
        matterId,
        title: "Synthetic text contract",
        markdown: "Term alpha. Term beta.",
      })
    ).id;
  });
  afterAll(async () => {
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, ownerId));
    await db.delete(user).where(eq(user.id, editorId));
    await sql.end();
  });
  test("proposals preserve accepted source and pending text cannot be clean exported", async () => {
    await proposeEdit(agent, documentId, [
      { find: "alpha", replace: "approved alpha" },
      { find: "beta", replace: "approved beta" },
    ]);
    expect((await doc()).approvedMarkdown).toBe("Term alpha. Term beta.");
    await expect(
      db.transaction(async (tx) => assertApprovedDocumentBaseline(tx, await doc()))
    ).rejects.toThrow("Resolve the current");
    await expect(resolveAllEdits(agent, documentId, "accept")).rejects.toThrow("A person");
  });
  test("owner policy denies an editor and an unbound human request", async () => {
    await policy("owner");
    expect((await getDocumentDetail(documentId, editor))!.resolutionPolicy.mayResolve).toBe(false);
    await expect(
      resolveAllEdits(editor, documentId, "accept", await context())
    ).rejects.toMatchObject({ code: "access_denied" });
    await expect(resolveAllEdits(owner, documentId, "accept")).rejects.toMatchObject({
      code: "policy_changed",
    });
    expect((await doc()).markdown).toBe("Term alpha. Term beta.");
  });
  test("one decision binds exact content/current draft/policy; partial review retains baseline", async () => {
    const edits = (await getDocumentDetail(documentId, owner))!.edits;
    const binding = await context();
    await resolveEdit(owner, documentId, edits[0]!.changeId, "accept", binding);
    expect((await doc()).markdown).toBe("Term approved alpha. Term beta.");
    expect((await doc()).approvedMarkdown).toBe("Term alpha. Term beta.");
    await expect(
      resolveEdit(owner, documentId, edits[1]!.changeId, "accept", binding)
    ).rejects.toMatchObject({ code: "stale_proposal" });
    await resolveEdit(owner, documentId, edits[1]!.changeId, "reject", await context());
    expect((await doc()).approvedMarkdown).toBe("Term approved alpha. Term beta.");
    const decisions = await db
      .select()
      .from(documentEditDecisions)
      .where(eq(documentEditDecisions.documentId, documentId));
    expect(decisions).toHaveLength(2);
    expect(decisions.every((d) => d.actorId === ownerId && d.contentHash.length === 64)).toBe(true);
    expect((await listCommits("document", documentId))[0]!.actorType).toBe("user");
    await db.transaction(async (tx) => assertApprovedDocumentBaseline(tx, await doc()));
  });
  test("legacy changes demand an explicit current human decision without fabricating provenance", async () => {
    const [legacy] = await db
      .insert(documentEdits)
      .values({
        documentId,
        changeId: randomUUID(),
        deletedText: "beta",
        insertedText: "legacy beta",
        createdBy: ownerId,
      })
      .returning();
    await resolveEdit(owner, documentId, legacy!.changeId, "reject", await context());
    const [decision] = await db
      .select()
      .from(documentEditDecisions)
      .where(eq(documentEditDecisions.editId, legacy!.id));
    expect(decision?.legacy).toBe(true);
    expect(decision?.proposedVersionId).toBeNull();
  });
  test("shared owner policy fails closed across current and captured matter links", async () => {
    const second = (await createMatter(ownerId, { clientId, name: "Other synthetic matter" })).id;
    await db.insert(matterDocuments).values({ documentId, matterId: second });
    await expect(
      proposeEdit(agent, documentId, [{ find: "beta", replace: "shared bypass" }])
    ).rejects.toMatchObject({ code: "access_denied" });
    await db
      .delete(matterDocuments)
      .where(and(eq(matterDocuments.documentId, documentId), eq(matterDocuments.matterId, second)));
    const [changeId] = await proposeEdit(agent, documentId, [
      { find: "beta", replace: "captured owner wording" },
    ]);
    await db.delete(matterDocuments).where(eq(matterDocuments.documentId, documentId));
    await policy("editor");
    await expect(
      resolveEdit(editor, documentId, changeId!, "accept", await context())
    ).rejects.toMatchObject({ code: "access_denied" });
    await resolveEdit(owner, documentId, changeId!, "reject", await context());
  });
  test("mixed resolved, missing and duplicate batch identities apply none", async () => {
    const [first, second] = await proposeEdit(agent, documentId, [
      { find: "beta", replace: "gamma" },
      { find: "Term", replace: "Clause" },
    ]);
    await resolveEdit(owner, documentId, first!, "reject", await context());
    await expect(
      resolveEdits(owner, documentId, [first!, second!], "accept", await context())
    ).rejects.toThrow("Every requested");
    await expect(
      resolveEdits(owner, documentId, [second!, randomUUID()], "accept", await context())
    ).rejects.toThrow("Every requested");
    await expect(
      resolveEdits(owner, documentId, [second!, second!], "accept", await context())
    ).rejects.toThrow("distinct pending");
    expect(
      (
        await db
          .select()
          .from(documentEdits)
          .where(and(eq(documentEdits.documentId, documentId), eq(documentEdits.changeId, second!)))
      )[0]!.status
    ).toBe("pending");
    await resolveEdit(owner, documentId, second!, "reject", await context());
  });
});
