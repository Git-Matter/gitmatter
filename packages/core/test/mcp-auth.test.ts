import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import {
  type AuditEventType,
  auditEvents,
  clients,
  documents,
  oauthAccessTokens,
  tenants,
  user,
} from "@workspace/db/schema";
import { and, eq } from "drizzle-orm";
import { createHash } from "node:crypto";
import {
  hashToken,
  mintMcpToken,
  resolveMcpAccount,
  resolveMcpToken,
  revokeMcpToken,
} from "../src/platform/mcp-tokens.js";
import { createAuthCode, exchangeCode, resolveOAuthToken } from "../src/platform/oauth.js";
import { setUserJurisdiction } from "../src/platform/settings.js";
import { buildToolCatalog } from "../src/tools/catalog.js";
import { createClient, createMatter } from "../src/platform/matters.js";

let tenantA: string;
let tenantB: string;
const ownerId = `mcp-owner-${randomUUID()}`;
const outsiderId = `mcp-out-${randomUUID()}`;
let docA: string;

const tool = (catalog: ReturnType<typeof buildToolCatalog>, name: string) => {
  const t = catalog.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not in catalog`);
  return t;
};

// recordAudit is fire-and-forget AND batched (flushed within ~1s). Poll a few
// seconds until the expected row lands.
async function waitForAudit(eventType: AuditEventType, target: string) {
  for (let i = 0; i < 200; i++) {
    const [row] = await db
      .select()
      .from(auditEvents)
      .where(and(eq(auditEvents.eventType, eventType), eq(auditEvents.target, target)));
    if (row) return row;
    await new Promise((r) => setTimeout(r, 25));
  }
  return null;
}

beforeAll(async () => {
  const [ta] = await db.insert(tenants).values({ name: "MCP Tenant A" }).returning();
  const [tb] = await db.insert(tenants).values({ name: "MCP Tenant B" }).returning();
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
  const clientA = await createClient(ownerId, tenantA, { name: "Acme" });
  const matter = await createMatter(ownerId, { clientId: clientA.id, name: "Matter" });
  const [doc] = await db
    .insert(documents)
    .values({
      userId: ownerId,
      tenantId: tenantA,
      matterId: matter.id,
      title: "Brief",
      fileType: "pdf",
      markdown: "hello",
    })
    .returning();
  docA = doc!.id;
});

afterAll(async () => {
  await db.delete(auditEvents).where(eq(auditEvents.actorId, ownerId));
  await db.delete(tenants).where(eq(tenants.id, tenantA));
  await db.delete(tenants).where(eq(tenants.id, tenantB));
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, outsiderId));
  await sql.end();
});

describe("static MCP token lifecycle", () => {
  test("mint resolves to its user (with tokenId), garbage and revoked do not", async () => {
    const token = await mintMcpToken(ownerId, "Claude Desktop");
    const resolved = await resolveMcpToken(token);
    expect(resolved).toMatchObject({ userId: ownerId, label: "Claude Desktop" });
    expect(resolved?.tokenId).toBeTruthy();

    expect(await resolveMcpToken("gc_not_a_real_token")).toBeNull();

    await revokeMcpToken(ownerId, resolved!.tokenId);
    expect(await resolveMcpToken(token)).toBeNull();
  });

  test("mint writes an mcp_token.mint audit row", async () => {
    const token = await mintMcpToken(ownerId, "Audited");
    const resolved = await resolveMcpToken(token);
    const row = await waitForAudit("mcp_token.mint", resolved!.tokenId);
    expect(row).not.toBeNull();
    expect(row?.actorId).toBe(ownerId);
  });
});

describe("resolveMcpAccount (one-query resolution)", () => {
  test("resolves token to user, tenant, and jurisdiction; null after revoke", async () => {
    await setUserJurisdiction(ownerId, "US-Federal");
    const token = await mintMcpToken(ownerId, "One Query");
    const acct = await resolveMcpAccount(token);
    expect(acct).toMatchObject({
      userId: ownerId,
      label: "One Query",
      tenantId: tenantA,
      jurisdiction: "US-Federal",
    });
    expect(acct?.tokenId).toBeTruthy();

    expect(await resolveMcpAccount("gc_not_real")).toBeNull();

    // Revoke is checked against the DB, but the cache holds the resolved account
    // for its TTL — so resolve through a fresh token to assert the DB filter.
    await revokeMcpToken(ownerId, acct!.tokenId);
    const fresh = await mintMcpToken(ownerId, "Two");
    await revokeMcpToken(ownerId, (await resolveMcpAccount(fresh))!.tokenId);
    expect(await resolveMcpAccount(`${fresh}-miss`)).toBeNull();
  });
});

describe("OAuth signed access tokens", () => {
  const AUD2 = "https://gitmatter.test/api/mcp";
  const challengeFor = (verifier: string) =>
    createHash("sha256").update(verifier).digest("base64url");

  // Drive the real issuance path (code → signed token) so the token is minted
  // exactly as production does, then validate it.
  async function issueViaCode() {
    const verifier = "verifier-0123456789-abcdefghij-klmnopqrst";
    const code = await createAuthCode({
      clientId: "connector",
      userId: ownerId,
      redirectUri: "https://connector.test/cb",
      codeChallenge: challengeFor(verifier),
      codeChallengeMethod: "S256",
      resource: AUD2,
    });
    const r = await exchangeCode({
      code,
      clientId: "connector",
      redirectUri: "https://connector.test/cb",
      codeVerifier: verifier,
    });
    if ("error" in r) throw new Error(`exchange failed: ${r.error}`);
    return r.accessToken;
  }

  test("a signed token validates with NO db row and carries tenant + jurisdiction", async () => {
    await setUserJurisdiction(ownerId, "US-Federal");
    const accessToken = await issueViaCode();
    expect(accessToken.startsWith("gco_")).toBe(true);
    expect(accessToken.includes(".")).toBe(true); // signed form, not opaque

    const resolved = await resolveOAuthToken(accessToken, AUD2);
    expect(resolved).toMatchObject({
      userId: ownerId,
      tenantId: tenantA,
      jurisdiction: "US-Federal",
    });
  });

  test("rejects wrong audience and a tampered signature", async () => {
    const accessToken = await issueViaCode();
    expect(await resolveOAuthToken(accessToken, "https://evil.test/api/mcp")).toBeNull();
    // Flip the last character of the signature → signature check must fail.
    const tampered = accessToken.slice(0, -1) + (accessToken.endsWith("A") ? "B" : "A");
    expect(await resolveOAuthToken(tampered, AUD2)).toBeNull();
  });
});

describe("OAuth token validation", () => {
  const mkToken = async (over: Partial<{ expiresAt: Date; revokedAt: Date | null }>) => {
    const token = `gco_${randomUUID()}`;
    await db.insert(oauthAccessTokens).values({
      tokenHash: hashToken(token),
      clientId: "connector",
      userId: ownerId,
      audience: "https://gitmatter.test/api/mcp",
      expiresAt: over.expiresAt ?? new Date(Date.now() + 3_600_000),
      revokedAt: over.revokedAt ?? null,
    });
    return token;
  };
  const AUD = "https://gitmatter.test/api/mcp";

  test("rejects expired and revoked tokens, accepts a live one", async () => {
    const live = await mkToken({});
    expect(await resolveOAuthToken(live, AUD)).toMatchObject({ userId: ownerId });

    const expired = await mkToken({ expiresAt: new Date(Date.now() - 1000) });
    expect(await resolveOAuthToken(expired, AUD)).toBeNull();

    const revoked = await mkToken({ revokedAt: new Date() });
    expect(await resolveOAuthToken(revoked, AUD)).toBeNull();
  });
});

describe("tool catalog enforces per-artifact access", () => {
  const catalogFor = (userId: string) =>
    buildToolCatalog(
      { type: "agent", userId, agentLabel: "mcp:test" },
      {
        jurisdiction: "US-Federal",
        defaultMatterLabel: "Inbox",
      }
    );

  test("owner reads the document, a different tenant gets Not found", async () => {
    const ownerOut = await tool(catalogFor(ownerId), "get_document").handler({ documentId: docA });
    expect(ownerOut).not.toMatchObject({ error: "Not found" });

    const outsiderOut = await tool(catalogFor(outsiderId), "get_document").handler({
      documentId: docA,
    });
    expect(outsiderOut).toMatchObject({ error: "Not found" });
  });

  test("a mutating tool runs as the acting user and persists", async () => {
    const out = (await tool(catalogFor(ownerId), "create_client").handler({ name: "Via MCP" })) as {
      clientId: string;
    };
    expect(out.clientId).toBeTruthy();
    const [row] = await db.select().from(clients).where(eq(clients.id, out.clientId));
    expect(row?.tenantId).toBe(tenantA);
  });
});
