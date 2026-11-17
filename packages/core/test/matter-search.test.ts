import { afterAll, beforeAll, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { tenants, user, matters } from "@workspace/db/schema";
import { ensureDefaultMatter } from "../src/platform/matters.js";
import { createDocument } from "../src/content/documents.js";
import { createClause } from "../src/content/clauses.js";
import { createWorkflow } from "../src/platform/workflow.js";
import { createReview } from "../src/ai/tabular/reviews.js";
import { writeCell } from "../src/ai/tabular/runner.js";
import { searchMatterWork } from "../src/core/search.js";
import { canReadApprovedLibrary } from "../src/core/library-access.js";
import { runPlaybook } from "../src/ai/tabular/playbook.js";
import { canAccessArtifact } from "../src/core/access.js";
import { buildDiscoveryTools } from "../src/tools/discovery.js";
const aliceId = `search-alice-${randomUUID()}`,
  bobId = `search-bob-${randomUUID()}`;
const alice = { type: "user" as const, userId: aliceId },
  bob = { type: "user" as const, userId: bobId };
let tenantId: string,
  aliceMatter: string,
  bobMatter: string,
  ownDoc: string,
  privateDoc: string,
  firmClause: string,
  draftClause: string,
  playbookId: string;
beforeAll(async () => {
  const [tenant] = await db.insert(tenants).values({ name: "Search access fixture" }).returning();
  tenantId = tenant!.id;
  await db.insert(user).values(
    [aliceId, bobId].map((id) => ({
      id,
      name: id,
      email: `${id}@example.com`,
      tenantId,
      tenantRole: "admin" as const,
      emailVerified: true,
    }))
  );
  aliceMatter = await ensureDefaultMatter(aliceId, "Alice", tenantId);
  bobMatter = await ensureDefaultMatter(bobId, "Bob", tenantId);
  ownDoc = (
    await createDocument(aliceId, {
      title: "Own source",
      markdown: "Rescindablepapaya language agreed in this document.",
      matterId: aliceMatter,
    })
  ).id;
  privateDoc = (
    await createDocument(bobId, {
      title: "Hidden source",
      markdown: "Rescindablepapaya private confidential language.",
      matterId: bobMatter,
    })
  ).id;
  firmClause = await createClause(alice, {
    title: "Approved position",
    body: "Rescindablepapaya approved language.",
    category: "confidentiality",
    status: "approved",
  });
  draftClause = await createClause(bob, {
    title: "Private draft",
    body: "Rescindablepapaya draft language.",
    category: "confidentiality",
    status: "draft",
  });
  const reviewId = await createReview(alice, {
    title: "Own saved review",
    matterId: aliceMatter,
    documentIds: [ownDoc],
    columnsConfig: [{ index: 0, name: "Terms", prompt: "Extract terms" }],
  });
  await writeCell(alice, {
    reviewId,
    documentId: ownDoc,
    columnIndex: 0,
    summary: "Rescindablepapaya accepted finding",
    flag: "green",
    reasoning: "Cited source",
    citations: [{ quote: "Rescindablepapaya language agreed in this document." }],
  });
  playbookId = await createWorkflow(alice, {
    title: "Firm positions",
    type: "playbook",
    promptMd: "",
    status: "approved",
    rules: [
      {
        id: randomUUID(),
        clauseType: "Rescindablepapaya",
        standardPosition: "Required",
        standardClauseId: firmClause,
        severity: "yellow",
      },
    ],
  });
});
afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, aliceId));
  await db.delete(user).where(eq(user.id, bobId));
  await sql.end();
});
test("SQL filters private corpus before ranking, count and stable pagination", async () => {
  const result = await searchMatterWork(alice, { query: "rescindablepapaya" });
  expect(result.results.map((r) => r.type)).toEqual(
    expect.arrayContaining(["document", "cell", "clause", "playbook"])
  );
  expect(result.results.map((r) => r.id)).not.toContain(privateDoc);
  expect(result.results.map((r) => r.id)).not.toContain(draftClause);
  expect(result.rowCount).toBe(4);
  const first = await searchMatterWork(alice, { query: "rescindablepapaya", pageSize: 2 });
  const next = await searchMatterWork(alice, { query: "rescindablepapaya", pageSize: 2, page: 1 });
  expect(first.rowCount).toBe(4);
  expect(next.rowCount).toBe(4);
  expect(new Set([...first.results, ...next.results].map((r) => r.id)).size).toBe(4);
  expect(
    (await searchMatterWork(alice, { query: "rescindablepapaya", matterId: bobMatter })).rowCount
  ).toBe(0);
});
test("scoped actors use approved Library only in an authorized explicit matter", async () => {
  const scoped = {
    type: "agent" as const,
    userId: aliceId,
    agentLabel: "search scope",
    scope: { matterIds: [aliceMatter], maxRole: "editor" as const },
  };
  const global = await searchMatterWork(scoped, { query: "rescindablepapaya" });
  expect(global.rowCount).toBe(2);
  const contextual = await searchMatterWork(scoped, {
    query: "rescindablepapaya",
    matterId: aliceMatter,
  });
  expect(contextual.rowCount).toBe(4);
  expect(await canReadApprovedLibrary(scoped, "clause", firmClause, aliceMatter)).toBe(true);
  expect(await canReadApprovedLibrary(scoped, "clause", draftClause, aliceMatter)).toBe(false);
  expect(await canReadApprovedLibrary(scoped, "clause", firmClause, bobMatter)).toBe(false);
  expect(await canAccessArtifact(scoped, "clause", firmClause, "editor")).toBe(false);
  const run = await runPlaybook(scoped, {
    playbookId,
    documentIds: [ownDoc],
    matterId: aliceMatter,
  });
  expect(run.ruleCount).toBe(1);
  const tools = buildDiscoveryTools({ actor: scoped, resolveMatter: async () => aliceMatter });
  const fetched = await tools
    .find((t) => t.name === "fetch")!
    .handler({ id: `clause:${firmClause}:${aliceMatter}` });
  expect(fetched).toMatchObject({ title: "Approved position" });
  expect(
    await tools
      .find((t) => t.name === "fetch")!
      .handler({ id: `clause:${firmClause}:${bobMatter}` })
  ).toEqual({ error: "Not found" });
  const out = { ...scoped, scope: { ...scoped.scope, matterIds: [bobMatter] } };
  expect(await searchMatterWork(out, { query: "rescindablepapaya" })).toEqual({
    results: [],
    rowCount: 0,
  });
});

test("Library context denies deprecated and mismatched client positions without granting admin matter access", async () => {
  const [matter] = await db.select().from(matters).where(eq(matters.id, bobMatter));
  const overlay = await createClause(bob, {
    title: "Client-only position",
    body: "Rescindablepapaya client position",
    category: "confidentiality",
    status: "approved",
    clientId: matter!.clientId,
    overridesClauseId: firmClause,
  });
  expect(await canReadApprovedLibrary(alice, "clause", overlay, aliceMatter)).toBe(false);
  const deprecated = await createClause(alice, {
    title: "Old position",
    body: "Rescindablepapaya old position",
    category: "confidentiality",
    status: "deprecated",
  });
  expect(await canReadApprovedLibrary(alice, "clause", deprecated, aliceMatter)).toBe(false);
  await db.update(user).set({ tenantRole: "admin" }).where(eq(user.id, aliceId));
  expect(
    await searchMatterWork(alice, { query: "rescindablepapaya", matterId: bobMatter })
  ).toEqual({ results: [], rowCount: 0 });
});
