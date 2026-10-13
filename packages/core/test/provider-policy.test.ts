import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { db } from "@workspace/db/client";
import { eq } from "drizzle-orm";
import { approvalProposals, tabularCells, tenants, user } from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createDocument } from "../src/content/documents.js";
import { createReview } from "../src/ai/tabular/reviews.js";
import { runCell, runDocument, writeCell } from "../src/ai/tabular/runner.js";
import { setApprovalPolicy } from "../src/core/approval.js";
import { listCommits } from "../src/core/commit.js";

// Deterministic provider boundary. No provider network/key lookup is performed.
vi.mock("../src/ai/provider/index.js", async (original) => ({
  ...(await original<typeof import("../src/ai/provider/index.js")>()),
  resolveRunModel: async () => ({ model: "claude-sonnet-5", key: "synthetic-provider-fixture" }),
  resolveLlmKey: async () => ({ key: "synthetic-provider-fixture", source: "env" as const }),
}));
vi.mock("../src/ai/tabular/extract.js", async (original) => {
  const result = {
    content: { summary: "Proposed provider finding", flag: "red" as const, reasoning: "Synthetic" },
    citations: [{ quote: "two years" }],
  };
  return {
    ...(await original<typeof import("../src/ai/tabular/extract.js")>()),
    queryCell: async () => result,
    queryRow: async () => new Map([[0, result]]),
  };
});
const userId = `provider-policy-${randomUUID()}`;
const actor = { type: "user" as const, userId };
let tenantId: string;
let clientId: string;
async function fixture() {
  const matter = await createMatter(userId, { clientId, name: "Owner-gated review" });
  const doc = await createDocument(userId, {
    title: "Source",
    markdown: "The term is two years.",
    matterId: matter.id,
  });
  const reviewId = await createReview(actor, {
    title: "Review",
    matterId: matter.id,
    documentIds: [doc.id],
    columnsConfig: [{ index: 0, name: "Term", prompt: "Find term" }],
  });
  await writeCell(actor, {
    reviewId,
    documentId: doc.id,
    columnIndex: 0,
    summary: "Human accepted",
    flag: "green",
    reasoning: "Reviewed",
    citations: [{ quote: "two years" }],
  });
  await setApprovalPolicy(actor, matter.id, {
    expectedRevision: 0,
    reason: "Owner must review generated findings",
    policy: { agentCells: "owner" },
  });
  return { doc, reviewId };
}
describe("human-requested provider writes respect agent approval policy", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Provider policy fixture", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db
      .insert(user)
      .values({ id: userId, name: "Reviewer", email: `${userId}@example.com`, tenantId });
    clientId = (await createClient(userId, tenantId, { name: "Synthetic" })).id;
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
  });
  for (const mode of ["single", "row"] as const)
    test(`${mode} inference stages an owner proposal and preserves accepted content`, async () => {
      const { doc, reviewId } = await fixture();
      if (mode === "single") await runCell(actor, { reviewId, documentId: doc.id, columnIndex: 0 });
      else await runDocument(actor, { reviewId, documentId: doc.id });
      const [cell] = await db
        .select()
        .from(tabularCells)
        .where(eq(tabularCells.reviewId, reviewId));
      expect(cell!.content?.summary).toBe("Human accepted");
      const [proposal] = await db
        .select()
        .from(approvalProposals)
        .where(eq(approvalProposals.artifactId, reviewId));
      expect(proposal!.requiredRole).toBe("owner");
      expect(proposal!.status).toBe("pending");
      const [latest] = await listCommits("tabular_review", reviewId);
      expect(latest!.actorType).toBe("agent");
      expect(latest!.agentLabel).toBe("review-runner");
    });
});
