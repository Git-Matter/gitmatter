import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { and, eq, sql as querySql } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import {
  commits,
  documents,
  documentVersions,
  matterDocuments,
  tenants,
  user,
  stagedObjects,
  matterMembers,
  jobs,
} from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import {
  createDocument,
  createGeneratedDocument,
  uploadDocument,
} from "../src/content/documents.js";
import * as spine from "../src/core/commit.js";
import { deleteObject } from "../src/core/storage.js";
import * as objectStorage from "../src/core/storage.js";
import { generateDocx } from "../src/content/docx/generate.js";
import { reconcileStagedObjects } from "../src/core/staged-objects.js";
const userId = `publication-owner-${randomUUID()}`,
  otherId = `publication-other-${randomUUID()}`;
let tenantId: string, matterId: string;
const spec = {
  title: "Synthetic generated publication",
  blocks: [{ type: "paragraph" as const, text: "Synthetic content" }],
};
describe("document creation publishes only with its audit commit", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Synthetic publication firm", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values(
      [userId, otherId].map((id) => ({
        id,
        email: `${id}@example.com`,
        name: "Synthetic author",
        tenantId,
        emailVerified: true,
      }))
    );
    const client = await createClient(userId, tenantId, { name: "Synthetic client" });
    matterId = (
      await createMatter(userId, { clientId: client.id, name: "Synthetic publication matter" })
    ).id;
  });
  afterAll(async () => {
    const staged = await db
      .select({ path: stagedObjects.storagePath })
      .from(stagedObjects)
      .where(eq(stagedObjects.tenantId, tenantId));
    for (const row of staged) await deleteObject(tenantId, row.path).catch(() => {});
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
    await db.delete(user).where(eq(user.id, otherId));
    await sql.end();
  });
  test("injected commit failure leaves no pasted-text row, link, head or commit", async () => {
    let documentId = "";
    const original = spine.recordCommit;
    const mocked = vi.spyOn(spine, "recordCommit").mockImplementation((args) =>
      original({
        ...args,
        apply: async (context) => {
          documentId = args.artifactId;
          await args.apply(context);
          throw new Error("Synthetic commit rollback");
        },
      })
    );
    try {
      await expect(
        createDocument(userId, {
          matterId,
          title: "Synthetic rolled back text",
          markdown: "Synthetic content",
        })
      ).rejects.toThrow("Synthetic commit rollback");
    } finally {
      mocked.mockRestore();
    }
    expect(await db.select().from(documents).where(eq(documents.id, documentId))).toHaveLength(0);
    expect(
      await db.select().from(matterDocuments).where(eq(matterDocuments.documentId, documentId))
    ).toHaveLength(0);
    expect(await db.select().from(commits).where(eq(commits.artifactId, documentId))).toHaveLength(
      0
    );
  });
  test("injected generated-DOCX failure rolls back rows, version, link, attachment and audit head", async () => {
    let documentId = "";
    const original = spine.recordCommit;
    const mocked = vi.spyOn(spine, "recordCommit").mockImplementation((args) =>
      original({
        ...args,
        apply: async (context) => {
          documentId = args.artifactId;
          await args.apply(context);
          throw new Error("Synthetic generated rollback");
        },
      })
    );
    try {
      await expect(
        createGeneratedDocument({ type: "user", userId }, { matterId, spec })
      ).rejects.toThrow("Synthetic generated rollback");
    } finally {
      mocked.mockRestore();
    }
    expect(await db.select().from(documents).where(eq(documents.id, documentId))).toHaveLength(0);
    expect(
      await db.select().from(documentVersions).where(eq(documentVersions.documentId, documentId))
    ).toHaveLength(0);
    expect(
      await db.select().from(matterDocuments).where(eq(matterDocuments.documentId, documentId))
    ).toHaveLength(0);
    expect(await db.select().from(commits).where(eq(commits.artifactId, documentId))).toHaveLength(
      0
    );
    expect(
      (
        await db
          .select()
          .from(stagedObjects)
          .where(and(eq(stagedObjects.tenantId, tenantId), eq(stagedObjects.state, "staged")))
      ).length
    ).toBeGreaterThan(0);
  });
  test("unauthorized humans and scoped agents cannot create usable document content", async () => {
    await expect(
      createDocument(otherId, { matterId, title: "Denied text", markdown: "Synthetic" })
    ).rejects.toThrow("access_denied");
    await expect(
      createGeneratedDocument({ type: "user", userId: otherId }, { matterId, spec })
    ).rejects.toThrow("access_denied");
    await expect(
      createGeneratedDocument(
        {
          type: "agent",
          userId,
          agentLabel: "Synthetic scoped agent",
          scope: { matterIds: [randomUUID()], maxRole: "owner" },
        },
        { matterId, spec }
      )
    ).rejects.toThrow("access_denied");
    await expect(
      createGeneratedDocument(
        {
          type: "agent",
          userId,
          agentLabel: "Synthetic viewer agent",
          scope: { matterIds: [matterId], maxRole: "viewer" },
        },
        { matterId, spec }
      )
    ).rejects.toThrow("access_denied");
  });
  test("successful generated document has matching baseline, version and attributable audit head", async () => {
    const generated = await createGeneratedDocument(
      { type: "agent", userId, agentLabel: "Synthetic generator" },
      { matterId, spec }
    );
    const [version] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, generated.currentVersionId!));
    expect(generated.approvedVersionId).toBe(generated.currentVersionId);
    expect(generated.approvedMarkdown).toBe(generated.markdown);
    expect(version?.lastCommitId).toBe(generated.headCommitId);
    const [commit] = await db.select().from(commits).where(eq(commits.id, generated.headCommitId!));
    expect(commit?.actorType).toBe("agent");
    expect(commit?.agentLabel).toBe("Synthetic generator");
  });
  test.each(["membership", "tenant", "unfiled tenant"] as const)(
    "delayed storage completion cannot publish after %s revocation",
    async (revocation) => {
      const [otherTenant] = await db
        .insert(tenants)
        .values({ name: "Synthetic tenant drift", storageRegion: "legacy" })
        .returning();
      let release!: () => void,
        started!: () => void,
        storagePath = "";
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        started = resolve;
      });
      const original = objectStorage.putObject;
      const mock = vi.spyOn(objectStorage, "putObject").mockImplementation(async (...args) => {
        storagePath = args[1];
        await original(...args);
        started();
        await gate;
      });
      const upload = uploadDocument(userId, {
        title: `Synthetic delayed ${revocation}`,
        fileType: "docx",
        bytes: Buffer.from(await generateDocx(spec)),
        matterId: revocation === "unfiled tenant" ? null : matterId,
        tenantId,
      });
      try {
        await Promise.race([
          ready,
          upload.then(() => {
            throw new Error("Upload published before storage gate");
          }),
        ]);
        if (revocation === "membership") {
          await db
            .update(matterMembers)
            .set({ role: "viewer" })
            .where(and(eq(matterMembers.userId, userId), eq(matterMembers.matterId, matterId)));
        } else {
          await db.update(user).set({ tenantId: otherTenant!.id }).where(eq(user.id, userId));
        }
        release();
        await expect(upload).rejects.toThrow("access_denied");
        const documentId = storagePath
          .split("/")
          .at(-1)!
          .replace(/\.docx$/, "");
        expect(await db.select().from(documents).where(eq(documents.id, documentId))).toHaveLength(
          0
        );
        expect(
          await db
            .select()
            .from(documentVersions)
            .where(eq(documentVersions.documentId, documentId))
        ).toHaveLength(0);
        expect(
          await db.select().from(matterDocuments).where(eq(matterDocuments.documentId, documentId))
        ).toHaveLength(0);
        expect(await db.select().from(jobs).where(eq(jobs.artifactId, documentId))).toHaveLength(0);
        expect(
          await db.select().from(commits).where(eq(commits.artifactId, documentId))
        ).toHaveLength(0);
        const [staged] = await db
          .select()
          .from(stagedObjects)
          .where(eq(stagedObjects.storagePath, storagePath));
        expect(staged?.state).toBe("staged");
        await db
          .update(stagedObjects)
          .set({ expiresAt: querySql`now() - interval '1 second'` })
          .where(eq(stagedObjects.id, staged!.id));
        expect((await reconcileStagedObjects(20, tenantId)).deleted).toBeGreaterThanOrEqual(1);
        expect(
          (await db.select().from(stagedObjects).where(eq(stagedObjects.id, staged!.id)))[0]!.state
        ).toBe("deleted");
      } finally {
        release();
        await upload.catch(() => {});
        mock.mockRestore();
        await db.update(user).set({ tenantId }).where(eq(user.id, userId));
        await db
          .update(matterMembers)
          .set({ role: "owner" })
          .where(and(eq(matterMembers.userId, userId), eq(matterMembers.matterId, matterId)));
        await db.delete(tenants).where(eq(tenants.id, otherTenant!.id));
      }
    }
  );
});
