import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { db, sql } from "@workspace/db/client";
import {
  documents,
  documentVersions,
  tabularCells,
  tabularReviews,
  tenants,
  user,
} from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { createClient, createMatter } from "../src/platform/matters.js";
import { prepareReviewExport } from "../src/content/reviewExport.js";
import { setApprovalPolicy } from "../src/core/approval.js";
import { writeCell } from "../src/ai/tabular/runner.js";

const userId = `export-review-${randomUUID()}`;
const human = { type: "user" as const, userId };
let tenantId: string, matterId: string, documentId: string, reviewId: string;
const versionId = randomUUID();

beforeAll(async () => {
  const [tenant] = await db.insert(tenants).values({ name: "Synthetic clean export" }).returning();
  tenantId = tenant!.id;
  await db.insert(user).values({
    id: userId,
    name: "Synthetic reviewer",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const client = await createClient(userId, tenantId, { name: "Synthetic client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Synthetic matter" })).id;
  const [doc] = await db
    .insert(documents)
    .values({
      userId,
      tenantId,
      matterId,
      title: "Synthetic export source",
      fileType: "docx",
      status: "ready",
      markdown: "Synthetic source",
      currentVersionId: versionId,
    })
    .returning();
  documentId = doc!.id;
  await db.insert(documentVersions).values({
    id: versionId,
    documentId,
    versionNumber: 1,
    fileType: "docx",
    storagePath: "synthetic-immutable-reference.docx",
    source: "upload",
  });
  const [review] = await db
    .insert(tabularReviews)
    .values({
      userId,
      tenantId,
      matterId,
      createdBy: userId,
      title: "Synthetic review",
      columnsConfig: [{ index: 0, name: "Synthetic rule", prompt: "Synthetic prompt" }],
      documentIds: [documentId],
      inputSnapshot: {
        revision: 1,
        createdAt: new Date().toISOString(),
        playbookId: randomUUID(),
        playbookRevision: "synthetic-seed",
        documents: [
          {
            id: documentId,
            title: doc!.title,
            versionId,
            headCommitId: null,
            text: "Synthetic source",
          },
        ],
        rules: [
          {
            id: "synthetic-rule",
            columnIndex: 0,
            name: "Synthetic rule",
            severity: "red",
            standardPosition: "Synthetic source",
            clauses: [],
          },
        ],
      },
    })
    .returning();
  reviewId = review!.id;
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("clean export snapshot", () => {
  test("unfinished finding cannot authorize clean output", async () => {
    await expect(prepareReviewExport(human, reviewId, documentId)).rejects.toThrow(
      "input_not_ready"
    );
  });
  test("pins the accepted immutable version without generating or resolving content", async () => {
    await writeCell(human, {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "Conforms",
      flag: "green",
      reasoning: "Synthetic fixture",
      citations: [{ quote: "Synthetic source" }],
    });
    const snapshot = await prepareReviewExport(human, reviewId, documentId);
    expect(snapshot.versionId).toBe(versionId);
    expect(snapshot.storagePath).toBe("synthetic-immutable-reference.docx");
    expect(snapshot.doc.currentVersionId).toBe(versionId);
  });
  test("an out-of-scope agent cannot obtain the export snapshot", async () => {
    await expect(
      prepareReviewExport(
        {
          type: "agent",
          userId,
          agentLabel: "mcp:outside",
          scope: { matterIds: [randomUUID()], maxRole: "owner" },
        },
        reviewId,
        documentId
      )
    ).rejects.toThrow("access_denied");
  });
  test("pending governed content blocks export even when the old accepted finding conforms", async () => {
    await setApprovalPolicy(human, matterId, {
      policy: { agentCells: "owner" },
      expectedRevision: 0,
      reason: "Synthetic owner gate",
    });
    await writeCell(
      { type: "agent", userId, agentLabel: "mcp:synthetic" },
      {
        reviewId,
        documentId,
        columnIndex: 0,
        summary: "New proposed finding",
        flag: "red",
        reasoning: "Synthetic fixture",
        citations: [{ quote: "Synthetic source" }],
      }
    );
    const [cell] = await db.select().from(tabularCells).where(eq(tabularCells.reviewId, reviewId));
    expect(cell!.content!.flag).toBe("green");
    await expect(prepareReviewExport(human, reviewId, documentId)).rejects.toThrow(
      "input_not_ready"
    );
  });
});
