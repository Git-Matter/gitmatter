import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { db } from "@workspace/db/client";
import { eq, sql } from "drizzle-orm";
import {
  documents,
  tabularCells,
  tabularReviews,
  tenants,
  user,
  mcpAccessTokens,
} from "@workspace/db/schema";
import { createClient, createMatter } from "../src/platform/matters.js";
import { createDocument } from "../src/content/documents.js";
import { createReview } from "../src/ai/tabular/reviews.js";
import { runCell, runDocument, writeCell } from "../src/ai/tabular/runner.js";
import { queryCell, queryRow } from "../src/ai/tabular/extract.js";
import { listCommits } from "../src/core/commit.js";
import * as jobAuthorization from "../src/core/jobs.js";
import * as approval from "../src/core/approval.js";

vi.mock("../src/ai/provider/index.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  resolveRunModel: async () => ({ model: "claude-sonnet-5", key: "synthetic-provider-fixture" }),
  resolveLlmKey: async () => ({ key: "synthetic-provider-fixture" }),
}));
vi.mock("../src/ai/tabular/extract.js", async (original) => ({
  ...(await original<Record<string, unknown>>()),
  queryCell: vi.fn(),
  queryRow: vi.fn(),
}));
const userId = `sync-races-${randomUUID()}`;
const actor = { type: "user" as const, userId };
let tenantId: string, clientId: string;
const providerOutput = {
  content: { summary: "Provider result", flag: "green" as const, reasoning: "Synthetic" },
  citations: [{ quote: "two years" }],
};
async function fixture() {
  const matter = await createMatter(userId, { clientId, name: "Review race" });
  const doc = await createDocument(userId, {
    title: "Source",
    markdown: "The term is two years.",
    matterId: matter.id,
  });
  const id = await createReview(actor, {
    title: "Review",
    matterId: matter.id,
    documentIds: [doc.id],
    columnsConfig: [{ index: 0, name: "Term", prompt: "Find term" }],
  });
  return { matter, doc, id };
}
describe("synchronous provider output is fenced against newer accepted work", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Sync races", storageRegion: "legacy" })
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
  test("a late cell response cannot overwrite a newer human finding", async () => {
    const f = await fixture();
    vi.mocked(queryCell).mockImplementationOnce(async () => {
      await writeCell(actor, {
        reviewId: f.id,
        documentId: f.doc.id,
        columnIndex: 0,
        summary: "Human decision",
        flag: "yellow",
        reasoning: "Accepted later",
        citations: [{ quote: "two years" }],
      });
      return providerOutput;
    });
    await expect(
      runCell(actor, { reviewId: f.id, documentId: f.doc.id, columnIndex: 0 })
    ).rejects.toThrow("stale_source");
    expect(
      (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, f.id)))[0]!.content!
        .summary
    ).toBe("Human decision");
    expect((await listCommits("tabular_review", f.id)).some((c) => c.op === "run_cell")).toBe(
      false
    );
  });
  test("a late row response cannot apply after source or rule configuration changes", async () => {
    for (const target of ["source", "rules"] as const) {
      const f = await fixture();
      vi.mocked(queryRow).mockImplementationOnce(async () => {
        if (target === "source")
          await db
            .update(documents)
            .set({ markdown: "Changed source" })
            .where(eq(documents.id, f.doc.id));
        else
          await db
            .update(tabularReviews)
            .set({ columnsConfig: [{ index: 0, name: "Term", prompt: "New rule" }] })
            .where(eq(tabularReviews.id, f.id));
        return new Map([[0, providerOutput]]);
      });
      await expect(runDocument(actor, { reviewId: f.id, documentId: f.doc.id })).rejects.toThrow(
        "stale_source"
      );
      expect(
        (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, f.id)))[0]!.content
      ).toBeNull();
    }
  });
  test("token revocation cannot commit between refreshed authorization and legal publication", async () => {
    for (const mode of ["cell", "row"] as const) {
      const f = await fixture();
      const [reference] = await db
        .insert(mcpAccessTokens)
        .values({
          userId,
          tokenHash: `synthetic-reference-${randomUUID()}`,
          label: "Synthetic metadata reference",
          allowedMatterIds: [f.matter.id],
          maxRole: "editor",
        })
        .returning({ id: mcpAccessTokens.id });
      const scoped = {
        type: "agent" as const,
        userId,
        agentLabel: "Synthetic review agent",
        scope: { matterIds: [f.matter.id], maxRole: "owner" as const },
      };
      let release!: () => void;
      let signal!: () => void;
      const gate = new Promise<void>((resolve) => {
        release = resolve;
      });
      const paused = new Promise<void>((resolve) => {
        signal = resolve;
      });
      const originalRefresh = jobAuthorization.refreshProviderActor;
      const refresh = vi
        .spyOn(jobAuthorization, "refreshProviderActor")
        .mockImplementation(async (accepted, credentialId, reader) => {
          const current = await originalRefresh(accepted, credentialId, reader);
          if (credentialId === reference!.id && reader !== db) {
            signal();
            await gate;
          }
          return current;
        });
      const staged = vi.spyOn(approval, "stageCellProposal");
      if (mode === "cell") vi.mocked(queryCell).mockResolvedValueOnce(providerOutput);
      else vi.mocked(queryRow).mockResolvedValueOnce(new Map([[0, providerOutput]]));
      const publishing =
        mode === "cell"
          ? runCell(scoped, {
              reviewId: f.id,
              documentId: f.doc.id,
              columnIndex: 0,
              credentialId: reference!.id,
            })
          : runDocument(scoped, {
              reviewId: f.id,
              documentId: f.doc.id,
              credentialId: reference!.id,
            });
      try {
        await Promise.race([
          paused,
          publishing.then(() => {
            throw new Error("Publication completed before the authorization checkpoint");
          }),
        ]);
        await expect(
          db.transaction(async (tx) => {
            await tx.execute(sql`set local lock_timeout = '100ms'`);
            await tx
              .update(mcpAccessTokens)
              .set({ revokedAt: sql`now()` })
              .where(eq(mcpAccessTokens.id, reference!.id));
          })
        ).rejects.toMatchObject({ cause: { code: "55P03" } });
        release();
        await publishing;
        expect(
          staged.mock.calls.some(
            ([, input]) => input.actor.type === "agent" && input.actor.scope?.maxRole === "editor"
          )
        ).toBe(true);
        expect(
          (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, f.id)))[0]!.content!
            .summary
        ).toBe("Provider result");
        await db
          .update(mcpAccessTokens)
          .set({ revokedAt: sql`now()` })
          .where(eq(mcpAccessTokens.id, reference!.id));
      } finally {
        release();
        await publishing.catch(() => {});
        refresh.mockRestore();
        staged.mockRestore();
      }
    }
  });

  test("a token narrowed to viewer during inference cannot publish its earlier editor result", async () => {
    const f = await fixture();
    const [reference] = await db
      .insert(mcpAccessTokens)
      .values({
        userId,
        tokenHash: `synthetic-reference-${randomUUID()}`,
        label: "Synthetic metadata reference",
        allowedMatterIds: [f.matter.id],
        maxRole: "editor",
      })
      .returning({ id: mcpAccessTokens.id });
    const scoped = {
      type: "agent" as const,
      userId,
      agentLabel: "Synthetic review agent",
      scope: { matterIds: [f.matter.id], maxRole: "editor" as const },
    };
    vi.mocked(queryCell).mockImplementationOnce(async () => {
      await db
        .update(mcpAccessTokens)
        .set({ maxRole: "viewer" })
        .where(eq(mcpAccessTokens.id, reference!.id));
      return providerOutput;
    });
    await expect(
      runCell(scoped, {
        reviewId: f.id,
        documentId: f.doc.id,
        columnIndex: 0,
        credentialId: reference!.id,
      })
    ).rejects.toThrow("stale_source");
    expect(
      (await db.select().from(tabularCells).where(eq(tabularCells.reviewId, f.id)))[0]!.content
    ).toBeNull();
    expect(
      (await listCommits("tabular_review", f.id)).some((commit) => commit.op === "run_cell")
    ).toBe(false);
  });
});
