import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { and, eq, sql as statement } from "drizzle-orm";
import JSZip from "jszip";
import { db, sql } from "@workspace/db/client";
import {
  artifactShares,
  auditEvents,
  documentReviews,
  documentVersions,
  documents,
  matterMembers,
  tenants,
  user,
} from "@workspace/db/schema";
import { listCommits } from "../src/core/commit.js";
import {
  addDocumentVersion,
  createDocument,
  proposeEdit,
  processDocument,
  renameDocument,
  resolveEdit,
  uploadDocument,
} from "../src/content/documents.js";
import {
  exportDocumentReview,
  getDocumentReview,
  recordDocumentReview,
} from "../src/content/documentReview.js";
import { createClient, createMatter } from "../src/platform/matters.js";
import { getPracticeProfile, savePracticeProfile } from "../src/platform/practice-profile.js";
import { inspectDocx } from "../src/content/docx/inspection.js";

// Real Postgres and canonical Word bytes; object I/O is synthetic and local.
const stored = vi.hoisted(() => new Map<string, Uint8Array>());
vi.mock("../src/core/storage.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  putObject: async (_tenant: string, key: string, bytes: Uint8Array) => {
    stored.set(key, new Uint8Array(bytes));
  },
  getObject: async (_tenant: string, key: string) => {
    if (!stored.has(key)) throw new Error("Synthetic object missing");
    return new Uint8Array(stored.get(key)!);
  },
  deleteObject: async (_tenant: string, key: string) => {
    stored.delete(key);
  },
}));

const uid = `practice-${randomUUID()}`;
const outsider = `outside-${randomUUID()}`;
const member = `member-${randomUUID()}`;
const actor = { type: "user" as const, userId: uid };
const scope = "Checked the wording and dates against the provided source documents.";
let tenantId: string;
let otherTenant: string;
let matterId: string;

beforeAll(async () => {
  const [tenant] = await db
    .insert(tenants)
    .values({ name: "Practice review tests", storageRegion: "legacy" })
    .returning();
  const [other] = await db.insert(tenants).values({ name: "Other practice" }).returning();
  tenantId = tenant!.id;
  otherTenant = other!.id;
  await db.insert(user).values([
    {
      id: uid,
      name: "Practitioner Example",
      email: `${uid}@example.com`,
      tenantId,
      tenantRole: "admin",
    },
    {
      id: member,
      name: "Practice Member",
      email: `${member}@example.com`,
      tenantId,
      tenantRole: "member",
    },
    {
      id: outsider,
      name: "Outsider",
      email: `${outsider}@example.com`,
      tenantId: otherTenant,
      tenantRole: "admin",
    },
  ]);
  const client = await createClient(uid, tenantId, { name: "Fictional Review Client" });
  matterId = (await createMatter(uid, { clientId: client.id, name: "Review Test" })).id;
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(tenants).where(eq(tenants.id, otherTenant));
  await db.delete(user).where(eq(user.id, uid));
  await db.delete(user).where(eq(user.id, member));
  await db.delete(user).where(eq(user.id, outsider));
  await sql.end();
});

async function makeDocument() {
  return createDocument(uid, {
    title: "Fictional client update",
    markdown: "The agreed fee is AUD 1000.",
    matterId,
  });
}

describe("practice preferences", () => {
  test("admin saves tenant preferences atomically with a content-free audit event", async () => {
    const profile = {
      displayName: "Test Practice",
      correspondenceHeader: "Test letterhead",
      signOff: "Kind regards",
      jurisdiction: "AU-NSW" as const,
      instructions: "Use short paragraphs.",
    };
    const result = await savePracticeProfile(uid, profile);
    expect(result.profile).toEqual(profile);
    expect(result.canEdit).toBe(true);
    expect((await getPracticeProfile(member)).profile).toEqual(profile);
    expect((await getPracticeProfile(outsider)).profile.displayName).toBe("");
    const [event] = await db
      .select()
      .from(auditEvents)
      .where(
        and(
          eq(auditEvents.tenantId, tenantId),
          eq(auditEvents.eventType, "practice.profile_updated")
        )
      );
    expect(event?.actorId).toBe(uid);
    expect(JSON.stringify(event?.metadata)).not.toContain("Test letterhead");
    await expect(savePracticeProfile(member, profile)).rejects.toThrow("administrator");
  });
});

describe("practitioner review", () => {
  test("records authenticated reviewer, commits scope, and survives reload and exact retries", async () => {
    const doc = await makeDocument();
    const state = await getDocumentReview(uid, doc.id);
    expect(state.canReview).toBe(true);
    expect(state.documentVersionId).toBe(doc.currentVersionId);
    expect(state.documentHeadCommitId).toBe(doc.headCommitId);
    const input = { expectedStateToken: state.stateToken, scope };
    const reviewed = await recordDocumentReview(actor, doc.id, input);
    expect(reviewed.currentReview?.reviewerName).toBe("Practitioner Example");
    expect(reviewed.currentReview?.stateToken).toBe(state.stateToken);
    await recordDocumentReview(actor, doc.id, input);
    expect((await getDocumentReview(uid, doc.id)).history).toHaveLength(1);
    expect(
      (await listCommits("document", doc.id)).filter((c) => c.op === "practitioner_review")
    ).toHaveLength(1);
    const bytes = await exportDocumentReview(uid, doc.id);
    const archive = await JSZip.loadAsync(bytes);
    const content = await archive.file("word/document.xml")!.async("string");
    expect(content).toContain("Practitioner Example");
    expect(content).toContain(scope);
    expect(content).toContain(state.stateToken);
    expect(content).toContain("does not certify legal correctness");
  });
  test("rejects agents, cross-tenant users, and stale expected document states", async () => {
    const doc = await makeDocument();
    const state = await getDocumentReview(uid, doc.id);
    const input = { expectedStateToken: state.stateToken, scope };
    await expect(
      recordDocumentReview({ type: "agent", userId: uid, agentLabel: "test" }, doc.id, input)
    ).rejects.toThrow("Only a practitioner");
    await expect(getDocumentReview(outsider, doc.id)).rejects.toThrow("not found");
    await expect(
      recordDocumentReview({ type: "user", userId: outsider }, doc.id, input)
    ).rejects.toThrow("not found");
    await renameDocument(actor, doc.id, "Updated title");
    await expect(recordDocumentReview(actor, doc.id, input)).rejects.toThrow("changed");
  });
  test("pending edits block attestation, later edits stale review, and reversal never revives it", async () => {
    const doc = await makeDocument();
    const state = await getDocumentReview(uid, doc.id);
    await recordDocumentReview(actor, doc.id, { expectedStateToken: state.stateToken, scope });
    const [change] = await proposeEdit(actor, doc.id, [{ find: "1000", replace: "2000" }]);
    const pending = await getDocumentReview(uid, doc.id);
    expect(pending.canReview).toBe(false);
    expect(pending.currentReview).toBeNull();
    await expect(
      recordDocumentReview(actor, doc.id, { expectedStateToken: pending.stateToken, scope })
    ).rejects.toThrow("pending");
    await resolveEdit(actor, doc.id, change!, "reject");
    const resolved = await getDocumentReview(uid, doc.id);
    expect(resolved.canReview).toBe(true);
    expect(resolved.currentReview).toBeNull();
    expect(resolved.stateToken).not.toBe(state.stateToken);
  });
  test("a concurrent mutation cannot make an old review current", async () => {
    const doc = await makeDocument();
    const state = await getDocumentReview(uid, doc.id);
    const outcomes = await Promise.allSettled([
      recordDocumentReview(actor, doc.id, { expectedStateToken: state.stateToken, scope }),
      renameDocument(actor, doc.id, "Concurrent title change"),
    ]);
    expect(outcomes[1]!.status).toBe("fulfilled");
    expect((await getDocumentReview(uid, doc.id)).currentReview).toBeNull();
    await db.update(documents).set({ status: "processing" }).where(eq(documents.id, doc.id));
    expect((await getDocumentReview(uid, doc.id)).canReview).toBe(false);
  });

  test.each(["matter", "share"] as const)(
    "revoking %s editor access while review waits for the document lock prevents any attestation",
    async (access) => {
      const doc = await makeDocument();
      if (access === "matter")
        await db.insert(matterMembers).values({ matterId, userId: member, role: "editor" });
      else
        await db
          .insert(artifactShares)
          .values({ artifactType: "document", artifactId: doc.id, userId: member, role: "editor" });
      const state = await getDocumentReview(member, doc.id);
      let release!: () => void;
      let acquired!: () => void;
      const held = new Promise<void>((resolve) => {
        release = resolve;
      });
      const ready = new Promise<void>((resolve) => {
        acquired = resolve;
      });
      const blocker = db.transaction(async (tx) => {
        await tx.execute(
          statement`select pg_advisory_xact_lock(hashtext(${`document:${doc.id}`}))`
        );
        acquired();
        await held;
      });
      await ready;
      const pending = recordDocumentReview({ type: "user", userId: member }, doc.id, {
        expectedStateToken: state.stateToken,
        scope,
      }).then(
        () => null,
        (error: unknown) => error
      );
      try {
        let waiting = false;
        const deadline = Date.now() + 3000;
        while (!waiting && Date.now() < deadline) {
          const rows = (await db.execute(
            statement`select exists(select 1 from pg_locks where locktype='advisory' and not granted and objid::bigint=(hashtext(${`document:${doc.id}`})::bigint & 4294967295)) as waiting`
          )) as unknown as Array<{ waiting: boolean }>;
          waiting = rows[0]!.waiting;
          if (!waiting) await new Promise((resolve) => setTimeout(resolve, 10));
        }
        expect(waiting).toBe(true);
        if (access === "matter")
          await db
            .delete(matterMembers)
            .where(and(eq(matterMembers.matterId, matterId), eq(matterMembers.userId, member)));
        else
          await db
            .delete(artifactShares)
            .where(and(eq(artifactShares.artifactId, doc.id), eq(artifactShares.userId, member)));
        release();
        await blocker;
        const error = await pending;
        expect(error).toBeInstanceOf(Error);
        expect((error as Error).message).toContain("not found");
        expect(
          await db.select().from(documentReviews).where(eq(documentReviews.documentId, doc.id))
        ).toHaveLength(0);
        expect(
          (await listCommits("document", doc.id)).filter(
            (commit) => commit.op === "practitioner_review"
          )
        ).toHaveLength(0);
      } finally {
        release();
        await blocker;
      }
    }
  );

  test("Word revision inspection fails closed when the stored version is unavailable", async () => {
    const doc = await makeDocument();
    const [version] = await db
      .insert(documentVersions)
      .values({
        documentId: doc.id,
        versionNumber: 1,
        source: "upload",
        fileType: "docx",
        storagePath: null,
      })
      .returning();
    await db
      .update(documents)
      .set({ fileType: "docx", currentVersionId: version!.id })
      .where(eq(documents.id, doc.id));
    const state = await getDocumentReview(uid, doc.id);
    expect(state.canReview).toBe(false);
    expect(state.blockedReason).toContain("could not be verified");
    await expect(
      recordDocumentReview(actor, doc.id, { expectedStateToken: state.stateToken, scope })
    ).rejects.toThrow("could not be verified");
    expect((await getDocumentReview(uid, doc.id)).history).toHaveLength(0);
  });

  test("native Word revisions block review; clean replacement permits it and later versions stale it", async () => {
    const zip = await JSZip.loadAsync(
      readFileSync(new URL("./fixtures/single-paragraph.docx", import.meta.url))
    );
    const xml = await zip.file("word/document.xml")!.async("string");
    zip.file(
      "word/document.xml",
      xml.replace(
        "<w:body>",
        '<w:body><w:ins w:id="501"><w:r><w:t>Unresolved incoming change</w:t></w:r></w:ins>'
      )
    );
    const uploaded = await uploadDocument(uid, {
      title: "Incoming revisions",
      fileType: "docx",
      bytes: await zip.generateAsync({ type: "nodebuffer" }),
      matterId,
    });
    await processDocument(uploaded);
    const state = await getDocumentReview(uid, uploaded.id);
    expect(state.canReview).toBe(false);
    expect(state.blockedReason).toContain("unresolved revisions");
    await expect(
      recordDocumentReview(actor, uploaded.id, { expectedStateToken: state.stateToken, scope })
    ).rejects.toThrow("unresolved revisions");
    const cleanBytes = readFileSync(new URL("./fixtures/single-paragraph.docx", import.meta.url));
    const clean = await addDocumentVersion(actor, uploaded.id, {
      fileType: "docx",
      bytes: cleanBytes,
    });
    await processDocument(clean);
    const cleanState = await getDocumentReview(uid, uploaded.id);
    expect(cleanState.canReview).toBe(true);
    expect(cleanState.documentVersionId).not.toBe(state.documentVersionId);
    await recordDocumentReview(actor, uploaded.id, {
      expectedStateToken: cleanState.stateToken,
      scope,
    });
    expect((await getDocumentReview(uid, uploaded.id)).currentReview).not.toBeNull();
    const next = await addDocumentVersion(actor, uploaded.id, {
      fileType: "docx",
      bytes: cleanBytes,
    });
    await processDocument(next);
    expect((await getDocumentReview(uid, uploaded.id)).currentReview).toBeNull();
  });
  test("blank scanned PDF sources cannot be attested through the text-display workflow", async () => {
    const doc = await makeDocument();
    const [version] = await db
      .insert(documentVersions)
      .values({ documentId: doc.id, versionNumber: 1, source: "upload", fileType: "pdf" })
      .returning();
    await db
      .update(documents)
      .set({ fileType: "pdf", currentVersionId: version!.id, markdown: "", ocrSuggested: true })
      .where(eq(documents.id, doc.id));
    const state = await getDocumentReview(uid, doc.id);
    expect(state.canReview).toBe(false);
    expect(state.blockedReason).toContain("no extracted text");
    await expect(
      recordDocumentReview(actor, doc.id, { expectedStateToken: state.stateToken, scope })
    ).rejects.toThrow("no extracted text");
    expect(
      await db.select().from(documentReviews).where(eq(documentReviews.documentId, doc.id))
    ).toHaveLength(0);
    expect(
      (await listCommits("document", doc.id)).some((commit) => commit.op === "practitioner_review")
    ).toBe(false);
    await db
      .update(documents)
      .set({ markdown: "Visible extracted source text.", ocrSuggested: false })
      .where(eq(documents.id, doc.id));
    expect((await getDocumentReview(uid, doc.id)).canReview).toBe(true);
  });

  test("changed stored Word bytes cannot replace the recorded inspected source", async () => {
    const bytes = readFileSync(new URL("./fixtures/single-paragraph.docx", import.meta.url));
    const uploaded = await uploadDocument(uid, {
      title: "Integrity fixture",
      fileType: "docx",
      bytes,
      matterId,
    });
    await processDocument(uploaded);
    const [version] = await db
      .select()
      .from(documentVersions)
      .where(eq(documentVersions.id, uploaded.currentVersionId!));
    const changed = await JSZip.loadAsync(bytes);
    const xml = await changed.file("word/document.xml")!.async("string");
    changed.file(
      "word/document.xml",
      xml.replace("<w:body>", "<w:body><w:p><w:r><w:t>Altered stored source</w:t></w:r></w:p>")
    );
    stored.set(version!.storagePath!, await changed.generateAsync({ type: "uint8array" }));
    const state = await getDocumentReview(uid, uploaded.id);
    expect(state.canReview).toBe(false);
    await expect(
      recordDocumentReview(actor, uploaded.id, { expectedStateToken: state.stateToken, scope })
    ).rejects.toThrow("could not be verified");
    expect(
      await db.select().from(documentReviews).where(eq(documentReviews.documentId, uploaded.id))
    ).toHaveLength(0);
    expect(
      (await listCommits("document", uploaded.id)).some(
        (commit) => commit.op === "practitioner_review"
      )
    ).toBe(false);
  });

  test.each(["unsupported", "archive-limit"] as const)(
    "%s Word content remains blocked even if legacy metadata calls the document ready",
    async (kind) => {
      const doc = await makeDocument();
      const zip = new JSZip();
      const body =
        kind === "archive-limit"
          ? `<w:p><w:r><w:t>${"a".repeat(4 * 1024 * 1024 + 1)}</w:t></w:r></w:p>`
          : '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DATE</w:instrText></w:r><w:r><w:t>Displayed date</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>';
      zip.file(
        "word/document.xml",
        `<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body}</w:body></w:document>`
      );
      const bytes = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const storagePath = `${tenantId}/${uid}/${doc.id}/synthetic.docx`;
      stored.set(storagePath, bytes);
      const [version] = await db
        .insert(documentVersions)
        .values({
          documentId: doc.id,
          versionNumber: 1,
          source: "upload",
          fileType: "docx",
          storagePath,
          wordInspection: await inspectDocx(bytes),
        })
        .returning();
      await db
        .update(documents)
        .set({ fileType: "docx", currentVersionId: version!.id })
        .where(eq(documents.id, doc.id));
      const state = await getDocumentReview(uid, doc.id);
      expect(state.canReview).toBe(false);
      await expect(
        recordDocumentReview(actor, doc.id, { expectedStateToken: state.stateToken, scope })
      ).rejects.toThrow();
      expect(
        await db.select().from(documentReviews).where(eq(documentReviews.documentId, doc.id))
      ).toHaveLength(0);
      expect(
        (await listCommits("document", doc.id)).some(
          (commit) => commit.op === "practitioner_review"
        )
      ).toBe(false);
    }
  );
});
