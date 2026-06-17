import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { auditEvents, mcpAccessTokens, oauthAuthCodes, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { purgeExpiredTokens, purgeOldAuditEvents } from "../src/platform/retention.js";

const userId = `test-user-${randomUUID()}`;
let tenantId: string;
const OLD = new Date("2000-01-01T00:00:00Z");

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Retention Test Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Retention User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
});

afterAll(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.actorId, userId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("retention purges", () => {
  test("purgeOldAuditEvents removes aged rows, keeps fresh ones", async () => {
    const [oldRow] = await db
      .insert(auditEvents)
      .values({ actorId: userId, eventType: "auth.login", createdAt: OLD })
      .returning({ id: auditEvents.id });
    const [freshRow] = await db
      .insert(auditEvents)
      .values({ actorId: userId, eventType: "auth.login" })
      .returning({ id: auditEvents.id });

    await purgeOldAuditEvents();

    const remaining = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.actorId, userId));
    const ids = remaining.map((r) => r.id);
    expect(ids).not.toContain(oldRow!.id);
    expect(ids).toContain(freshRow!.id);
  });

  test("AUDIT_RETENTION_DAYS=0 disables the purge (keeps an aged row)", async () => {
    const [oldRow] = await db
      .insert(auditEvents)
      .values({ actorId: userId, eventType: "auth.login", createdAt: OLD })
      .returning({ id: auditEvents.id });

    const prev = process.env.AUDIT_RETENTION_DAYS;
    process.env.AUDIT_RETENTION_DAYS = "0";
    try {
      await purgeOldAuditEvents();
    } finally {
      if (prev === undefined) delete process.env.AUDIT_RETENTION_DAYS;
      else process.env.AUDIT_RETENTION_DAYS = prev;
    }

    const stillThere = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.id, oldRow!.id));
    expect(stillThere).toHaveLength(1);
  });

  test("AUDIT_RETENTION_DAYS='' (empty) falls back to the default, does not wipe", async () => {
    const [oldish] = await db
      .insert(auditEvents)
      // 10 days old: older than nothing, but well within the 365-day default.
      .values({
        actorId: userId,
        eventType: "auth.login",
        createdAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      })
      .returning({ id: auditEvents.id });

    const prev = process.env.AUDIT_RETENTION_DAYS;
    process.env.AUDIT_RETENTION_DAYS = "";
    try {
      await purgeOldAuditEvents();
    } finally {
      if (prev === undefined) delete process.env.AUDIT_RETENTION_DAYS;
      else process.env.AUDIT_RETENTION_DAYS = prev;
    }

    const stillThere = await db
      .select({ id: auditEvents.id })
      .from(auditEvents)
      .where(eq(auditEvents.id, oldish!.id));
    expect(stillThere).toHaveLength(1);
  });

  test("purgeExpiredTokens removes expired auth codes and long-revoked MCP tokens", async () => {
    const expiredCode = `code-${randomUUID()}`;
    await db.insert(oauthAuthCodes).values({
      codeHash: expiredCode,
      clientId: "test-client",
      userId,
      redirectUri: "https://example.com/cb",
      codeChallenge: "x",
      codeChallengeMethod: "S256",
      expiresAt: OLD,
    });
    const [revoked] = await db
      .insert(mcpAccessTokens)
      .values({ userId, tokenHash: `h-${randomUUID()}`, label: "old", revokedAt: OLD })
      .returning({ id: mcpAccessTokens.id });
    const [live] = await db
      .insert(mcpAccessTokens)
      .values({ userId, tokenHash: `h-${randomUUID()}`, label: "live" })
      .returning({ id: mcpAccessTokens.id });

    await purgeExpiredTokens();

    const codes = await db
      .select({ codeHash: oauthAuthCodes.codeHash })
      .from(oauthAuthCodes)
      .where(eq(oauthAuthCodes.codeHash, expiredCode));
    expect(codes).toHaveLength(0);

    const tokens = await db
      .select({ id: mcpAccessTokens.id })
      .from(mcpAccessTokens)
      .where(eq(mcpAccessTokens.userId, userId));
    const ids = tokens.map((t) => t.id);
    expect(ids).not.toContain(revoked!.id);
    expect(ids).toContain(live!.id);
  });
});
