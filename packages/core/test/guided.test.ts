import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { and, eq, inArray } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  clients,
  commits,
  documents,
  matterDocuments,
  matters,
  tenants,
  user,
} from "@workspace/db/schema";
import { ensureGuidedSample, GuidedTaskError, prepareGuidedTask } from "../src/platform/guided.js";
import { createMatter } from "../src/platform/matters.js";

const ownerId = `guided-owner-${randomUUID()}`;
const outsiderId = `guided-outsider-${randomUUID()}`;
const fixtureUserIds = [ownerId, outsiderId];
let tenantIds: string[] = [];
let sample: Awaited<ReturnType<typeof ensureGuidedSample>>;

beforeAll(async () => {
  const rows = await db
    .insert(tenants)
    .values([{ name: "Guided fixture A" }, { name: "Guided fixture B" }])
    .returning();
  tenantIds = rows.map((row) => row.id);
  await db.insert(user).values([
    {
      id: ownerId,
      name: "Guided owner",
      email: `${ownerId}@example.test`,
      emailVerified: true,
      tenantId: tenantIds[0]!,
      tenantRole: "admin",
    },
    {
      id: outsiderId,
      name: "Guided outsider",
      email: `${outsiderId}@example.test`,
      emailVerified: true,
      tenantId: tenantIds[1]!,
      tenantRole: "admin",
    },
  ]);
  sample = await ensureGuidedSample(ownerId);
});

afterAll(async () => {
  await db.delete(commits).where(inArray(commits.actorId, fixtureUserIds));
  await db.delete(user).where(inArray(user.id, fixtureUserIds));
  if (tenantIds.length) await db.delete(tenants).where(inArray(tenants.id, tenantIds));
});

function input(overrides: Partial<Parameters<typeof prepareGuidedTask>[1]> = {}) {
  return {
    task: "matter-briefing" as const,
    matterId: sample.matterId,
    documentIds: sample.documentIds,
    jurisdiction: "AU-NSW",
    instructions: "Act for the fictional customer. Explain what remains unconfirmed.",
    ...overrides,
  };
}

describe("guided sample and authorised preparation", () => {
  test("sample creation queues safely for more distinct users than the connection pool maximum", async () => {
    const users = Array.from({ length: 30 }, () => `guided-pool-${randomUUID()}`);
    fixtureUserIds.push(...users);
    await db.insert(user).values(
      users.map((id) => ({
        id,
        name: "Guided pool fixture",
        email: `${id}@example.test`,
        emailVerified: true,
        tenantId: tenantIds[0]!,
        tenantRole: "member" as const,
      }))
    );
    const samples = await Promise.all(users.map((id) => ensureGuidedSample(id)));
    expect(new Set(samples.map((item) => item.matterId)).size).toBe(30);
    expect(new Set(samples.flatMap((item) => item.documentIds)).size).toBe(60);
  }, 15000);
  test("creates fictional matter-linked documents with human creation commits", async () => {
    const sources = await db
      .select()
      .from(documents)
      .where(inArray(documents.id, sample.documentIds));
    expect(sources).toHaveLength(2);
    for (const source of sources) {
      expect(source.title).toContain("Fictional sample");
      expect(source.markdown).toContain("FICTIONAL SAMPLE ONLY");
      expect(source.headCommitId).toBeTruthy();
      expect(source.matterId).toBe(sample.matterId);
      const [commit] = await db.select().from(commits).where(eq(commits.id, source.headCommitId!));
      expect(commit).toMatchObject({ actorId: ownerId, actorType: "user", op: "create" });
    }
  });

  test("repeated and concurrent sample opens never create duplicate source artifacts", async () => {
    const results = await Promise.allSettled([
      ensureGuidedSample(ownerId),
      ensureGuidedSample(ownerId),
    ]);
    for (const result of results) {
      if (result.status === "fulfilled") expect(result.value).toEqual(sample);
      else expect(result.reason).toBeInstanceOf(GuidedTaskError);
    }
    expect(await ensureGuidedSample(ownerId)).toEqual(sample);
    expect(await db.select().from(clients).where(eq(clients.createdBy, ownerId))).toHaveLength(1);
    expect(await db.select().from(matters).where(eq(matters.createdBy, ownerId))).toHaveLength(1);
    expect(await db.select().from(documents).where(eq(documents.userId, ownerId))).toHaveLength(2);
    expect(await db.select().from(commits).where(eq(commits.actorId, ownerId))).toHaveLength(2);
  });

  test("sample identities are isolated per tenant and user", async () => {
    const other = await ensureGuidedSample(outsiderId);
    expect(other.matterId).not.toBe(sample.matterId);
    expect(other.documentIds.some((id) => sample.documentIds.includes(id))).toBe(false);
    await expect(prepareGuidedTask(outsiderId, input())).rejects.toMatchObject({ status: 403 });
  });

  test("preparation preserves the entire source selection and does not create a chat or call AI", async () => {
    const result = await prepareGuidedTask(ownerId, input());
    expect(result).toMatchObject({
      version: 1,
      task: "matter-briefing",
      matterId: sample.matterId,
      jurisdiction: "AU-NSW",
    });
    expect(result.attachments.map((item) => item.id)).toEqual(sample.documentIds);
    expect(result.prompt).toContain(sample.matterId);
    expect(result.prompt).toContain("unconfirmed");
    expect(result.prompt).toContain("missing information");
  });

  test("rejects duplicate, unavailable, processing, and wrong-jurisdiction sources", async () => {
    await expect(
      prepareGuidedTask(
        ownerId,
        input({ documentIds: [sample.documentIds[0]!, sample.documentIds[0]!] })
      )
    ).rejects.toThrow("distinct");
    await expect(
      prepareGuidedTask(ownerId, input({ documentIds: [...sample.documentIds, randomUUID()] }))
    ).rejects.toMatchObject({ status: 403 });
    await expect(prepareGuidedTask(ownerId, input({ jurisdiction: "US" }))).rejects.toThrow(
      "Australian"
    );
    await db
      .update(documents)
      .set({ status: "processing" })
      .where(eq(documents.id, sample.documentIds[0]!));
    try {
      await expect(prepareGuidedTask(ownerId, input())).rejects.toThrow("must be ready");
    } finally {
      await db
        .update(documents)
        .set({ status: "ready" })
        .where(eq(documents.id, sample.documentIds[0]!));
    }
  });

  test("allows readable sources linked to the selected matter and rejects them when unlinked", async () => {
    const [original] = await db.select().from(matters).where(eq(matters.id, sample.matterId));
    const other = await createMatter(ownerId, {
      clientId: original!.clientId,
      name: "Guided linked-source fixture",
    });
    const documentId = sample.documentIds[0]!;
    await db.insert(matterDocuments).values({ matterId: other.id, documentId });
    const linkedInput = input({ matterId: other.id, documentIds: [documentId] });
    expect((await prepareGuidedTask(ownerId, linkedInput)).attachments[0]?.id).toBe(documentId);
    await db
      .delete(matterDocuments)
      .where(
        and(eq(matterDocuments.matterId, other.id), eq(matterDocuments.documentId, documentId))
      );
    await expect(prepareGuidedTask(ownerId, linkedInput)).rejects.toMatchObject({ status: 403 });
  });
});
