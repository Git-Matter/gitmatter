import { afterAll, beforeAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { clients, tabularReviews, user } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { deriveBlame, diffCommits, listCommits, recordCommit } from "../src/core/commit.js";
import { ensureDefaultMatter } from "../src/platform/matters.js";

const userId = `test-user-${randomUUID()}`;
let reviewId: string;

beforeAll(async () => {
  await db.insert(user).values({
    id: userId,
    name: "Test User",
    email: `${userId}@example.com`,
    emailVerified: true,
  });
  const matterId = await ensureDefaultMatter(userId, "Test User");
  const [r] = await db
    .insert(tabularReviews)
    .values({
      userId,
      matterId,
      createdBy: userId,
      title: "Test Review",
      columnsConfig: [{ index: 0, name: "C0", prompt: "p" }],
      documentIds: [],
    })
    .returning();
  reviewId = r!.id;
});

afterAll(async () => {
  // Deleting the client cascades its matters -> reviews -> members.
  await db.delete(clients).where(eq(clients.createdBy, userId));
  await db.delete(user).where(eq(user.id, userId));
  await sql.end();
});

describe("recordCommit", () => {
  test("seq is monotonic, parent links, head pointer updates", async () => {
    const r1 = await recordCommit({
      artifactType: "tabular_review",
      artifactId: reviewId,
      actor: { type: "user", userId },
      op: "create",
      message: "first",
      apply: async () => ({ changes: [{ path: "meta/title", before: null, after: "v1" }] }),
    });
    const r2 = await recordCommit({
      artifactType: "tabular_review",
      artifactId: reviewId,
      actor: { type: "agent", userId, agentLabel: "mcp:test" },
      op: "update",
      message: "second",
      apply: async () => ({ changes: [{ path: "meta/title", before: "v1", after: "v2" }] }),
    });

    expect(r1.commit!.seq).toBe(1);
    expect(r2.commit!.seq).toBe(2);
    expect(r2.commit!.parentCommitId).toBe(r1.commit!.id);
    expect(r2.commit!.actorType).toBe("agent");
    expect(r2.commit!.agentLabel).toBe("mcp:test");

    const [review] = await db.select().from(tabularReviews).where(eq(tabularReviews.id, reviewId));
    expect(review!.headCommitId).toBe(r2.commit!.id);
  });

  test("concurrent commits get unique sequential seqs (FOR UPDATE)", async () => {
    const artifactId = randomUUID(); // no artifact row; head update is a no-op
    const N = 12;
    await Promise.all(
      Array.from({ length: N }, (_, i) =>
        recordCommit({
          artifactType: "contract",
          artifactId,
          actor: { type: "user", userId },
          op: "update",
          message: `c${i}`,
          apply: async () => ({ changes: [{ path: `field/${i}`, before: null, after: i }] }),
        })
      )
    );
    const rows = await listCommits("contract", artifactId);
    const seqs = rows.map((r) => r.seq).sort((a, b) => a - b);
    expect(seqs).toEqual(Array.from({ length: N }, (_, i) => i + 1));
    expect(new Set(seqs).size).toBe(N); // no duplicates
  });

  test("diffCommits reports field-level changes", async () => {
    const diff = await diffCommits("tabular_review", reviewId, 1, 2);
    const titleDiff = diff.find((d) => d.path === "meta/title");
    expect(titleDiff).toBeDefined();
    expect(titleDiff!.op).toBe("modified");
    expect(titleDiff!.before).toBe("v1");
    expect(titleDiff!.after).toBe("v2");
  });

  test("deriveBlame returns the latest commit that set a path", async () => {
    const blame = await deriveBlame("tabular_review", reviewId, "meta/title");
    expect(blame).not.toBeNull();
    expect(blame!.seq).toBe(2);
    expect(blame!.message).toBe("second");
  });
});
