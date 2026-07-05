import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { documents, tabularReviews, tenants, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { recordCommit } from "../src/core/commit.js";
import {
  auditTrailToCsv,
  auditTrailToDocx,
  gatherMatterAudit,
} from "../src/content/auditExport.js";
import { createClient, createMatter } from "../src/platform/matters.js";

// A matter with one review and one document, mutated by a human and an agent.
// The gathered trail must contain both commits with proper attribution.
const userId = `audit-user-${randomUUID()}`;
let tenantId: string;
let matterId: string;
let reviewId: string;
let docId: string;

beforeAll(async () => {
  const [t] = await db.insert(tenants).values({ name: "Audit Export Tenant" }).returning();
  tenantId = t!.id;
  await db.insert(user).values({
    id: userId,
    name: "Audit User",
    email: `${userId}@example.com`,
    emailVerified: true,
    tenantId,
  });
  const client = await createClient(userId, tenantId, { name: "Audit Client" });
  matterId = (await createMatter(userId, { clientId: client.id, name: "Audit Matter" })).id;
  const [r] = await db
    .insert(tabularReviews)
    .values({
      userId,
      tenantId,
      matterId,
      createdBy: userId,
      title: "Audit Review",
      columnsConfig: [{ index: 0, name: "C0", prompt: "p" }],
      documentIds: [],
    })
    .returning();
  reviewId = r!.id;
  const [d] = await db
    .insert(documents)
    .values({ userId, tenantId, matterId, title: "Audit Doc", fileType: "pdf" })
    .returning();
  docId = d!.id;

  await recordCommit({
    artifactType: "tabular_review",
    artifactId: reviewId,
    actor: { type: "user", userId },
    op: "create",
    message: "human change",
    apply: async () => ({ changes: [{ path: "meta/title", before: null, after: "v1" }] }),
  });
  await recordCommit({
    artifactType: "document",
    artifactId: docId,
    actor: { type: "agent", userId, agentLabel: "mcp:audit-test" },
    op: "edit",
    message: "agent change",
    apply: async () => ({ changes: [{ path: "markdown", before: null, after: "hello" }] }),
  });
});

afterAll(async () => {
  // Deleting the tenant cascades clients -> matters -> reviews/documents.
  await db.delete(tenants).where(eq(tenants.id, tenantId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("gatherMatterAudit", () => {
  test("collects commits across artifact types with attribution", async () => {
    const trail = await gatherMatterAudit(matterId);
    expect(trail).not.toBeNull();
    expect(trail!.matterName).toBe("Audit Matter");
    expect(trail!.clientName).toBe("Audit Client");
    expect(trail!.artifactCount).toBe(2);
    expect(trail!.entries).toHaveLength(2);

    const human = trail!.entries.find((e) => e.actorType === "user");
    expect(human?.actor).toContain("Audit User");
    expect(human?.artifactTitle).toBe("Audit Review");
    expect(human?.path).toBe("meta/title");

    const agent = trail!.entries.find((e) => e.actorType === "agent");
    expect(agent?.actor).toBe("mcp:audit-test");
    expect(agent?.artifactTitle).toBe("Audit Doc");
  });

  test("unknown matter returns null", async () => {
    expect(await gatherMatterAudit(randomUUID())).toBeNull();
  });
});

describe("renderers", () => {
  test("CSV has a header plus one row per entry", async () => {
    const trail = (await gatherMatterAudit(matterId))!;
    const csv = auditTrailToCsv(trail);
    const lines = csv.split("\n");
    expect(lines[0]).toContain("timestamp");
    expect(lines).toHaveLength(1 + trail.entries.length);
    expect(csv).toContain("mcp:audit-test");
  });

  test("DOCX renders to a non-empty zip", async () => {
    const trail = (await gatherMatterAudit(matterId))!;
    const bytes = await auditTrailToDocx(trail);
    expect(bytes.length).toBeGreaterThan(500);
    // DOCX = zip; magic bytes "PK".
    expect(bytes[0]).toBe(0x50);
    expect(bytes[1]).toBe(0x4b);
  });
});
