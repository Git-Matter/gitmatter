import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { and, eq, inArray, sql as querySql } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { commits, templateRevisions, stagedObjects, tenants, user } from "@workspace/db/schema";
import type { TemplateContent } from "@workspace/contracts";
import {
  actOnTemplate,
  createTemplate,
  currentTemplate,
  listTemplates,
  listTemplateSummaries,
  getTemplate,
  saveTemplate,
  templateHistory,
  uploadTemplateFile,
  downloadTemplate,
} from "../src/content/templates.js";
import { readFileSync } from "node:fs";
import { templateStorageBytes } from "../src/core/template-storage.js";
import { tenantStorageBytes } from "../src/platform/usage.js";
import { reconcileStagedObjects } from "../src/core/staged-objects.js";
import { deleteObject, putObject } from "../src/core/storage.js";
import { canAccessArtifact } from "../src/core/access.js";
import type { Actor } from "../src/core/commit.js";
import { buildTemplateTools } from "../src/tools/templates.js";

// Real Postgres/staged publication; synthetic object I/O keeps these tests local.
const storedObjects = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("../src/core/storage.js", () => ({
  buildStoragePath: ({ tenantId, userId, artifactId, ext }: Record<string, string>) =>
    `${tenantId}/${userId}/${artifactId}.${ext}`,
  putObject: vi.fn(async (tenantId: string, key: string, bytes: Buffer) => {
    if (!key.startsWith(`${tenantId}/`)) throw new Error("Wrong tenant prefix");
    storedObjects.set(key, new Uint8Array(bytes));
  }),
  getObject: async (tenantId: string, key: string) => {
    if (!key.startsWith(`${tenantId}/`) || !storedObjects.has(key)) throw new Error("Missing file");
    return new Uint8Array(storedObjects.get(key)!);
  },
  deleteObject: vi.fn(async (_tenantId: string, key: string) => {
    storedObjects.delete(key);
  }),
  isAlreadyDeleted: () => false,
}));

const suffix = randomUUID();
const admin: Actor = { type: "user", userId: `template-admin-${suffix}` };
const owner: Actor = { type: "user", userId: `template-owner-${suffix}` };
const sales: Actor = { type: "user", userId: `template-sales-${suffix}` };
const reviewer: Actor = { type: "user", userId: `template-reviewer-${suffix}` };
const editor: Actor = { type: "user", userId: `template-editor-${suffix}` };
const outsider: Actor = { type: "user", userId: `template-outsider-${suffix}` };
const agent: Actor = { type: "agent", userId: admin.userId, agentLabel: "mcp:template-test" };
const content: TemplateContent = {
  title: "Mutual NDA",
  category: "Commercial",
  body: "Original approved terms.",
  guidance: "Use for mutual disclosures.",
  audience: "workspace",
};
let tenantId: string;
let otherTenantId: string;
const ids: string[] = [];
const get = async (id: string) => (await listTemplates(admin)).find((t) => t.id === id)!;
async function create(input = content) {
  const id = await createTemplate(owner, input);
  ids.push(id);
  return id;
}
async function action(
  id: string,
  actor: Actor,
  op:
    | "submit"
    | "publish"
    | "request_changes"
    | "archive"
    | "restore"
    | "assign"
    | "set_member"
    | "remove_member",
  extra = {}
) {
  const row = await get(id);
  return actOnTemplate(actor, id, {
    expectedHead: row.headCommitId,
    action: op,
    revisionId: row.draft!.id,
    message: `Test ${op}`,
    reviewerId: admin.userId,
    ...extra,
  });
}
async function publish(id: string) {
  await action(id, owner, "submit");
  await action(id, admin, "publish");
}

beforeAll(async () => {
  const created = await db
    .insert(tenants)
    .values([{ name: `Templates ${suffix}` }, { name: `Other ${suffix}` }])
    .returning();
  tenantId = created[0].id;
  otherTenantId = created[1].id;
  await db.insert(user).values(
    [admin, owner, sales, outsider, reviewer, editor].map((a) => ({
      id: a.userId,
      name: a.userId,
      email: `${a.userId}@example.com`,
      emailVerified: true,
      tenantId: a === outsider ? otherTenantId : tenantId,
      tenantRole: a === admin ? ("admin" as const) : ("member" as const),
    }))
  );
});
afterAll(async () => {
  if (ids.length) await db.delete(commits).where(inArray(commits.artifactId, ids));
  if (tenantId) await db.delete(tenants).where(inArray(tenants.id, [tenantId, otherTenantId]));
  await db.delete(user).where(
    inArray(
      user.id,
      [admin, owner, sales, outsider, reviewer, editor].map((a) => a.userId)
    )
  );
  await sql.end();
});

describe("audited template library", () => {
  test("drafts are private; only the exact reviewed revision can be approved by a human admin", async () => {
    const id = await create();
    expect((await listTemplates(sales)).find((t) => t.id === id)).toBeUndefined();
    await expect(currentTemplate(sales, id)).rejects.toThrow("No published");
    await action(id, owner, "submit");
    await expect(action(id, owner, "publish")).rejects.toThrow(/reviewer|person/i);
    await expect(action(id, agent, "publish")).rejects.toThrow(/reviewer|person/i);
    await expect(action(id, admin, "publish", { revisionId: randomUUID() })).rejects.toThrow(
      "reviewed revision changed"
    );
    await action(id, admin, "publish");
    const visible = (await listTemplates(sales)).find((t) => t.id === id)!;
    expect(visible.draft).toBeNull();
    expect(visible.canManage).toBe(false);
    expect(visible.current?.body).toBe(content.body);
    expect(await canAccessArtifact(sales, "template", id)).toBe(false);
    await expect(templateHistory(sales, id)).rejects.toThrow("Forbidden");
  });
  test("new draft content and audience never replace the current approved download", async () => {
    const id = await create();
    await publish(id);
    const row = await get(id);
    await saveTemplate(owner, id, {
      expectedHead: row.headCommitId,
      content: {
        ...content,
        title: "Private next NDA",
        body: "Unreviewed terms",
        audience: "legal",
      },
      message: "Review a new term",
    });
    const visible = (await listTemplates(sales)).find((t) => t.id === id)!;
    expect(visible.current?.title).toBe(content.title);
    expect(visible.status).toBe("published");
    expect(JSON.stringify(visible)).not.toContain("Unreviewed");
    expect((await currentTemplate(sales, id)).body).toBe(content.body);
    await publish(id);
    expect((await listTemplates(sales)).find((t) => t.id === id)).toBeUndefined();
  });
  test("concurrent saves have one winner and one conflict, with no partial revision or commit", async () => {
    const id = await create();
    const row = await get(id);
    const attempts = await Promise.allSettled(
      ["A", "B"].map((body) =>
        saveTemplate(owner, id, {
          expectedHead: row.headCommitId,
          content: { ...content, body },
          message: body,
        })
      )
    );
    expect(attempts.filter((a) => a.status === "fulfilled")).toHaveLength(1);
    expect(attempts.filter((a) => a.status === "rejected")).toHaveLength(1);
    expect(
      await db.select().from(templateRevisions).where(eq(templateRevisions.templateId, id))
    ).toHaveLength(2);
    const history = await templateHistory(owner, id);
    expect(history).toHaveLength(2);
    expect(history[0].seq).toBe(2);
    expect(history[0].changes.find((c) => c.path === "field/body")?.before).toBe(content.body);
  });
  test("a stale approval cannot publish a revision saved after review", async () => {
    const id = await create();
    await action(id, owner, "submit");
    const reviewed = await get(id);
    await saveTemplate(owner, id, {
      expectedHead: reviewed.headCommitId,
      content: { ...content, body: "Changed after review" },
      message: "New wording",
    });
    await expect(
      actOnTemplate(admin, id, {
        expectedHead: reviewed.headCommitId,
        action: "publish",
        revisionId: reviewed.draft!.id,
        message: "Approve",
      })
    ).rejects.toThrow("changed");
    expect((await get(id)).current).toBeNull();
  });
  test("cross-tenant reads, history, writes and owner assignment are rejected", async () => {
    const id = await create();
    await publish(id);
    const row = await get(id);
    expect((await listTemplates(outsider)).find((t) => t.id === id)).toBeUndefined();
    await expect(templateHistory(outsider, id)).rejects.toThrow("not found");
    await expect(
      saveTemplate(outsider, id, { expectedHead: row.headCommitId, content, message: "Attack" })
    ).rejects.toThrow("not found");
    await expect(action(id, admin, "assign", { ownerId: outsider.userId })).rejects.toThrow(
      "workspace"
    );
    await expect(
      saveTemplate(sales, id, { expectedHead: row.headCommitId, content, message: "Attack" })
    ).rejects.toThrow("Forbidden");
  });
  test("archiving withdraws downloads; restore requires fresh approval", async () => {
    const id = await create();
    await publish(id);
    await action(id, admin, "archive");
    await expect(currentTemplate(owner, id)).rejects.toThrow("No published");
    expect((await listTemplates(sales)).find((t) => t.id === id)).toBeUndefined();
    await action(id, admin, "restore");
    expect((await get(id)).current).toBeNull();
    await expect(currentTemplate(sales, id)).rejects.toThrow("No published");
    await publish(id);
    expect((await currentTemplate(sales, id)).version).toBe(1);
  });
  test("ownership changes are audited and remove the former owner's draft access", async () => {
    const id = await create({ ...content, audience: "legal" });
    await action(id, admin, "assign", { ownerId: sales.userId });
    expect((await listTemplates(owner)).find((t) => t.id === id)).toBeUndefined();
    expect((await listTemplates(sales)).find((t) => t.id === id)?.canManage).toBe(true);
    const history = await templateHistory(admin, id);
    expect(history[0].changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: "field/ownerId",
          before: owner.userId,
          after: sales.userId,
        }),
      ])
    );
  });
  test("scoped agents cannot read the library or write through viewer caps", async () => {
    const scoped: Actor = { ...agent, scope: { matterIds: [randomUUID()], maxRole: "owner" } };
    await expect(listTemplates(scoped)).rejects.toThrow("token");
    await expect(
      createTemplate({ ...agent, scope: { matterIds: null, maxRole: "viewer" } }, content)
    ).rejects.toThrow("read-only");
    const tools = buildTemplateTools({ actor: scoped, resolveMatter: async () => null });
    expect(await tools.find((t) => t.name === "list_templates")!.handler({})).toHaveProperty(
      "error"
    );
    expect(tools.some((t) => t.name.includes("publish"))).toBe(false);
  });
});

describe("delegated template review and exact original files", () => {
  test("a delegated reviewer can review without editing or administering the workspace", async () => {
    const id = await create();
    await action(id, owner, "set_member", { userId: editor.userId, role: "editor" });
    await action(id, owner, "set_member", { userId: reviewer.userId, role: "reviewer" });
    let view = (await listTemplates(reviewer, id))[0]!;
    expect(view.canManage).toBe(true);
    expect(view.canEdit).toBe(false);
    expect(view.canManageMembers).toBe(false);
    expect(view.canReview).toBe(false);
    await expect(
      action(id, reviewer, "set_member", { userId: sales.userId, role: "reviewer" })
    ).rejects.toThrow("owner");
    await expect(
      saveTemplate(reviewer, id, {
        expectedHead: view.headCommitId,
        content,
        message: "Not an editor",
      })
    ).rejects.toThrow("editor");
    await action(id, editor, "submit", { reviewerId: reviewer.userId });
    view = (await listTemplates(reviewer, id))[0]!;
    expect(view.canReview).toBe(true);
    expect(view.reviewerName).toBe(reviewer.userId);
    expect(await canAccessArtifact(reviewer, "template", id, "viewer")).toBe(true);
    expect(await canAccessArtifact(reviewer, "template", id, "editor")).toBe(false);
    await action(id, reviewer, "request_changes", {
      message: "Use the current confidentiality term",
    });
    const returned = await get(id);
    expect(returned.status).toBe("changes_requested");
    expect(returned.reviewNote).toBe("Use the current confidentiality term");
    await action(id, editor, "submit", { reviewerId: reviewer.userId });
    await action(id, reviewer, "publish");
    const published = await get(id);
    expect(published.publishedBy).toBe(reviewer.userId);
    expect(published.publishedAt).toBeTruthy();
    expect((await db.select().from(user).where(eq(user.id, reviewer.userId)))[0].tenantRole).toBe(
      "member"
    );
    const reviewCommit = (await templateHistory(owner, id)).find(
      (commit) => commit.op === "request_changes"
    )!;
    expect(reviewCommit.actorId).toBe(reviewer.userId);
    expect(reviewCommit.message).toBe("Use the current confidentiality term");
  });
  test("reviewer assignment cannot be forged across tenants or outlive delegation removal", async () => {
    const id = await create();
    await expect(
      action(id, owner, "set_member", { userId: outsider.userId, role: "reviewer" })
    ).rejects.toThrow("workspace");
    await expect(action(id, owner, "submit", { reviewerId: sales.userId })).rejects.toThrow(
      "delegated"
    );
    await action(id, owner, "set_member", { userId: reviewer.userId, role: "reviewer" });
    await action(id, owner, "submit", { reviewerId: reviewer.userId });
    const old = await get(id);
    await action(id, owner, "remove_member", { userId: reviewer.userId });
    expect((await get(id)).status).toBe("draft");
    expect(await listTemplates(reviewer, id)).toHaveLength(0);
    await expect(
      actOnTemplate(reviewer, id, {
        action: "publish",
        expectedHead: old.headCommitId,
        revisionId: old.draft!.id,
        message: "Too late",
      })
    ).rejects.toThrow("Forbidden");
  });
  test("promoting the assigned reviewer to owner clears delegation and returns the pending review", async () => {
    const id = await create();
    await action(id, owner, "set_member", { userId: reviewer.userId, role: "reviewer" });
    await action(id, owner, "submit", { reviewerId: reviewer.userId });
    await action(id, owner, "assign", { ownerId: reviewer.userId });
    const view = (await listTemplates(reviewer, id))[0]!;
    expect(view.ownerId).toBe(reviewer.userId);
    expect(view.members).toHaveLength(0);
    expect(view.reviewerId).toBeNull();
    expect(view.status).toBe("draft");
    expect(view.canEdit).toBe(true);
    expect(view.canReview).toBe(false);
    const commit = (await templateHistory(reviewer, id))[0];
    expect(commit.changes).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          path: `member/${reviewer.userId}`,
          before: "reviewer",
          after: null,
        }),
        expect.objectContaining({ path: "field/status", before: "review", after: "draft" }),
      ])
    );
  });
  test("original DOCX bytes, headers, and formatting survive metadata revisions and publication", async () => {
    const original = readFileSync(
      new URL(
        "../../../test/acceptance/word-signoff/fixtures/01-clean-styled-nda.docx",
        import.meta.url
      )
    );
    const id = await uploadTemplateFile(
      owner,
      { ...content, body: "Client-supplied body must be ignored" },
      original,
      "Original NDA.docx"
    );
    ids.push(id);
    const first = await get(id);
    expect(first.draft?.file?.sizeBytes).toBe(original.length);
    expect(first.draft?.body).not.toContain("Client-supplied body");
    await expect(currentTemplate(sales, id)).rejects.toThrow("No published");
    await expect(downloadTemplate(sales, id, first.draft!.id)).rejects.toThrow("No published");
    const preview = await downloadTemplate(owner, id, first.draft!.id);
    expect(Buffer.from(preview.bytes).equals(original)).toBe(true);
    expect(preview.filename).toBe("Mutual-NDA-v1.docx");
    await expect(
      saveTemplate(owner, id, {
        expectedHead: first.headCommitId,
        content: { ...content, body: "Divergent body" },
        message: "Bad edit",
      })
    ).rejects.toThrow("Replace the Word file");
    const quotaBefore = await tenantStorageBytes(tenantId);
    await saveTemplate(owner, id, {
      expectedHead: first.headCommitId,
      content: { ...first.draft!, guidance: "Updated instructions" },
      message: "Metadata only",
    });
    expect(await tenantStorageBytes(tenantId)).toBe(quotaBefore);
    expect(await templateStorageBytes(db, tenantId)).toBe(original.length);
    await publish(id);
    const current = await currentTemplate(sales, id);
    const downloaded = await downloadTemplate(sales, id, current.id);
    expect(Buffer.from(downloaded.bytes).equals(original)).toBe(true);
    expect(downloaded.filename).toBe("Mutual-NDA-v2.docx");
    await expect(downloadTemplate(sales, id, first.draft!.id)).rejects.toThrow("No published");
    const [revision] = await db
      .select()
      .from(templateRevisions)
      .where(eq(templateRevisions.id, current.id));
    await db
      .update(stagedObjects)
      .set({ state: "staged", expiresAt: querySql`now() - interval '1 second'` })
      .where(eq(stagedObjects.storagePath, revision.storagePath!));
    await reconcileStagedObjects(20, tenantId);
    expect(
      (
        await db
          .select()
          .from(stagedObjects)
          .where(eq(stagedObjects.storagePath, revision.storagePath!))
      )[0].state
    ).toBe("attached");
    expect(
      vi.mocked(deleteObject).mock.calls.some((call) => call[1] === revision.storagePath)
    ).toBe(false);
    storedObjects.set(revision.storagePath!, new Uint8Array(Buffer.from("corrupted object")));
    await expect(downloadTemplate(sales, id)).rejects.toThrow("does not match");
    storedObjects.set(revision.storagePath!, new Uint8Array(original));
  });
  test("unsafe source is rejected before storage and stale file uploads remain sweepable", async () => {
    const tracked = readFileSync(
      new URL(
        "../../../test/acceptance/word-signoff/fixtures/02-incoming-body-revisions.docx",
        import.meta.url
      )
    );
    const writes = vi.mocked(putObject).mock.calls.length;
    await expect(uploadTemplateFile(owner, content, tracked, "Tracked.docx")).rejects.toThrow(
      "tracked changes"
    );
    await expect(
      uploadTemplateFile(owner, content, Buffer.from("bad archive"), "Invalid.docx")
    ).rejects.toThrow("valid Word");
    expect(vi.mocked(putObject).mock.calls.length).toBe(writes);
    const id = await create();
    const starting = await get(id);
    const original = readFileSync(
      new URL(
        "../../../test/acceptance/word-signoff/fixtures/01-clean-styled-nda.docx",
        import.meta.url
      )
    );
    let orphanPath = "";
    vi.mocked(putObject).mockImplementationOnce(async (_tenantId, key, bytes) => {
      orphanPath = key;
      storedObjects.set(key, new Uint8Array(bytes));
      await saveTemplate(owner, id, {
        expectedHead: starting.headCommitId,
        content: { ...content, title: "Concurrent edit" },
        message: "Edit during upload",
      });
    });
    await expect(
      uploadTemplateFile(owner, content, original, "Conflicted.docx", {
        id,
        expectedHead: starting.headCommitId,
        message: "Replace source",
      })
    ).rejects.toThrow("changed");
    expect((await get(id)).draft?.file).toBeNull();
    expect(
      (await db.select().from(stagedObjects).where(eq(stagedObjects.storagePath, orphanPath)))[0]
        .state
    ).toBe("staged");
    await db
      .update(stagedObjects)
      .set({ expiresAt: querySql`now() - interval '1 second'` })
      .where(and(eq(stagedObjects.tenantId, tenantId), eq(stagedObjects.storagePath, orphanPath)));
    await reconcileStagedObjects(20, tenantId);
    expect(storedObjects.has(orphanPath)).toBe(false);
  });
});

describe("bounded template metadata listing", () => {
  test("pages visible summaries without legal bodies and guards separate detail reads", async () => {
    const prefix = `Capacity-${suffix}`;
    const privateBody = `Sensitive review language ${"contract terms ".repeat(4000)}`.trim();
    const created: string[] = [];
    for (let i = 0; i < 3; i++) {
      const id = await create({
        ...content,
        title: `${prefix}-${i}`,
        body: privateBody,
        guidance: "Private usage instructions",
      });
      created.push(id);
      if (i < 2) await publish(id);
    }
    const first = await listTemplateSummaries(admin, { q: prefix, limit: 2 });
    expect(first.items).toHaveLength(2);
    expect(first.nextCursor).toBeTruthy();
    const second = await listTemplateSummaries(admin, {
      q: prefix,
      limit: 2,
      cursor: first.nextCursor!,
    });
    expect(second.items).toHaveLength(1);
    expect(second.nextCursor).toBeNull();
    expect(new Set([...first.items, ...second.items].map((row) => row.id)).size).toBe(3);
    for (const row of [...first.items, ...second.items]) {
      expect(row.draft).not.toHaveProperty("body");
      expect(row.draft).not.toHaveProperty("guidance");
      if (row.current) {
        expect(row.current).not.toHaveProperty("body");
        expect(row.current).not.toHaveProperty("guidance");
      }
    }
    expect(JSON.stringify(first)).not.toContain("Sensitive review language");
    expect(JSON.stringify(first)).not.toContain("Private usage instructions");
    const listTool = buildTemplateTools({ actor: admin, resolveMatter: async () => null }).find(
      (tool) => tool.name === "list_templates"
    )!;
    const toolPage = (await listTool.handler({ q: prefix, limit: 1 })) as Awaited<
      ReturnType<typeof listTemplateSummaries>
    >;
    expect(toolPage.items).toHaveLength(1);
    expect(toolPage.items[0].draft).not.toHaveProperty("body");
    expect(toolPage.nextCursor).toBeTruthy();
    expect((await getTemplate(admin, created[0])).draft?.body).toBe(privateBody);
    const readerFirst = await listTemplateSummaries(sales, { q: prefix, limit: 1 });
    expect(readerFirst.items).toHaveLength(1);
    expect(readerFirst.nextCursor).toBeTruthy();
    const readerSecond = await listTemplateSummaries(sales, {
      q: prefix,
      limit: 1,
      cursor: readerFirst.nextCursor!,
    });
    expect(readerSecond.items).toHaveLength(1);
    expect(readerSecond.nextCursor).toBeNull();
    expect(readerFirst.items[0].id).not.toBe(readerSecond.items[0].id);
    await expect(getTemplate(sales, created[2])).rejects.toThrow("not found");
    await expect(getTemplate(outsider, created[0])).rejects.toThrow("not found");
    await expect(listTemplateSummaries(sales, { limit: 101 })).rejects.toThrow();
    const latest = await get(created[0]);
    await saveTemplate(owner, created[0], {
      expectedHead: latest.headCommitId,
      content: { ...content, title: "Private pending rename", body: privateBody },
      message: "A private draft title",
    });
    expect(
      (await listTemplateSummaries(sales, { q: "Private pending rename" })).items
    ).toHaveLength(0);
    await action(created[0], owner, "submit");
    expect(
      (await listTemplateSummaries(admin, { view: "review", q: "Private pending rename" })).items
    ).toHaveLength(1);
    expect((await listTemplateSummaries(sales, { view: "review" })).items).toHaveLength(0);
    await action(created[0], admin, "request_changes", { message: "Return for correction" });
    expect(
      (await listTemplateSummaries(owner, { view: "returned", q: "Private pending rename" })).items
    ).toHaveLength(1);
    expect((await listTemplateSummaries(sales, { view: "returned" })).items).toHaveLength(0);
  });
});
