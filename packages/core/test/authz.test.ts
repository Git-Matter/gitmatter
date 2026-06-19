import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { documents, oauthAccessTokens, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canAccessArtifact, hasMatterAccess } from "../src/core/access.js";
import { addMember, createClient, createMatter, listClients } from "../src/platform/matters.js";
import { resolveOAuthToken } from "../src/platform/oauth.js";
import { hashToken } from "../src/platform/mcp-tokens.js";

// Two isolated tenants. Tenant A owns a matter + document; tenant B's user must
// never reach them. A third user (viewer) tests the role-rank boundary.
let tenantA: string;
let tenantB: string;
const ownerId = `owner-${randomUUID()}`;
const viewerId = `viewer-${randomUUID()}`;
const outsiderId = `outsider-${randomUUID()}`;
let matterA: string;
let docA: string;
let clientBId: string;

const oauthToken = `gco_${randomUUID()}`;
const AUDIENCE = "https://gitmatter.test/api/mcp";

beforeAll(async () => {
  const [ta] = await db.insert(tenants).values({ name: "Tenant A" }).returning();
  const [tb] = await db.insert(tenants).values({ name: "Tenant B" }).returning();
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
      id: viewerId,
      name: "Viewer",
      email: `${viewerId}@example.com`,
      emailVerified: true,
      tenantId: tenantA,
    },
    {
      id: outsiderId,
      name: "Outsider",
      email: `${outsiderId}@example.com`,
      emailVerified: true,
      tenantId: tenantB,
    },
  ]);

  const clientA = await createClient(ownerId, tenantA, { name: "Acme A" });
  const matter = await createMatter(ownerId, { clientId: clientA.id, name: "Matter A" });
  matterA = matter.id;
  await addMember(matterA, viewerId, "viewer");

  const [doc] = await db
    .insert(documents)
    .values({
      userId: ownerId,
      tenantId: tenantA,
      matterId: matterA,
      title: "Brief",
      fileType: "pdf",
    })
    .returning();
  docA = doc!.id;

  // Tenant B's own client, used to prove the tenant-scoped list never leaks.
  const clientB = await createClient(outsiderId, tenantB, { name: "Beta B" });
  clientBId = clientB.id;

  await db.insert(oauthAccessTokens).values({
    tokenHash: hashToken(oauthToken),
    clientId: "test-connector",
    userId: ownerId,
    audience: AUDIENCE,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
  });
});

afterAll(async () => {
  await db.delete(oauthAccessTokens).where(eq(oauthAccessTokens.userId, ownerId));
  // Deleting the tenants cascades clients -> matters -> documents -> members.
  await db.delete(tenants).where(eq(tenants.id, tenantA));
  await db.delete(tenants).where(eq(tenants.id, tenantB));
  await db.delete(user).where(eq(user.id, ownerId));
  await db.delete(user).where(eq(user.id, viewerId));
  await db.delete(user).where(eq(user.id, outsiderId));
  await sql.end();
});

describe("artifact access is tenant- and role-scoped", () => {
  test("owner reaches their own document", async () => {
    expect(await canAccessArtifact(ownerId, "document", docA)).toBe(true);
  });

  test("a different tenant's user cannot reach the document", async () => {
    expect(await canAccessArtifact(outsiderId, "document", docA)).toBe(false);
    expect(await hasMatterAccess(outsiderId, matterA)).toBe(false);
  });

  test("a viewer satisfies viewer-min but not editor-min", async () => {
    expect(await hasMatterAccess(viewerId, matterA, "viewer")).toBe(true);
    expect(await hasMatterAccess(viewerId, matterA, "editor")).toBe(false);
    expect(await canAccessArtifact(viewerId, "document", docA, "viewer")).toBe(true);
    expect(await canAccessArtifact(viewerId, "document", docA, "editor")).toBe(false);
  });
});

describe("tenant-scoped list isolation", () => {
  test("listClients returns only the caller tenant's clients", async () => {
    const aClients = await listClients(tenantA);
    const bClients = await listClients(tenantB);
    expect(aClients.some((c) => c.id === clientBId)).toBe(false);
    expect(bClients.some((c) => c.id === clientBId)).toBe(true);
    expect(bClients.every((c) => c.tenantId === tenantB)).toBe(true);
  });
});

describe("OAuth token audience binding", () => {
  test("resolves only for the bound audience", async () => {
    expect(await resolveOAuthToken(oauthToken, AUDIENCE)).toMatchObject({ userId: ownerId });
    expect(await resolveOAuthToken(oauthToken, "https://evil.test/api/mcp")).toBeNull();
    expect(await resolveOAuthToken("gco_garbage", AUDIENCE)).toBeNull();
  });
});
