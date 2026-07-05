import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { documents, mcpAccessTokens, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { canAccessArtifact, hasMatterAccess } from "../src/core/access.js";
import type { Actor, TokenScope } from "../src/core/commit.js";
import { mintMcpToken, resolveMcpAccount } from "../src/platform/mcp-tokens.js";
import { createClient, createMatter } from "../src/platform/matters.js";
import { buildToolCatalog } from "../src/tools/catalog.js";

// One tenant, one user who owns two matters (A allowed by the scope, B not),
// each with a document. A scoped agent actor must see/touch only matter A's
// side — including artifacts its own user owns outright.
let tenantId: string;
const userId = `scope-user-${randomUUID()}`;
let matterA: string;
let matterB: string;
let docA: string;
let docB: string;

const agent = (scope?: TokenScope): Actor => ({
  type: "agent",
  userId,
  agentLabel: "mcp:test",
  ...(scope ? { scope } : {}),
});

const tool = (catalog: ReturnType<typeof buildToolCatalog>, name: string) => {
  const t = catalog.find((x) => x.name === name);
  if (!t) throw new Error(`tool ${name} not in catalog`);
  return t;
};

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Scope Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Scoped",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const client = await createClient(userId, tenantId, { name: "Scope Client" });
  matterA = (await createMatter(userId, { clientId: client.id, name: "Allowed Matter" })).id;
  matterB = (await createMatter(userId, { clientId: client.id, name: "Blocked Matter" })).id;
  const rows = await db
    .insert(documents)
    .values([
      { userId, tenantId, matterId: matterA, title: "Doc In Scope", fileType: "pdf" },
      { userId, tenantId, matterId: matterB, title: "Doc Out Of Scope", fileType: "pdf" },
    ])
    .returning();
  docA = rows[0]!.id;
  docB = rows[1]!.id;
});

afterAll(async () => {
  await db.delete(mcpAccessTokens).where(eq(mcpAccessTokens.userId, userId));
  // Deleting the tenant cascades clients -> matters -> documents -> members.
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("matter-scoped actor", () => {
  // matterA only becomes known in beforeAll, so build the actor lazily.
  const scoped = () => agent({ matterIds: [matterA], maxRole: null });

  test("sees the allowed matter, not the other", async () => {
    expect(await hasMatterAccess(scoped(), matterA, "editor")).toBe(true);
    expect(await hasMatterAccess(scoped(), matterB)).toBe(false);
  });

  test("artifact guard blocks out-of-scope docs even for the owner", async () => {
    expect(await canAccessArtifact(scoped(), "document", docA, "editor")).toBe(true);
    expect(await canAccessArtifact(scoped(), "document", docB)).toBe(false);
  });

  test("bare userId and unscoped agent stay unrestricted", async () => {
    expect(await canAccessArtifact(userId, "document", docB, "owner")).toBe(true);
    expect(await canAccessArtifact(agent(), "document", docB, "owner")).toBe(true);
  });

  test("catalog: creation refused, listings filtered, search filtered", async () => {
    const catalog = buildToolCatalog(scoped(), { jurisdiction: "US", defaultMatterLabel: "test" });
    const created = (await tool(catalog, "create_matter").handler({
      clientId: "whatever",
      name: "nope",
    })) as { error?: string };
    expect(created.error).toMatch(/scope/i);

    const matters = (await tool(catalog, "list_matters").handler({})) as Array<{
      matter: { id: string };
    }>;
    expect(matters.map((m) => m.matter.id)).toEqual([matterA]);

    const search = (await tool(catalog, "search").handler({ query: "doc" })) as {
      results: Array<{ id: string }>;
    };
    expect(search.results.map((r) => r.id)).toContain(`document:${docA}`);
    expect(search.results.map((r) => r.id)).not.toContain(`document:${docB}`);

    const fetched = (await tool(catalog, "fetch").handler({ id: `document:${docB}` })) as {
      error?: string;
    };
    expect(fetched.error).toBe("Not found");
  });
});

describe("role-capped actor", () => {
  const readonly = agent({ matterIds: null, maxRole: "viewer" });

  test("reads but cannot edit, even own artifacts", async () => {
    expect(await canAccessArtifact(readonly, "document", docA)).toBe(true);
    expect(await canAccessArtifact(readonly, "document", docA, "editor")).toBe(false);
    expect(await hasMatterAccess(readonly, matterA, "editor")).toBe(false);
  });

  test("catalog refuses creation for a viewer-capped token", async () => {
    const catalog = buildToolCatalog(readonly, { jurisdiction: "US", defaultMatterLabel: "test" });
    const created = (await tool(catalog, "create_client").handler({ name: "nope" })) as {
      error?: string;
    };
    expect(created.error).toMatch(/scope/i);
  });
});

describe("minted token scope round-trip", () => {
  test("resolveMcpAccount returns the minted scope", async () => {
    const token = await mintMcpToken(userId, "scoped", {
      allowedMatterIds: [matterA],
      maxRole: "viewer",
    });
    const account = await resolveMcpAccount(token);
    expect(account?.scope).toEqual({ matterIds: [matterA], maxRole: "viewer" });
  });

  test("unscoped mint resolves with null scope", async () => {
    const token = await mintMcpToken(userId, "unscoped");
    const account = await resolveMcpAccount(token);
    expect(account?.scope).toBeNull();
  });
});
