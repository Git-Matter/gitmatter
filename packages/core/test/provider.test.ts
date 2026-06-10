import { describe, expect, test } from "vite-plus/test";
import {
  type ChatMessage,
  providerForModel,
  toAnthropicMessages,
  toOpenAIMessages,
} from "../src/ai/provider.js";

const convo: ChatMessage[] = [
  { role: "user", content: "Generate a memo." },
  {
    role: "assistant",
    content: "Working on it.",
    toolCalls: [{ id: "t1", name: "generate_docx", input: { title: "Memo" } }],
  },
  { role: "tool", toolCallId: "t1", content: '{"documentId":"d1"}' },
  { role: "assistant", content: "Done — [1]." },
];

describe("providerForModel", () => {
  test("maps known + inferred ids", () => {
    expect(providerForModel("claude-sonnet-4-6")).toBe("anthropic");
    expect(providerForModel("gpt-5.1")).toBe("openai");
    expect(providerForModel("gemini-2.5-flash")).toBe("gemini");
    expect(providerForModel("anything/with-slash")).toBe("openrouter");
    expect(providerForModel("claude-unknown")).toBe("anthropic");
  });
});

describe("toAnthropicMessages", () => {
  test("assistant tool_use + a coalesced tool_result user turn", () => {
    const out = toAnthropicMessages(convo);
    // user, assistant(tool_use), user(tool_result), assistant
    expect(out.map((m) => m.role)).toEqual(["user", "assistant", "user", "assistant"]);
    const toolUse = out[1]!.content as Array<{ type: string }>;
    expect(toolUse.some((b) => b.type === "tool_use")).toBe(true);
    const toolResult = out[2]!.content as Array<{ type: string; tool_use_id?: string }>;
    expect(toolResult[0]).toMatchObject({ type: "tool_result", tool_use_id: "t1" });
  });
});

describe("toOpenAIMessages", () => {
  test("system prepended; assistant carries tool_calls; tool role matches id", () => {
    const out = toOpenAIMessages("be precise", convo);
    expect(out[0]).toEqual({ role: "system", content: "be precise" });
    const assistant = out[2] as { role: string; tool_calls?: Array<{ id: string }> };
    expect(assistant.role).toBe("assistant");
    expect(assistant.tool_calls?.[0]?.id).toBe("t1");
    expect(out[3]).toMatchObject({ role: "tool", tool_call_id: "t1" });
  });
});
