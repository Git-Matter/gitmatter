import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, test, vi } from "vite-plus/test";
import { db } from "@workspace/db/client";
import { and, eq } from "drizzle-orm";
import { jobSpendReservations, tenants, user, usageEvents } from "@workspace/db/schema";
import { defaultJobControls, setJobControls } from "../src/core/job-controls.js";
import { withProviderSpend } from "../src/ai/provider/spend.js";
import { streamComplete } from "../src/ai/provider/shared.js";
import { completeText } from "../src/ai/provider/complete.js";
import { DEFAULT_MODEL } from "../src/ai/provider/catalog.js";
import type { CompleteRequest, CompleteResult } from "../src/ai/provider/types.js";
import * as spendLedger from "../src/core/job-spend.js";
import { JobError } from "../src/core/jobs.js";

const userId = `provider-spend-${randomUUID()}`;
const actor = { type: "user" as const, userId };
const context = { actor, sourceKind: "chat" as const };
const request: CompleteRequest = {
  model: DEFAULT_MODEL,
  messages: [{ role: "user", content: "Synthetic prompt" }],
  maxTokens: 20,
};
const result: CompleteResult = {
  text: "Synthetic result",
  toolCalls: [],
  stop: "end",
  usage: { inputTokens: 5, outputTokens: 3 },
};
let tenantId: string;

describe("shared provider admission (real Postgres, no network)", () => {
  beforeAll(async () => {
    const [tenant] = await db
      .insert(tenants)
      .values({ name: "Provider admission", storageRegion: "legacy" })
      .returning();
    tenantId = tenant!.id;
    await db.insert(user).values({
      id: userId,
      name: "Operator",
      email: `${userId}@example.com`,
      tenantId,
      tenantRole: "admin",
    });
    await setJobControls(actor, {
      expectedRevision: 0,
      reason: "Single simultaneous test stream",
      policy: { ...defaultJobControls(), userConcurrency: 1 },
    });
  });
  afterAll(async () => {
    await db.delete(tenants).where(eq(tenants.id, tenantId));
    await db.delete(user).where(eq(user.id, userId));
  });

  test("streaming and buffered completions fail closed without authoritative context", async () => {
    const complete = vi.fn(async () => result);
    await expect(streamComplete({ complete }, request, {})).rejects.toThrow("access_denied");
    expect(complete).not.toHaveBeenCalled();
    await expect(
      completeText({ user: "Synthetic", model: DEFAULT_MODEL, apiKey: "synthetic-no-network" })
    ).rejects.toThrow("access_denied");
  });
  test("one admission disables SDK retries and settles usage exactly once", async () => {
    const execute = vi.fn(async (protectedRequest: CompleteRequest) => {
      expect(protectedRequest.maxRetries).toBe(0);
      expect(protectedRequest.maxTokens).toBe(20);
      return result;
    });
    expect(await withProviderSpend(context, request, execute)).toEqual(result);
    const rows = await db
      .select()
      .from(jobSpendReservations)
      .where(eq(jobSpendReservations.userId, userId));
    expect(rows).toHaveLength(1);
    expect(rows[0]!.state).toBe("settled");
    expect(rows[0]!.dispatchedAt).not.toBeNull();
    expect(
      await db
        .select()
        .from(usageEvents)
        .where(and(eq(usageEvents.userId, userId), eq(usageEvents.kind, "llm")))
    ).toHaveLength(1);
  });
  test("concurrent streams share capacity and uncertain partial output retains spend", async () => {
    let release!: () => void;
    let started!: () => void;
    const ready = new Promise<void>((resolve) => {
      started = resolve;
    });
    const gate = new Promise<void>((resolve) => {
      release = resolve;
    });
    const start = () =>
      streamComplete(
        {
          complete: async () => result,
          stream: async (protectedRequest, handlers) => {
            expect(protectedRequest.maxRetries).toBe(0);
            handlers.onText?.("partial");
            started();
            await gate;
            throw Object.assign(new Error("Synthetic timeout"), { status: 504 });
          },
        },
        request,
        { onText: vi.fn() },
        context
      );
    const first = (async () => {
      for (let attempt = 0; ; attempt++) {
        try {
          return await start();
        } catch (error) {
          if (!(error instanceof JobError) || error.code !== "limit_reached" || attempt >= 60)
            throw error;
          await new Promise<void>((resolve) => setTimeout(resolve, 20));
        }
      }
    })();
    await Promise.race([
      ready,
      first.then(() => {
        throw new Error("Stream completed before startup signal");
      }),
    ]);
    const second = vi.fn(async () => result);
    await expect(withProviderSpend(context, request, second)).rejects.toThrow("limit_reached");
    expect(second).not.toHaveBeenCalled();
    release();
    await expect(first).rejects.toThrow("Synthetic timeout");
    const rows = await db
      .select()
      .from(jobSpendReservations)
      .where(eq(jobSpendReservations.userId, userId));
    expect(rows.some((r) => r.state === "unknown" && r.reservedTokens > 0)).toBe(true);
  });
  test("expired admission cannot dispatch, and pre-dispatch rejection releases rather than inventing spend", async () => {
    const admission = await spendLedger.reserveProviderSpend(
      {
        actor,
        userId,
        tenantId,
        matterId: null,
        credentialId: null,
        runId: randomUUID(),
        model: DEFAULT_MODEL,
        sourceKind: "chat",
      },
      10,
      10
    );
    await db
      .update(jobSpendReservations)
      .set({ leaseExpiresAt: new Date(0) })
      .where(eq(jobSpendReservations.id, admission.id));
    await expect(
      spendLedger.dispatchProviderSpend(admission.id, actor, DEFAULT_MODEL)
    ).rejects.toThrow("access_denied");
    await spendLedger.settleProviderSpend(admission.id, undefined, true);
    const dispatch = vi
      .spyOn(spendLedger, "dispatchProviderSpend")
      .mockRejectedValueOnce(new JobError("access_denied"));
    const execute = vi.fn(async () => result);
    try {
      await expect(withProviderSpend(context, request, execute)).rejects.toThrow("access_denied");
    } finally {
      dispatch.mockRestore();
    }
    expect(execute).not.toHaveBeenCalled();
    const rows = await db
      .select()
      .from(jobSpendReservations)
      .where(
        and(eq(jobSpendReservations.userId, userId), eq(jobSpendReservations.state, "released"))
      );
    expect(rows.length).toBeGreaterThanOrEqual(2);
    expect(
      rows.some((row) => row.dispatchedAt === null && row.leaseExpiresAt!.getTime() > Date.now())
    ).toBe(true);
  });
  test("dollar cap rejects unpriced calls and scoped actors cannot fund unfiled work", async () => {
    await setJobControls(actor, {
      expectedRevision: 1,
      reason: "Hard cost guard",
      policy: { ...defaultJobControls(), tenantCostLimitUsd: 1 },
    });
    const execute = vi.fn(async () => result);
    await expect(
      withProviderSpend(context, { ...request, model: "unpriced/model" }, execute)
    ).rejects.toThrow("limit_reached");
    await expect(
      withProviderSpend(
        {
          ...context,
          actor: {
            type: "agent",
            userId,
            agentLabel: "scoped",
            scope: { matterIds: [], maxRole: "viewer" },
          },
        },
        request,
        execute
      )
    ).rejects.toThrow("access_denied");
    expect(execute).not.toHaveBeenCalled();
  });
});
