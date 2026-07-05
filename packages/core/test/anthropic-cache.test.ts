import { describe, expect, test } from "vite-plus/test";
import type Anthropic from "@anthropic-ai/sdk";
import { markLastMessageCacheable } from "../src/ai/provider/adapters/anthropic.js";

describe("markLastMessageCacheable", () => {
  test("wraps a trailing string message in a cacheable text block", () => {
    const messages: Anthropic.MessageParam[] = [
      { role: "user", content: "hello" },
      { role: "assistant", content: "hi" },
    ];
    markLastMessageCacheable(messages);
    const last = messages[1]!;
    expect(Array.isArray(last.content)).toBe(true);
    const block = (last.content as Anthropic.ContentBlockParam[])[0]!;
    expect(block).toMatchObject({ type: "text", text: "hi", cache_control: { type: "ephemeral" } });
  });

  test("marks the last block of a tool_result message (the get_document body)", () => {
    const messages: Anthropic.MessageParam[] = [
      {
        role: "user",
        content: [
          { type: "tool_result", tool_use_id: "t1", content: "small" },
          { type: "tool_result", tool_use_id: "t2", content: "the big document body" },
        ],
      },
    ];
    markLastMessageCacheable(messages);
    const blocks = messages[0]!.content as Anthropic.ContentBlockParam[];
    // Only the last block carries the breakpoint; earlier blocks stay untouched.
    expect((blocks[0] as { cache_control?: unknown }).cache_control).toBeUndefined();
    expect((blocks[1] as { cache_control?: unknown }).cache_control).toEqual({ type: "ephemeral" });
  });

  test("no-op on empty message list", () => {
    const messages: Anthropic.MessageParam[] = [];
    expect(() => markLastMessageCacheable(messages)).not.toThrow();
  });
});
