import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { CallToolResultSchema } from "@modelcontextprotocol/sdk/types.js";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { InMemoryTransport } from "@modelcontextprotocol/sdk/inMemory.js";
import { db, sql } from "@workspace/db/client";
import { tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import {
  buildToolCatalog,
  resolveEdit,
  listVersions,
  getObject,
  extractMarkdown,
} from "@workspace/core";
import { buildMcpServer, toolResult } from "./server";

test("tool errors are protocol errors with structured data", () => {
  const result = toolResult({ error: "Not found" }, "https://example.com");
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toEqual({ error: "Not found" });
  expect(result.content).toHaveLength(1);
});

test("partial edits retain the review link while signalling incomplete work", () => {
  const result = toolResult(
    { documentId: "fixture", requested: 2, applied: 1, failed: 1 },
    "https://example.com"
  );
  expect(result.isError).toBe(true);
  expect(result.structuredContent).toMatchObject({ applied: 1, failed: 1 });
  expect(result.content).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        type: "resource_link",
        uri: "https://example.com/documents/fixture",
      }),
    ])
  );
});

test("subscription catalog excludes provider inference and human decisions", async () => {
  const server = buildMcpServer({ userId: "catalog-only", label: "test", jurisdiction: "AU" });
  const client = new Client({ name: "subscription-test", version: "1" });
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  await server.connect(serverTransport);
  await client.connect(clientTransport);
  try {
    const { tools } = await client.listTools();
    expect(tools.map((tool) => tool.name)).toEqual(
      expect.arrayContaining(["write_cell", "generate_docx", "write_workflow", "run_playbook"])
    );
    for (const name of ["run_cell", "draft_playbook", "resolve_document_edit"]) {
      expect(tools.some((tool) => tool.name === name)).toBe(false);
    }
    expect(tools.find((tool) => tool.name === "get_document")?.annotations?.readOnlyHint).toBe(
      true
    );
    expect(tools.find((tool) => tool.name === "write_cell")?.annotations?.readOnlyHint).toBe(false);
    expect(client.getInstructions()).toContain("your own reasoning and subscription");
    // Provider-funded execution remains available to the built-in assistant.
    const internal = buildToolCatalog(
      { type: "agent", userId: "catalog-only", agentLabel: "chat" },
      { jurisdiction: "AU", defaultMatterLabel: "test" }
    );
    expect(internal.some((tool) => tool.name === "run_cell")).toBe(true);
  } finally {
    await client.close();
    await server.close();
  }
});

const hasStorage = !!process.env.S3_ACCESS_KEY;
(hasStorage ? describe : describe.skip)("subscription NDA through MCP transport", () => {
  const userId = `mcp-native-${randomUUID()}`;
  let tenantId: string;
  const label = "subscription-fixture";
  const server = buildMcpServer({
    userId,
    label,
    jurisdiction: "AU",
    origin: "https://example.com",
  });
  const client = new Client({ name: "external-assistant-fixture", version: "1" });
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Synthetic native MCP", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values({
      id: userId,
      name: "Fixture",
      email: `${userId}@example.com`,
      emailVerified: true,
      tenantId,
    });
    const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
    await server.connect(serverTransport);
    await client.connect(clientTransport);
  });
  afterAll(async () => {
    await client.close();
    await server.close();
    if (tenantId) await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
    await sql.end();
  });
  async function call(name: string, args: Record<string, unknown>) {
    const result = CallToolResultSchema.parse(await client.callTool({ name, arguments: args }));
    expect(result.isError, JSON.stringify(result.content)).not.toBe(true);
    return result;
  }
  test("generate, read, save cited review, propose, human resolve and audit", async () => {
    const createdClient = await call("create_client", { name: "Synthetic client" });
    const matter = await call("create_matter", {
      clientId: createdClient.structuredContent!.clientId,
      name: "Synthetic NDA",
    });
    const matterId = matter.structuredContent!.matterId as string;
    const source = "Confidentiality lasts five years.";
    const generated = await call("generate_docx", {
      matterId,
      title: "Synthetic NDA",
      blocks: [{ type: "paragraph", text: source }],
    });
    const documentId = generated.structuredContent!.documentId as string;
    expect(generated.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          type: "resource_link",
          uri: `https://example.com/documents/${documentId}`,
        }),
      ])
    );
    const read = await call("get_document", { documentId });
    expect((read.structuredContent!.document as { markdown: string }).markdown).toContain(
      "five years"
    );
    const history = await call("history", { artifactType: "document", artifactId: documentId });
    const commits = history.structuredContent!.items as Array<{ id: string }>;
    const commit = await call("show_commit", { commitId: commits[0]!.id });
    expect(commit.structuredContent!.changes).toEqual(
      expect.arrayContaining([expect.objectContaining({ path: "markdown", before: null })])
    );
    const review = await call("create_review", {
      matterId,
      title: "NDA review",
      documentIds: [documentId],
      columns: [{ name: "Term", prompt: "Find the term and compare against three years." }],
    });
    const reviewId = review.structuredContent!.reviewId as string;
    await call("write_cell", {
      reviewId,
      documentId,
      columnIndex: 0,
      summary: "Five years",
      flag: "yellow",
      reasoning: "Exceeds synthetic three-year policy.",
      citations: [{ quote: source }],
    });
    const cells = await call("read_review_cells", { reviewId });
    expect(cells.structuredContent!.cells).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ summary: "Five years", citations: [{ quote: source }] }),
      ])
    );
    const proposed = await call("propose_document_edit", {
      documentId,
      edits: [
        {
          find: "five years",
          replace: "three years",
          contextBefore: "Confidentiality lasts ",
          contextAfter: ".",
          reason: "Synthetic fixture policy",
        },
      ],
    });
    const changeId = (proposed.structuredContent!.changeIds as string[])[0]!;
    await expect(
      resolveEdit({ type: "agent", userId, agentLabel: label }, documentId, changeId, "accept")
    ).rejects.toThrow("A person must");
    await resolveEdit({ type: "user", userId }, documentId, changeId, "accept");
    const versions = await listVersions(documentId);
    const bytes = Buffer.from(await getObject(tenantId, versions[0]!.storagePath!));
    const { markdown: accepted } = await extractMarkdown(bytes, "docx");
    expect(accepted).toContain("three years");
    expect(accepted).not.toContain("five years");
    const audit = await call("export_audit", { matterId });
    expect(audit.structuredContent!.csv).toContain(`mcp:${label}`);
    expect(audit.structuredContent!.csv).toContain("resolve_edit");
    // A viewer can discover the matter's documents but cannot write a cell.
    const viewer = buildToolCatalog(
      {
        type: "agent",
        userId,
        agentLabel: "viewer",
        scope: { maxRole: "viewer", matterIds: [matterId] },
      },
      { jurisdiction: "AU", defaultMatterLabel: "viewer", executionMode: "subscription" }
    );
    const listed = await viewer
      .find((tool) => tool.name === "list_matter_documents")!
      .handler({ matterId });
    expect(listed).toMatchObject({ documents: [expect.objectContaining({ id: documentId })] });
    expect(
      await viewer
        .find((tool) => tool.name === "write_cell")!
        .handler({ reviewId, documentId, columnIndex: 0 })
    ).toMatchObject({ error: "Not found" });
    const missing = await client.callTool({
      name: "get_document",
      arguments: { documentId: randomUUID() },
    });
    expect(missing.isError).toBe(true);
  }, 30_000);
});
