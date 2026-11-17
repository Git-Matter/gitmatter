import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import JSZip from "jszip";
import { eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { documentEdits, documentVersions, tenants, user } from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import {
  addDocumentVersion,
  createGeneratedDocument,
  downloadDocumentBytes,
  getDocumentDetail,
  getDocument,
  getDocumentWordInspection,
  listVersions,
  proposeEdit,
  resolveEdit,
  uploadDocument,
} from "../src/content/documents.js";
import * as storage from "../src/core/storage.js";

const userId = `word-inspection-${randomUUID()}`;
const actor = { type: "user" as const, userId };
const objects = new Map<string, Buffer>();
let tenantId: string, matterId: string;
const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
async function source(incoming = false) {
  const zip = new JSZip();
  zip.file(
    "word/document.xml",
    `<w:document ${ns}><w:body><w:p><w:r><w:t>Alpha beta gamma.</w:t></w:r>${incoming ? '<w:ins w:id="1"><w:r><w:t>Incoming</w:t></w:r></w:ins>' : ""}</w:p></w:body></w:document>`
  );
  return zip.generateAsync({ type: "nodebuffer" });
}

beforeAll(async () => {
  vi.spyOn(storage, "putObject").mockImplementation(async (_tenant, key, bytes) => {
    objects.set(key, Buffer.from(bytes));
  });
  vi.spyOn(storage, "getObject").mockImplementation(async (_tenant, key) => {
    const bytes = objects.get(key);
    if (!bytes) throw new Error("Synthetic missing source");
    return Buffer.from(bytes);
  });
  vi.spyOn(storage, "deleteObject").mockImplementation(async (_tenant, key) => {
    objects.delete(key);
  });
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Synthetic Word inspection" })
    .returning();
  tenantId = tenant!.id;
  await db.insert(user).values({
    id: userId,
    tenantId,
    name: "Synthetic reviewer",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  const client = await createClient(userId, tenantId, { name: "Synthetic client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Synthetic matter" })).id;
});
afterAll(async () => {
  vi.restoreAllMocks();
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("Word inspection at audited document boundaries", () => {
  test("known version hashes deny altered storage bytes before proposal or clean output", async () => {
    const doc = await createGeneratedDocument(actor, {
      matterId,
      spec: {
        title: "Immutable byte binding",
        blocks: [{ type: "paragraph", text: "Alpha beta gamma." }],
      },
    });
    const [version] = await listVersions(doc.id);
    objects.set(version!.storagePath!, await source(true));
    expect(
      await getDocumentWordInspection(doc, doc.currentVersionId, undefined, db, true)
    ).toMatchObject({
      inspection: { status: "uninspectable", reasons: ["inspection_mismatch"] },
      safeClean: false,
      safeToEdit: false,
    });
    await expect(
      proposeEdit(actor, doc.id, [{ find: "Alpha", replace: "Changed" }])
    ).rejects.toThrow("do not match");
    await expect(
      downloadDocumentBytes(doc, version!.storagePath!, actor, false, true)
    ).rejects.toThrow("do not match");
    expect((await getDocument(doc.id))?.headCommitId).toBe(doc.headCommitId);
    expect(await listVersions(doc.id)).toHaveLength(1);
  });

  test("upload stores byte-bound inspection and refuses incoming changes without modifying source or history", async () => {
    const bytes = await source(true);
    const doc = await uploadDocument(userId, {
      title: "Incoming revisions",
      fileType: "docx",
      bytes,
      matterId,
    });
    const [version] = await listVersions(doc.id);
    const detail = await getDocumentDetail(doc.id, actor);
    const headBefore = detail!.document.headCommitId;
    expect(version?.wordInspection?.status).toBe("complete");
    expect(detail?.wordInspection).toMatchObject({
      versionId: doc.currentVersionId,
      incomingRevisions: 1,
      registeredRevisions: 0,
      safeToEdit: false,
      safeClean: false,
    });
    expect(detail?.resolutionPolicy).toMatchObject({ mayPropose: false, mayResolve: false });
    expect(objects.get(version!.storagePath!)?.equals(bytes)).toBe(true);
    await expect(
      proposeEdit(actor, doc.id, [{ find: "Alpha", replace: "Changed" }])
    ).rejects.toThrow("cannot attest");
    await expect(
      downloadDocumentBytes(doc, version!.storagePath!, actor, false, true)
    ).rejects.toThrow("cannot attest");
    expect((await getDocument(doc.id))?.headCommitId).toBe(headBefore);
    expect(await listVersions(doc.id)).toHaveLength(1);
  });

  test("multiple audited app proposals survive and a partial decision preserves the remainder", async () => {
    const doc = await createGeneratedDocument(actor, {
      matterId,
      spec: {
        title: "Recorded Word proposals",
        blocks: [{ type: "paragraph", text: "Alpha beta gamma." }],
      },
    });
    const [first] = await proposeEdit(actor, doc.id, [{ find: "Alpha", replace: "Omega" }]);
    await proposeEdit(actor, doc.id, [{ find: "gamma", replace: "delta" }]);
    let detail = (await getDocumentDetail(doc.id, actor))!;
    expect(detail.wordInspection).toMatchObject({
      registeredRevisions: 4,
      incomingRevisions: 0,
      safeToEdit: true,
    });
    expect(detail.edits.filter((edit) => edit.status === "pending")).toHaveLength(2);
    await resolveEdit(actor, doc.id, first!, "accept", {
      expectedHeadCommitId: detail.document.headCommitId,
      approvalContext: detail.resolutionPolicy.approvalContext ?? undefined,
    });
    detail = (await getDocumentDetail(doc.id, actor))!;
    expect(detail.wordInspection).toMatchObject({
      registeredRevisions: 2,
      incomingRevisions: 0,
      safeToEdit: true,
      safeClean: false,
    });
    const [latest] = await listVersions(doc.id);
    expect(latest?.wordInspection?.sourceHash).toBe(detail.wordInspection?.inspection.sourceHash);
  });

  test("a proposal cannot implicitly accept an overlapping pending insertion", async () => {
    const doc = await createGeneratedDocument(actor, {
      matterId,
      spec: {
        title: "Overlapping proposal",
        blocks: [{ type: "paragraph", text: "Alpha beta gamma." }],
      },
    });
    await proposeEdit(actor, doc.id, [{ find: "beta", replace: "omega" }]);
    const before = (await getDocument(doc.id))!;
    await expect(proposeEdit(actor, doc.id, [{ find: "omega", replace: "sigma" }])).rejects.toThrow(
      "cannot attest"
    );
    expect((await getDocument(doc.id))?.headCommitId).toBe(before.headCommitId);
    expect(await listVersions(doc.id)).toHaveLength(2);
  });

  test("legacy inspection is readonly and cannot invent metadata or safety after storage loss", async () => {
    const doc = await uploadDocument(userId, {
      title: "Legacy Word",
      fileType: "docx",
      bytes: await source(true),
      matterId,
    });
    await db
      .update(documentVersions)
      .set({ wordInspection: null })
      .where(eq(documentVersions.id, doc.currentVersionId!));
    expect((await getDocumentDetail(doc.id, actor))?.wordInspection).toMatchObject({
      incomingRevisions: 1,
      safeToEdit: false,
    });
    let [version] = await listVersions(doc.id);
    expect(version?.wordInspection).toBeNull();
    objects.delete(version!.storagePath!);
    expect((await getDocumentDetail(doc.id, actor))?.wordInspection).toMatchObject({
      inspection: { status: "uninspectable", reasons: ["storage_unavailable"] },
      safeClean: false,
    });
    [version] = await listVersions(doc.id);
    expect(version?.wordInspection).toBeNull();
  });

  test("matching ids and text in an uploaded source cannot impersonate recorded application edits", async () => {
    const doc = await uploadDocument(userId, {
      title: "Incoming id collision",
      fileType: "docx",
      bytes: await source(true),
      matterId,
    });
    await db.insert(documentEdits).values({
      documentId: doc.id,
      versionId: doc.currentVersionId,
      changeId: randomUUID(),
      insWId: "1",
      insertedText: "Incoming",
      status: "pending",
      createdBy: userId,
      lastCommitId: doc.headCommitId,
    });
    expect((await getDocumentDetail(doc.id, actor))?.wordInspection?.safeToEdit).toBe(false);
    await expect(
      proposeEdit(actor, doc.id, [{ find: "Alpha", replace: "Changed" }])
    ).rejects.toThrow("provenance");
  });

  test("replacement binds a new inspection and preserves the original uploaded bytes", async () => {
    const original = await source(true);
    const doc = await uploadDocument(userId, {
      title: "Returned draft",
      fileType: "docx",
      bytes: original,
      matterId,
    });
    const [first] = await listVersions(doc.id);
    const updated = await addDocumentVersion(actor, doc.id, {
      fileType: "docx",
      bytes: await source(),
    });
    expect((await getDocumentDetail(doc.id, actor))?.wordInspection).toMatchObject({
      versionId: updated.currentVersionId,
      incomingRevisions: 0,
      safeClean: true,
    });
    expect(objects.get(first!.storagePath!)?.equals(original)).toBe(true);
    expect(await listVersions(doc.id)).toHaveLength(2);
  });
});
