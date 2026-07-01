import { afterAll, describe, expect, test } from "vite-plus/test";
import { randomUUID } from "node:crypto";
import { db, sql } from "@workspace/db/client";
import { usageEvents } from "@workspace/db/schema";
import { eq } from "drizzle-orm";
import { estimateCostUsd, priceForModel } from "@workspace/registry";
import { matterUsageSummary, recordLlmUsage, recordToolCall } from "../src/platform/usage.js";

// Pure-row test: usage_events has no FKs, so a random matter id suffices.
const matterId = randomUUID();
const userId = `usage-user-${randomUUID()}`;

afterAll(async () => {
  await db.delete(usageEvents).where(eq(usageEvents.matterId, matterId));
  await sql.end();
});

describe("per-matter usage", () => {
  test("recorded events aggregate by model with estimated cost", async () => {
    await recordLlmUsage({
      userId,
      matterId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 1_000_000,
      outputTokens: 100_000,
    });
    await recordLlmUsage({
      userId,
      matterId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 500_000,
      outputTokens: 50_000,
    });
    await recordLlmUsage({
      userId,
      matterId,
      provider: "openrouter",
      model: "some/unpriced-model",
      inputTokens: 10,
      outputTokens: 10,
    });
    await recordToolCall({ userId, matterId, tool: "get_document" });
    await recordToolCall({ userId, matterId, tool: "get_document" });
    await recordToolCall({ userId, matterId, tool: "write_cell" });

    const s = await matterUsageSummary(matterId);
    expect(s.totals.llmCalls).toBe(3);
    expect(s.totals.toolCalls).toBe(3);

    const sonnet = s.llm.find((r) => r.model === "claude-sonnet-5");
    expect(sonnet?.calls).toBe(2);
    expect(sonnet?.inputTokens).toBe(1_500_000);
    expect(sonnet?.outputTokens).toBe(150_000);
    // 1.5M in @ $3/M + 150k out @ $15/M = 4.5 + 2.25
    expect(sonnet?.costUsd).toBeCloseTo(6.75, 5);

    const unpriced = s.llm.find((r) => r.model === "some/unpriced-model");
    expect(unpriced?.costUsd).toBeNull();
    // Totals cost sums priced models only.
    expect(s.totals.costUsd).toBeCloseTo(6.75, 5);

    const docTool = s.tools.find((t) => t.tool === "get_document");
    expect(docTool?.calls).toBe(2);
  });

  test("events without the matter stay out of the summary", async () => {
    await recordLlmUsage({
      userId,
      provider: "anthropic",
      model: "claude-sonnet-5",
      inputTokens: 999,
      outputTokens: 999,
    });
    const s = await matterUsageSummary(matterId);
    expect(s.totals.inputTokens).toBe(1_500_010);
  });
});

describe("price table", () => {
  test("longest prefix wins and unknown models are null", () => {
    expect(priceForModel("claude-sonnet-5-20260101")?.prefix).toBe("claude-sonnet-5");
    expect(priceForModel("gpt-5-mini-2026")?.prefix).toBe("gpt-5-mini");
    expect(priceForModel("totally-unknown")).toBeNull();
    expect(estimateCostUsd("claude-haiku-4-5", 1_000_000, 1_000_000)).toBeCloseTo(6, 5);
  });
});
