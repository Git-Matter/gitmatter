import { randomUUID } from "node:crypto";
import { afterAll, afterEach, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { documentChunks, documents, documentVersions, tenants, user } from "@workspace/db/schema";
import * as embeddings from "../src/ai/embeddings.js";
import { getDocumentContext, replaceDocumentChunks } from "../src/content/chunks.js";
import { createDocument, getDocument } from "../src/content/documents.js";
import { createClient, createMatter } from "../src/platform/matters.js";

const userId = `context-${randomUUID()}`;
let tenantId: string;
let matterId: string;

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Synthetic context fixture" })
    .returning();
  tenantId = tenant!.id;
  await db.insert(user).values({
    id: userId,
    name: "Context fixture",
    email: `${userId}@example.test`,
    tenantId,
  });
  const client = await createClient(userId, tenantId, { name: "Fictional client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Fictional matter" })).id;
});

afterEach(() => vi.restoreAllMocks());
afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("version-bound document context", () => {
  test("audited text creation indexes its source and read-only queries never invoke embeddings", async () => {
    const doc = await createDocument(userId, {
      title: "Fictional agreement",
      matterId,
      markdown: "# Fees\nFees are due monthly.\n# Indemnity\nThe indemnity is mutual.",
    });
    expect(doc.headCommitId).toBeTruthy();
    const indexed = await db
      .select()
      .from(documentChunks)
      .where(eq(documentChunks.documentId, doc.id));
    expect(indexed).toHaveLength(2);
    vi.spyOn(embeddings, "resolveEmbeddingProfile").mockReturnValue({
      provider: "openai",
      model: "synthetic",
      dimensions: 1536,
      source: "env",
      key: "synthetic",
    });
    const embed = vi.spyOn(embeddings, "embedTexts").mockRejectedValue(new Error("No paid read"));
    const context = await getDocumentContext(doc, {
      mode: "query",
      query: "indemnity",
      maxChunks: 1,
    });
    expect(context.text).toContain("The indemnity is mutual.");
    expect(context.text).toContain("Partial view: 1 of 2 chunks shown");
    expect(embed).not.toHaveBeenCalled();
  });

  test("explicit chunk refs cannot read a retired version or unversioned legacy rows", async () => {
    const doc = await createDocument(userId, {
      title: "Version fixture",
      matterId,
      markdown: "Current source",
    });
    const [version] = await db
      .insert(documentVersions)
      .values({
        documentId: doc.id,
        versionNumber: 1,
        source: "upload",
        fileType: "txt",
      })
      .returning();
    await db
      .update(documents)
      .set({ currentVersionId: version!.id })
      .where(eq(documents.id, doc.id));
    await replaceDocumentChunks(db, {
      documentId: doc.id,
      versionId: version!.id,
      markdown: "Current source",
    });
    await db.insert(documentChunks).values({
      documentId: doc.id,
      versionId: null,
      index: 99,
      text: "Retired confidential source",
      tokenEstimate: 8,
      contentHash: "synthetic-retired",
    });
    const current = (await getDocument(doc.id))!;
    const context = await getDocumentContext(current, {
      mode: "chunks",
      chunkRefs: ["chunk:99", "chunk:0"],
    });
    expect(context.chunks.map((chunk) => chunk.index)).toEqual([0]);
    expect(context.text).toContain("Current source");
    expect(context.text).not.toContain("Retired confidential source");
  });
});
