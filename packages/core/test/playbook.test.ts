import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { documents, tabularReviews, tenants, user, workflows } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import type { Actor } from "../src/core/commit.js";
import { deriveBlame } from "../src/core/commit.js";
import { createClause } from "../src/content/clauses.js";
import { playbookColumns, rulePrompt, runPlaybook } from "../src/ai/tabular/playbook.js";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createWorkflow, updateWorkflow } from "../src/platform/workflow.js";

const userId = `pb-user-${randomUUID()}`;
let tenantId: string;
let matterId: string;
let docId: string;
const actor: Actor = { type: "user", userId };

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Playbook Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Playbook User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const client = await createClient(userId, tenantId, { name: "PB Client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "PB Matter" })).id;
  const [doc] = await db
    .insert(documents)
    .values({ userId, tenantId, matterId, title: "Inbound NDA", fileType: "pdf" })
    .returning();
  docId = doc!.id;
});

afterAll(async () => {
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("playbooks", () => {
  test("playbook creates as draft with rules blame; approval is a commit", async () => {
    const id = await createWorkflow(actor, {
      title: "MSA Playbook",
      type: "playbook",
      promptMd: "",
      matterId,
      rules: [
        {
          id: "lol",
          clauseType: "Limitation of liability",
          standardPosition: "Cap at 12 months' fees.",
          severity: "red",
        },
      ],
    });
    const [row] = await db.select().from(workflows).where(eq(workflows.id, id));
    expect(row?.status).toBe("draft");

    await updateWorkflow(actor, id, { status: "approved" });
    const statusBlame = await deriveBlame("workflow", id, "field/status");
    expect(statusBlame?.op).toBe("update");
    const rulesBlame = await deriveBlame("workflow", id, "field/rules");
    expect(rulesBlame?.op).toBe("create");
  });

  test("rule prompt resolves clause-library fallbacks to live text", async () => {
    const clauseId = await createClause(actor, {
      title: "Liability fallback",
      body: "Cap at 24 months' fees paid.",
      category: "limitation-of-liability",
      status: "approved",
    });
    const prompt = await rulePrompt({
      id: "r1",
      clauseType: "Limitation of liability",
      standardPosition: "Cap at 12 months' fees.",
      fallbacks: ["Inline fallback text", { clauseId }],
      unacceptable: "Uncapped liability.",
      severity: "red",
    });
    expect(prompt).toContain("Cap at 12 months' fees.");
    expect(prompt).toContain("1. Inline fallback text");
    expect(prompt).toContain("2. Cap at 24 months' fees paid.");
    expect(prompt).toContain("red line");
  });

  test("runPlaybook materializes a review with one column per rule", async () => {
    const pbId = await createWorkflow(actor, {
      title: "Run Playbook",
      type: "playbook",
      promptMd: "",
      matterId,
      status: "approved",
      rules: [
        { id: "a", clauseType: "Mutuality", standardPosition: "Mutual.", severity: "red" },
        { id: "b", clauseType: "Term", standardPosition: "3 years.", severity: "yellow" },
      ],
    });
    const { reviewId, ruleCount } = await runPlaybook(actor, {
      playbookId: pbId,
      documentIds: [docId],
      matterId,
    });
    expect(ruleCount).toBe(2);
    const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
    expect(review?.workflowId).toBe(pbId);
    expect(review?.columnsConfig.map((c) => c.name)).toEqual(["Mutuality", "Term"]);
    expect(review?.documentIds).toEqual([docId]);

    // Deprecated playbooks refuse to run.
    await updateWorkflow(actor, pbId, { status: "deprecated" });
    await expect(
      runPlaybook(actor, { playbookId: pbId, documentIds: [docId], matterId })
    ).rejects.toThrow(/deprecated/);
  });

  test("columns preserve rule order and severity shows in prompts", async () => {
    const cols = await playbookColumns([
      { id: "x", clauseType: "A", standardPosition: "sa", severity: "yellow" },
      { id: "y", clauseType: "B", standardPosition: "sb", severity: "red" },
    ]);
    expect(cols.map((c) => c.index)).toEqual([0, 1]);
    expect(cols[0]!.prompt).toContain("flag yellow if it crosses the red line");
    expect(cols[1]!.prompt).toContain("flag red if it crosses the red line");
  });
});
