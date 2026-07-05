import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { db, sql } from "@workspace/db/client";
import { tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { listCommits } from "../src/core/commit.js";
import { ensureDefaultMatter } from "../src/platform/matters.js";
import {
  getDocumentDetail,
  getEditsByRef,
  listVersions,
  proposeEdit,
  proposeEditDetail,
  resolveEdit,
  uploadDocument,
} from "../src/content/documents.js";
import { extractDocxBodyText } from "../src/content/docx/trackedChanges.js";

const userId = `test-user-${randomUUID()}`;
const actor = { type: "user", userId } as const;
const fixture = (): Buffer =>
  readFileSync(fileURLToPath(new URL("./fixtures/single-paragraph.docx", import.meta.url)));

let documentId: string;
let matterId: string;
let tenantId: string;

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Test Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Test User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  matterId = await ensureDefaultMatter(userId, "Test User", tenantId);
});

afterAll(async () => {
  // Deleting the tenant cascades clients -> matters -> documents -> members.
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

// Exercises real object storage (DOCX bytes -> S3/R2). Storage is S3-only with
// no local fallback, so skip when no S3 credentials are configured.
const hasS3 = !!process.env.S3_ACCESS_KEY;

(hasS3 ? describe : describe.skip)("document DOCX redline through the commit spine", () => {
  test("upload creates a versioned docx document", async () => {
    const doc = await uploadDocument(userId, {
      title: "NDA",
      fileType: "docx",
      bytes: fixture(),
      matterId,
    });
    documentId = doc.id;
    expect(doc.fileType).toBe("docx");
    expect(doc.currentVersionId).not.toBeNull();
    const result = await getDocumentDetail(documentId);
    expect(result).not.toBeNull();
    expect(result!.edits).toHaveLength(0);
  });

  test("propose routes through the OOXML engine and records a pending edit", async () => {
    await proposeEdit(actor, documentId, [{ find: "imported", replace: "global" }]);
    const result = await getDocumentDetail(documentId);
    expect(result!.edits).toHaveLength(1);
    const edit = result!.edits[0]!;
    expect(edit.status).toBe("pending");
    expect(edit.deletedText).toBe("imported");
    expect(edit.insertedText).toBe("global");
    expect(edit.blame).not.toBeNull(); // last_commit_id resolves
  });

  test("accept finalizes the change in the document text", async () => {
    const result0 = await getDocumentDetail(documentId);
    const changeId = result0!.edits[0]!.changeId;
    await resolveEdit(actor, documentId, changeId, "accept");
    const result = await getDocumentDetail(documentId);
    expect(result!.edits[0]!.status).toBe("accepted");
    expect(result!.document.markdown).toContain("global");
    expect(result!.document.markdown).not.toContain("imported");
  });

  test("context-anchored propose lands and getEditsByRef hydrates the chat card", async () => {
    // Fresh upload so the fixture's original "imported" token is intact.
    const doc = await uploadDocument(userId, {
      title: "NDA anchored",
      fileType: "docx",
      bytes: fixture(),
      matterId,
    });
    // Upload extraction is deferred, so derive the anchor text the same way the
    // engine flattens the body.
    const text = await extractDocxBodyText(fixture());
    const idx = text.indexOf("imported");
    expect(idx).toBeGreaterThanOrEqual(0);

    const changeIds = await proposeEdit(actor, doc.id, [
      {
        find: "imported",
        replace: "global",
        contextBefore: text.slice(Math.max(0, idx - 20), idx),
        contextAfter: text.slice(idx + "imported".length, idx + "imported".length + 20),
        reason: "consistency",
      },
    ]);
    expect(changeIds).toHaveLength(1);
    const changeId = changeIds[0]!;

    const cards = await getEditsByRef([{ documentId: doc.id, changeId }]);
    expect(cards).toHaveLength(1);
    expect(cards[0]).toMatchObject({
      documentId: doc.id,
      changeId,
      deletedText: "imported",
      insertedText: "global",
      reason: "consistency",
      status: "pending",
    });

    // Unknown change ids are dropped, not surfaced.
    expect(await getEditsByRef([{ documentId: doc.id, changeId: "nope" }])).toHaveLength(0);
  });

  test("a batch of edits commits as one version tagged assistant_edit", async () => {
    const agentActor = { type: "agent", userId, agentLabel: "chat" } as const;
    const doc = await uploadDocument(userId, {
      title: "NDA batch",
      fileType: "docx",
      bytes: fixture(),
      matterId,
    });
    const text = await extractDocxBodyText(fixture());
    const words = [...new Set(text.split(/\s+/).filter((w) => /^[A-Za-z]{5,}$/.test(w)))];
    expect(words.length).toBeGreaterThanOrEqual(2);
    const anchored = (w: string) => {
      const i = text.indexOf(w);
      return {
        find: w,
        replace: w.toUpperCase(),
        contextBefore: text.slice(Math.max(0, i - 15), i),
        contextAfter: text.slice(i + w.length, i + w.length + 15),
      };
    };
    const ids = await proposeEdit(agentActor, doc.id, [anchored(words[0]!), anchored(words[1]!)]);
    expect(ids).toHaveLength(2);

    // Two pending edits…
    const detail = await getDocumentDetail(doc.id);
    expect(detail!.edits.filter((e) => e.status === "pending")).toHaveLength(2);

    // …but ONE propose commit and ONE new version (upload = v1, batch = v2).
    const commitList = await listCommits("document", doc.id);
    expect(commitList.filter((c) => c.op === "propose_edit")).toHaveLength(1);
    const versions = await listVersions(doc.id);
    expect(versions).toHaveLength(2);
    expect(versions[0]!.versionNumber).toBe(2);
    expect(versions[0]!.source).toBe("assistant_edit");

    // Resolving produces another version tagged by the decision.
    await resolveEdit(agentActor, doc.id, ids[0]!, "accept");
    const after = await listVersions(doc.id);
    expect(after[0]!.versionNumber).toBe(3);
    expect(after[0]!.source).toBe("user_accept");
  });

  test("partial proposed edits report applied and failed counts without leaking edit text", async () => {
    const doc = await uploadDocument(userId, {
      title: "NDA partial",
      fileType: "docx",
      bytes: fixture(),
      matterId,
    });
    const text = await extractDocxBodyText(fixture());
    const idx = text.indexOf("imported");
    expect(idx).toBeGreaterThanOrEqual(0);

    const result = await proposeEditDetail(actor, doc.id, [
      {
        find: "imported",
        replace: "global",
        contextBefore: text.slice(Math.max(0, idx - 20), idx),
        contextAfter: text.slice(idx + "imported".length, idx + "imported".length + 20),
      },
      {
        find: "commercially sensitive missing text",
        replace: "replacement that must not be logged",
      },
    ]);

    expect(result.changeIds).toHaveLength(1);
    expect(result).toMatchObject({ requested: 2, applied: 1, failed: 1 });
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0]?.index).toBe(1);
    const serialized = JSON.stringify(result.errors);
    expect(serialized).not.toContain("commercially sensitive missing text");
    expect(serialized).not.toContain("replacement that must not be logged");
  });

  test("every mutation is a linear commit", async () => {
    const commitList = await listCommits("document", documentId);
    // propose + resolve (upload does not record a commit)
    expect(commitList).toHaveLength(2);
    expect(commitList.map((c) => c.op)).toEqual(["resolve_edit", "propose_edit"]);
  });
});
