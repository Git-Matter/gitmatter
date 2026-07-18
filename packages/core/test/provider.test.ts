import { describe, expect, test } from "vite-plus/test";
import {
  type ChatMessage,
  providerForModel,
  toAnthropicMessages,
  toGeminiContents,
  toOpenRouterMessages,
  toResponsesInput,
} from "../src/ai/provider/index.js";

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
    expect(providerForModel("claude-sonnet-5")).toBe("anthropic");
    expect(providerForModel("gpt-5.6-sol")).toBe("openai");
    expect(providerForModel("gemini-3.5-flash")).toBe("gemini");
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

describe("toResponsesInput", () => {
  test("assistant function_call + a function_call_output keyed by call_id", () => {
    const out = toResponsesInput(convo);
    // user, assistant(text), function_call, function_call_output, assistant(text)
    const call = out.find((i) => "type" in i && i.type === "function_call") as {
      call_id: string;
      name: string;
    };
    expect(call).toMatchObject({ call_id: "t1", name: "generate_docx" });
    const result = out.find((i) => "type" in i && i.type === "function_call_output") as {
      call_id: string;
    };
    expect(result.call_id).toBe("t1");
  });
});

describe("toGeminiContents", () => {
  test("tool result becomes a functionResponse keyed back to its call name", () => {
    const out = toGeminiContents(convo);
    expect(out.map((c) => c.role)).toEqual(["user", "model", "user", "model"]);
    const fnCall = out[1]?.parts?.[1]?.functionCall;
    expect(fnCall).toMatchObject({ name: "generate_docx" });
    const fnResp = out[2]?.parts?.[0]?.functionResponse;
    expect(fnResp).toMatchObject({ name: "generate_docx" });
  });
});

describe("toOpenRouterMessages", () => {
  test("system prepended; assistant carries toolCalls; tool role matches id", () => {
    const out = toOpenRouterMessages("be precise", convo);
    expect(out[0]).toEqual({ role: "system", content: "be precise" });
    const assistant = out[2] as { role: string; toolCalls?: Array<{ id: string }> };
    expect(assistant.role).toBe("assistant");
    expect(assistant.toolCalls?.[0]?.id).toBe("t1");
    expect(out[3]).toMatchObject({ role: "tool", toolCallId: "t1" });
  });
});
