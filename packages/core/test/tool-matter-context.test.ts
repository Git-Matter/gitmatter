import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { documents, matterDocuments, matterMembers, tenants, user } from "@workspace/db/schema";
import { buildToolCatalog } from "../src/tools/catalog.js";
import { createClient, createMatter } from "../src/platform/matters.js";
import { listCommits } from "../src/core/commit.js";

// Real artifact/audit transactions, with synthetic local object storage only.
const stored = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("../src/core/storage.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  putObject: async (_tenant: string, key: string, bytes: Uint8Array) => {
    stored.set(key, new Uint8Array(bytes));
  },
  getObject: async (_tenant: string, key: string) => stored.get(key)!,
  deleteObject: async (_tenant: string, key: string) => {
    stored.delete(key);
  },
}));

const userId = `tool-context-${randomUUID()}`;
let tenantId: string;
let matterId: string;
let otherMatterId: string;
beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Synthetic tool context", storageRegion: "legacy" })
    .returning();
  tenantId = tenant!.id;
  await db
    .insert(user)
    .values({ id: userId, name: "Context user", email: `${userId}@example.test`, tenantId });
  const client = await createClient(userId, tenantId, { name: "Fictional client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Confirmed matter" })).id;
  otherMatterId = (await createMatter(userId, { clientId: client.id, name: "Other matter" })).id;
});
afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

function generationTool() {
  return buildToolCatalog(
    { type: "agent", userId, agentLabel: "chat" },
    { jurisdiction: "AU-NSW", defaultMatterLabel: "Context user", matterId }
  ).find((tool) => tool.name === "generate_docx")!;
}
const input = {
  title: "Synthetic client update",
  blocks: [{ type: "paragraph", text: "Draft for the confirmed matter." }],
};

describe("server-bound conversation matter", () => {
  test("omitted matter ID files the generated Word artifact in the confirmed matter with an audit commit", async () => {
    const result = (await generationTool().handler(input)) as { documentId: string };
    const [doc] = await db.select().from(documents).where(eq(documents.id, result.documentId));
    expect(doc?.matterId).toBe(matterId);
    expect(
      await db
        .select()
        .from(matterDocuments)
        .where(eq(matterDocuments.documentId, result.documentId))
    ).toMatchObject([{ matterId, documentId: result.documentId }]);
    expect(await listCommits("document", result.documentId)).toMatchObject([
      { actorType: "agent", actorId: userId, op: "create" },
    ]);
  });
  test("neither another explicit matter nor revoked access can silently fall back to a personal matter", async () => {
    const tool = generationTool();
    const before = await db
      .select({ id: documents.id })
      .from(documents)
      .where(eq(documents.tenantId, tenantId));
    expect(await tool.handler({ ...input, matterId: otherMatterId })).toMatchObject({
      error: expect.any(String),
    });
    await db.delete(matterMembers).where(eq(matterMembers.matterId, matterId));
    expect(await tool.handler(input)).toMatchObject({ error: expect.any(String) });
    expect(
      await db.select({ id: documents.id }).from(documents).where(eq(documents.tenantId, tenantId))
    ).toEqual(before);
  });
});
