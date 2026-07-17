import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, sql } from "@workspace/db/client";
import { tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canAccessArtifact } from "../src/core/access.js";
import { ensureDefaultMatter } from "../src/platform/matters.js";
import {
  addDocumentVersion,
  deleteDocumentVersion,
  getDocument,
  listVersions,
  processDocument,
  retryDocument,
  uploadDocument,
} from "../src/content/documents.js";
import { getObject } from "../src/core/storage.js";

const ownerId = `up-owner-${randomUUID()}`;
const outsiderId = `up-out-${randomUUID()}`;
const actor = { type: "user", userId: ownerId } as const;
const docxFixture = (): Buffer =>
  readFileSync(fileURLToPath(new URL("./fixtures/single-paragraph.docx", import.meta.url)));

let tenantA: string;
let tenantB: string;
let matterA: string;

beforeAll(async () => {
  const [ta] = await db
    .insert(tenants)
    .values({ name: "Upload Tenant A", storageRegion: "legacy" })
    .returning();
  const [tb] = await db
    .insert(tenants)
    .values({ name: "Upload Tenant B", storageRegion: "legacy" })
    .returning();
  tenantA = ta!.id;
  tenantB = tb!.id;
  await db.insert(user).values([
    {
      id: ownerId,
      name: "Owner",
      email: `${ownerId}@example.com`,
      emailVerified: true,
      tenantId: tenantA,
    },
    {
      id: outsiderId,
      name: "Out",
      email: `${outsiderId}@example.com`,
      emailVerified: true,
      tenantId: tenantB,
    },
  ]);
  matterA = await ensureDefaultMatter(ownerId, "Owner", tenantA);
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantA));
  await db.delete(tenants).where(eq(tenants.id, tenantB));
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, outsiderId));
  await sql.end();
});

// Real object storage (bytes -> S3/R2). Skip without credentials, like the
// document-docx suite.
const hasS3 = !!process.env.S3_ACCESS_KEY;

(hasS3 ? describe : describe.skip)("upload + extraction lifecycle", () => {
  test("a DOCX extracts to ready with markdown", async () => {
    const doc = await uploadDocument(ownerId, {
      title: "NDA",
      fileType: "docx",
      bytes: docxFixture(),
      matterId: matterA,
    });
    await processDocument(doc);
    const after = await getDocument(doc.id);
    expect(after?.status).toBe("ready");
    expect((after?.markdown ?? "").length).toBeGreaterThan(0);
  });

  test("corrupt bytes fail extraction; retry resets the row", async () => {
    const doc = await uploadDocument(ownerId, {
      title: "Broken",
      fileType: "docx",
      bytes: Buffer.from("this is not a real docx"),
      matterId: matterA,
    });
    await processDocument(doc);
    const failed = await getDocument(doc.id);
    expect(failed?.status).toBe("failed");
    expect(failed?.extractionError).toBeTruthy();
    expect(failed?.attempts).toBe(1);

    const reset = await retryDocument(doc.id);
    expect(reset?.status).toBe("pending");
    expect(reset?.attempts).toBe(0);
  });

  test("a different tenant cannot access the document for download", async () => {
    const doc = await uploadDocument(ownerId, {
      title: "Private",
      fileType: "docx",
      bytes: docxFixture(),
      matterId: matterA,
    });
    expect(await canAccessArtifact(ownerId, "document", doc.id)).toBe(true);
    expect(await canAccessArtifact(outsiderId, "document", doc.id)).toBe(false);
  });

  test("deleting a version removes its stored object", async () => {
    const doc = await uploadDocument(ownerId, {
      title: "Versioned",
      fileType: "docx",
      bytes: docxFixture(),
      matterId: matterA,
    });
    // Add v2 so v1 is no longer the active version (active can't be deleted).
    await addDocumentVersion(actor, doc.id, { fileType: "docx", bytes: docxFixture() });
    const versions = await listVersions(doc.id);
    const v1 = versions.find((v) => v.versionNumber === 1)!;
    const path = v1.storagePath!;
    expect(path).toBeTruthy();

    await deleteDocumentVersion(actor, doc.id, v1.id);

    const afterVersions = await listVersions(doc.id);
    const v1After = afterVersions.find((v) => v.id === v1.id)!;
    expect(v1After.deletedAt).toBeTruthy();
    expect(v1After.storagePath).toBeNull();
    // The bytes are gone from storage.
    await expect(getObject(tenantA, path)).rejects.toThrow();
  });
});
