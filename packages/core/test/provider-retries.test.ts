import { describe, expect, test, vi } from "vite-plus/test";
import { queryCell } from "../src/ai/tabular/extract.js";

const constructors = vi.hoisted(() => ({
  anthropic: [] as Array<Record<string, unknown>>,
  openai: [] as Array<Record<string, unknown>>,
  gemini: [] as Array<Record<string, unknown>>,
  openrouter: [] as Array<Record<string, unknown>>,
}));
// Fake SDK clients record construction options and return local values. They
// never look up keys, send requests, or invoke a provider retry loop.
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    constructor(options: Record<string, unknown>) {
      constructors.anthropic.push(options);
    }
    messages = {
      create: async () => ({
        content: [{ type: "text", text: "{}" }],
        stop_reason: "end_turn",
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };
  },
}));
vi.mock("openai", () => ({
  default: class {
    constructor(options: Record<string, unknown>) {
      constructors.openai.push(options);
    }
    responses = {
      create: async () => ({
        output_text: "{}",
        output: [],
        usage: { input_tokens: 1, output_tokens: 1 },
      }),
    };
  },
}));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(options: Record<string, unknown>) {
      constructors.gemini.push(options);
    }
    models = {
      generateContent: async () => ({
        candidates: [{ content: { parts: [{ text: "{}" }] } }],
        usageMetadata: { promptTokenCount: 1, candidatesTokenCount: 1 },
      }),
    };
  },
}));
vi.mock("@openrouter/sdk", () => ({
  OpenRouter: class {
    constructor(options: Record<string, unknown>) {
      constructors.openrouter.push(options);
    }
    chat = {
      send: async () => ({
        choices: [{ message: { content: "{}", toolCalls: [] }, finishReason: "stop" }],
      }),
    };
  },
}));

describe("durable query forwards retry ownership through installed adapter contracts", () => {
  for (const [provider, model] of [
    ["anthropic", "claude-sonnet-5"],
    ["openai", "gpt-5.6-sol"],
    ["gemini", "gemini-3.5-flash"],
    ["openrouter", "vendor/synthetic-model"],
  ] as const)
    test(`${provider} disables internal retries only when requested`, async () => {
      const input = {
        model,
        filename: "Synthetic",
        documentText: "Term is two years.",
        columnPrompt: "Find term",
        apiKey: "synthetic-sdk-fixture",
      };
      await queryCell({ ...input, maxRetries: 0 });
      const controlled = constructors[provider].at(-1)!;
      if (provider === "gemini")
        expect(controlled.httpOptions).toMatchObject({ retryOptions: { attempts: 1 } });
      else if (provider === "openrouter")
        expect(controlled.retryConfig).toEqual({ strategy: "none" });
      else expect(controlled.maxRetries).toBe(0);
      await queryCell(input);
      const normal = constructors[provider].at(-1)!;
      if (provider === "gemini")
        expect(
          (normal.httpOptions as { retryOptions?: unknown } | undefined)?.retryOptions
        ).toBeUndefined();
      else if (provider === "openrouter") expect(normal.retryConfig).toBeUndefined();
      else expect(normal.maxRetries).toBeUndefined();
    });
});
