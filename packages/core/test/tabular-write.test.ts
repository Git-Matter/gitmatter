import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { documents, tabularCells, tabularReviews, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { writeCell } from "../src/ai/tabular/index.js";
import { resolveRunModel } from "../src/ai/provider/index.js";
import { listCommits } from "../src/core/commit.js";
import { ensureDefaultMatter } from "../src/platform/matters.js";

const userId = `test-user-${randomUUID()}`;
const actor = { type: "agent" as const, userId, agentLabel: "mcp:test" };
let tenantId: string;
let reviewId: string;
let documentId: string;

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Write Cell Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Test User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const matterId = await ensureDefaultMatter(userId, "Test User", tenantId);
  const [doc] = await db
    .insert(documents)
    .values({
      userId,
      tenantId,
      matterId,
      title: "Agreement.pdf",
      fileType: "pdf",
      markdown: "[Page 1]\n\nGoverning law: Delaware.",
      status: "ready",
    })
    .returning();
  documentId = doc!.id;
  const [r] = await db
    .insert(tabularReviews)
    .values({
      userId,
      tenantId,
      matterId,
      createdBy: userId,
      title: "Write Cell Review",
      columnsConfig: [{ index: 0, name: "Governing law", prompt: "What law governs?" }],
      documentIds: [documentId],
    })
    .returning();
  reviewId = r!.id;
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("writeCell", () => {
  test("agent value lands in the cell and records a write_cell commit", async () => {
    const result = await writeCell(actor, {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "Delaware",
      flag: "green",
      reasoning: "Stated on page 1.",
      citations: [{ page: 1, quote: "Governing law: Delaware." }],
    });

    // The commit reports the cell change on the audit spine.
    expect(
      result.changes.find((change) => change.path === `cell/${documentId}/0`)?.after
    ).toMatchObject({ summary: "Delaware", flag: "green" });
    expect(
      result.changes.find((change) => change.path === `cell/${documentId}/0/citations`)?.after
    ).toEqual([{ quote: "Governing law: Delaware." }]);

    const [cell] = await db.select().from(tabularCells).where(eq(tabularCells.reviewId, reviewId));
    expect(cell!.content).toMatchObject({ summary: "Delaware", flag: "green" });
    // Pasted page markers plus a PDF label do not establish a captured page map.
    expect(cell!.citations).toEqual([{ quote: "Governing law: Delaware." }]);
    expect(cell!.status).toBe("done");

    const commits = await listCommits("tabular_review", reviewId);
    expect(commits.some((c) => c.op === "write_cell")).toBe(true);
  });

  test("an invalid flag is coerced to grey", async () => {
    await writeCell(actor, {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "x",
      flag: "purple",
      reasoning: "",
    });
    const [cell] = await db.select().from(tabularCells).where(eq(tabularCells.reviewId, reviewId));
    expect((cell!.content as { flag: string }).flag).toBe("grey");
  });
});

describe("resolveRunModel", () => {
  test("rejects an unknown model id before any key lookup", async () => {
    await expect(resolveRunModel(userId, "openai")).rejects.toThrow(/Unknown model/);
  });
});
