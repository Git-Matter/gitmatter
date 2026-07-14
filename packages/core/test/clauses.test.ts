import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { clauses, clients, matters, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { deriveBlame, listCommits } from "../src/core/commit.js";
import {
  createClause,
  getClauseLadder,
  listClauses,
  resolveClause,
  suggestClauses,
  updateClause,
} from "../src/content/clauses.js";
import { buildToolCatalog } from "../src/tools/catalog.js";
import type { Actor } from "../src/core/commit.js";

const userId = `clause-user-${randomUUID()}`;
let tenantId: string;
let clientId: string;
let matterId: string;
const actor: Actor = { type: "user", userId };

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Clause Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Clause User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const [cl] = await db
    .insert(clients)
    .values({ tenantId, name: "Overlay Client", createdBy: userId })
    .returning();
  clientId = cl!.id;
  const [matter] = await db
    .insert(matters)
    .values({ tenantId, clientId, name: "Overlay matter", createdBy: userId })
    .returning();
  matterId = matter!.id;
});

afterAll(async () => {
  await db.delete(clauses).where(eq(clauses.tenantId, tenantId));
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("clause library", () => {
  test("create + update land on the spine with per-field blame", async () => {
    const id = await createClause(actor, {
      title: "Limitation of liability",
      body: "Cap at 12 months' fees paid; mutual.",
      category: "limitation-of-liability",
      status: "approved",
      guidance: "Standard position.",
    });
    await updateClause(actor, id, { body: "Cap at 12 months' fees paid; mutual; excl. fraud." });

    const history = await listCommits("clause", id);
    expect(history).toHaveLength(2);
    expect(history[0]!.op).toBe("update");

    const blame = await deriveBlame("clause", id, "field/body");
    expect(blame?.op).toBe("update");
    const titleBlame = await deriveBlame("clause", id, "field/title");
    expect(titleBlame?.op).toBe("create");
  });

  test("fallback ladder orders standard first, then by rank", async () => {
    const std = await createClause(actor, {
      title: "Indemnity",
      body: "Mutual indemnity.",
      category: "indemnification",
      status: "approved",
    });
    const fb2 = await createClause(actor, {
      title: "Indemnity — second fallback",
      body: "One-way indemnity, capped.",
      category: "indemnification",
      parentClauseId: std,
      fallbackRank: 2,
      status: "approved",
    });
    const fb1 = await createClause(actor, {
      title: "Indemnity — first fallback",
      body: "Mutual, carve-outs only.",
      category: "indemnification",
      parentClauseId: std,
      fallbackRank: 1,
      status: "approved",
    });
    const fb3 = await createClause(actor, {
      title: "Indemnity — third fallback",
      body: "Narrow one-way indemnity.",
      category: "indemnification",
      parentClauseId: std,
      status: "approved",
    });

    const ladder = await getClauseLadder(std);
    expect(ladder.map((c) => c.id)).toEqual([std, fb1, fb2, fb3]);
    expect(ladder[3]?.fallbackRank).toBe(3);
    // Ladder resolves the same from a fallback.
    const fromFallback = await getClauseLadder(fb2);
    expect(fromFallback.map((c) => c.id)).toEqual([std, fb1, fb2, fb3]);

    // Fallbacks cannot chain off fallbacks.
    await expect(
      createClause(actor, {
        title: "bad",
        body: "x",
        category: "indemnification",
        parentClauseId: fb1,
      })
    ).rejects.toThrow(/standard position/);
  });

  test("listClauses hides deprecated and fallbacks; suggest filters + overlays shadow", async () => {
    const dep = await createClause(actor, {
      title: "Old clause",
      body: "obsolete",
      category: "governing-law",
      status: "approved",
    });
    await updateClause(actor, dep, { status: "deprecated" });
    const firm = await createClause(actor, {
      title: "Governing law (NY)",
      body: "New York law.",
      category: "governing-law",
      jurisdiction: "US-NY",
      status: "approved",
    });
    await createClause(actor, {
      title: "Governing law — client overlay",
      body: "Delaware law for this client.",
      category: "governing-law",
      clientId,
      overridesClauseId: firm,
      status: "approved",
    });

    const listed = await listClauses(tenantId, { category: "governing-law" });
    expect(listed.map((c) => c.title)).toEqual(["Governing law (NY)"]);

    // Jurisdiction filter: a US-NY clause matches US-NY, not AU.
    const ny = await suggestClauses(tenantId, { category: "governing-law", jurisdiction: "US-NY" });
    expect(ny.map((c) => c.title)).toContain("Governing law (NY)");
    const au = await suggestClauses(tenantId, { category: "governing-law", jurisdiction: "AU" });
    expect(au.map((c) => c.title)).not.toContain("Governing law (NY)");

    // For the overlay's client, the overlay shadows the firm default.
    const forClient = await suggestClauses(tenantId, { category: "governing-law", clientId });
    expect(forClient.map((c) => c.title)).toEqual(["Governing law — client overlay"]);

    const matterOverlay = await createClause(actor, {
      title: "Governing law — matter overlay",
      body: "English law for this transaction.",
      category: "governing-law",
      matterId,
      overridesClauseId: firm,
      status: "approved",
    });
    const resolved = await resolveClause(tenantId, firm, { matterId });
    expect(resolved?.id).toBe(matterOverlay);
    expect(resolved?.appliedScope).toBe("matter");
  });

  test("scoped standards must explicitly name the firm clause they replace", async () => {
    await expect(
      createClause(actor, {
        title: "Unlinked client exception",
        body: "No arbitration.",
        category: "dispute-resolution",
        clientId,
        status: "draft",
      })
    ).rejects.toThrow(/must name the firm standard/i);
  });

  test("scoped tokens cannot write the library but can read it", async () => {
    const scoped: Actor = {
      type: "agent",
      userId,
      agentLabel: "mcp:scoped",
      scope: { matterIds: [randomUUID()], maxRole: null },
    };
    const catalog = buildToolCatalog(scoped, { jurisdiction: "US", defaultMatterLabel: "t" });
    const write = catalog.find((t) => t.name === "write_clause")!;
    const denied = (await write.handler({ title: "x", body: "y", category: "z" })) as {
      error?: string;
    };
    expect(denied.error).toMatch(/scope/i);

    const list = catalog.find((t) => t.name === "list_clauses")!;
    const res = (await list.handler({})) as { clauses: Array<{ title: string }> };
    expect(res.clauses.length).toBeGreaterThan(0);
  });
});
