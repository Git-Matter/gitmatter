import { describe, expect, test, vi } from "vite-plus/test";
import { getLlmClient } from "../src/ai/provider/factory.js";

const metadata = vi.hoisted(() => ({
  anthropic: {
    input_tokens: 10,
    output_tokens: 5,
    cache_creation_input_tokens: 20,
    cache_read_input_tokens: 30,
  } as Record<string, number>,
  gemini: {
    promptTokenCount: 10,
    candidatesTokenCount: 5,
    thoughtsTokenCount: 20,
    totalTokenCount: 35,
  } as Record<string, number>,
}));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = {
      create: async () => ({
        content: [{ type: "text", text: "synthetic" }],
        stop_reason: "end_turn",
        usage: metadata.anthropic,
      }),
      stream: () => ({
        on: () => {},
        finalMessage: async () => ({
          content: [{ type: "text", text: "synthetic" }],
          stop_reason: "end_turn",
          usage: metadata.anthropic,
        }),
      }),
    };
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    models = {
      generateContent: async () => ({
        candidates: [{ content: { parts: [{ text: "synthetic" }] } }],
        usageMetadata: metadata.gemini,
      }),
      generateContentStream: async function* () {
        yield {
          candidates: [{ content: { parts: [{ text: "synthetic" }] } }],
          usageMetadata: metadata.gemini,
        };
      },
    };
  },
}));

describe("billable usage normalization (synthetic SDKs, no network)", () => {
  for (const mode of ["complete", "stream"] as const) {
    test(`${mode} includes Anthropic cache reads and writes`, async () => {
      const client = getLlmClient("anthropic", "synthetic-sdk-fixture");
      const req = {
        model: "claude-sonnet-5",
        messages: [{ role: "user" as const, content: "Synthetic" }],
        cache: true,
      };
      const result = mode === "stream" ? await client.stream!(req, {}) : await client.complete(req);
      expect(result.usage).toEqual({ inputTokens: 60, outputTokens: 5 });
    });
    test(`${mode} includes Gemini reasoning tokens`, async () => {
      const client = getLlmClient("gemini", "synthetic-sdk-fixture");
      const req = {
        model: "gemini-3.5-flash",
        messages: [{ role: "user" as const, content: "Synthetic" }],
        reasoning: "high" as const,
      };
      const result = mode === "stream" ? await client.stream!(req, {}) : await client.complete(req);
      expect(result.usage).toEqual({ inputTokens: 10, outputTokens: 25 });
    });
  }
  test("missing cache or reasoning totals retain uncertainty instead of refunding the reservation", async () => {
    const oldA = metadata.anthropic,
      oldG = metadata.gemini;
    try {
      metadata.anthropic = { input_tokens: 10, output_tokens: 5 };
      metadata.gemini = { promptTokenCount: 10, candidatesTokenCount: 5 };
      const req = {
        model: "synthetic",
        messages: [{ role: "user" as const, content: "Synthetic" }],
        cache: true,
      };
      expect(
        (await getLlmClient("anthropic", "synthetic-sdk-fixture").complete(req)).usage
      ).toBeUndefined();
      expect(
        (
          await getLlmClient("gemini", "synthetic-sdk-fixture").complete({
            ...req,
            reasoning: "high",
          })
        ).usage
      ).toBeUndefined();
    } finally {
      metadata.anthropic = oldA;
      metadata.gemini = oldG;
    }
  });
});
