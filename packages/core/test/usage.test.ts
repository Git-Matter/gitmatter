import { afterAll, afterEach, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import {
  auditEvents,
  documentVersions,
  documents,
  tenants,
  usageEvents,
  user,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import {
  assertStorageWithinQuota,
  recordLlmUsage,
  recordToolCall,
  StorageQuotaError,
  tenantStorageBytes,
} from "../src/platform/usage.js";

let tenantId: string;
const userId = `usage-${randomUUID()}`;

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Usage Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Usage User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
});

afterEach(async () => {
  delete process.env.USER_LLM_TOKEN_BUDGET;
  delete process.env.MCP_TOKEN_CALL_BUDGET;
  delete process.env.TENANT_STORAGE_QUOTA_GB;
  await db.delete(usageEvents).where(eq(usageEvents.userId, userId));
  await db.delete(auditEvents).where(eq(auditEvents.actorId, userId));
  await db.delete(documents).where(eq(documents.tenantId, tenantId));
});

afterAll(async () => {
  await db.delete(documents).where(eq(documents.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

// Insert a document + one version carrying `sizeBytes`. `stored` controls whether
// the version still holds its bytes (storagePath set) — a tombstoned version has
// it nulled and must not count toward the tenant's footprint.
async function seedVersion(sizeBytes: number, stored = true): Promise<void> {
  const [doc] = await db
    .insert(documents)
    .values({ userId, tenantId, title: "q", fileType: "pdf" })
    .returning();
  await db.insert(documentVersions).values({
    documentId: doc!.id,
    versionNumber: 1,
    storagePath: stored ? `${tenantId}/${userId}/${doc!.id}.pdf` : null,
    source: "upload",
    sizeBytes,
    fileType: "pdf",
  });
}

describe("recordLlmUsage", () => {
  test("appends a usage row and never throws", async () => {
    await recordLlmUsage({
      userId,
      tenantId,
      provider: "anthropic",
      model: "m",
      inputTokens: 10,
      outputTokens: 5,
    });
    const rows = await db.select().from(usageEvents).where(eq(usageEvents.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.kind).toBe("llm");
    expect(rows[0]!.inputTokens).toBe(10);
  });

  test("over budget emits a budget.exceeded audit row, still returns normally", async () => {
    process.env.USER_LLM_TOKEN_BUDGET = "20";
    // 15 + 15 = 30 tokens > 20 budget on the second call.
    await recordLlmUsage({ userId, tenantId, inputTokens: 10, outputTokens: 5 });
    await recordLlmUsage({ userId, tenantId, inputTokens: 10, outputTokens: 5 });
    const flagged = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.eventType, "budget.exceeded"), eq(auditEvents.actorId, userId)));
    expect(flagged.length).toBeGreaterThanOrEqual(1);
  });

  test("under budget writes no budget.exceeded row", async () => {
    process.env.USER_LLM_TOKEN_BUDGET = "1000";
    await recordLlmUsage({ userId, tenantId, inputTokens: 10, outputTokens: 5 });
    const flagged = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.eventType, "budget.exceeded"), eq(auditEvents.actorId, userId)));
    expect(flagged).toHaveLength(0);
  });
});

describe("recordToolCall", () => {
  test("over per-token budget flags, under does not", async () => {
    const tokenId = randomUUID();
    process.env.MCP_TOKEN_CALL_BUDGET = "2";
    await recordToolCall({ tokenId, userId, tenantId, tool: "search" });
    await recordToolCall({ tokenId, userId, tenantId, tool: "search" });
    let flagged = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.eventType, "budget.exceeded"), eq(auditEvents.actorId, userId)));
    expect(flagged).toHaveLength(0); // 2 == budget, not over
    await recordToolCall({ tokenId, userId, tenantId, tool: "search" });
    flagged = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.eventType, "budget.exceeded"), eq(auditEvents.actorId, userId)));
    expect(flagged.length).toBeGreaterThanOrEqual(1); // 3 > 2
  });
});

describe("tenant storage quota", () => {
  const GB = 1024 * 1024 * 1024;

  test("tenantStorageBytes sums stored versions, ignores tombstoned bytes", async () => {
    await seedVersion(1000);
    await seedVersion(500);
    await seedVersion(9999, false); // tombstoned: storagePath null, must not count
    expect(await tenantStorageBytes(tenantId)).toBe(1500);
  });

  test("assertStorageWithinQuota passes under the cap", async () => {
    process.env.TENANT_STORAGE_QUOTA_GB = "1"; // 1 GB cap
    await seedVersion(Math.round(0.6 * GB));
    await assertStorageWithinQuota(tenantId, Math.round(0.4 * GB)); // 0.6 + 0.4 == 1 GB, not over
  });

  test("assertStorageWithinQuota throws StorageQuotaError over the cap", async () => {
    process.env.TENANT_STORAGE_QUOTA_GB = "1";
    await seedVersion(Math.round(0.6 * GB));
    await expect(assertStorageWithinQuota(tenantId, Math.round(0.5 * GB))).rejects.toBeInstanceOf(
      StorageQuotaError
    );
  });

  test("quota <= 0 disables the check", async () => {
    process.env.TENANT_STORAGE_QUOTA_GB = "0";
    await seedVersion(10_000);
    await assertStorageWithinQuota(tenantId, 10_000); // no throw
  });
});
