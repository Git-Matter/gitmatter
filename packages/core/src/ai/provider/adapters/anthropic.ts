import Anthropic from "@anthropic-ai/sdk";
import { THINKING_BUDGET, llmTimeoutMs } from "../shared.js";
import type {
  ChatMessage,
  CompleteRequest,
  CompleteResult,
  LlmClient,
  StreamHandlers,
} from "../types.js";

// ---- Anthropic ↔ normalized ----

export function toAnthropicMessages(messages: ChatMessage[]): Anthropic.MessageParam[] {
  const out: Anthropic.MessageParam[] = [];
  let pendingToolResults: Anthropic.ToolResultBlockParam[] = [];

  const flush = () => {
    if (pendingToolResults.length) {
      out.push({ role: "user", content: pendingToolResults });
      pendingToolResults = [];
    }
  };

  for (const msg of messages) {
    if (msg.role === "tool") {
      pendingToolResults.push({
        type: "tool_result",
        tool_use_id: msg.toolCallId,
        content: msg.content,
        is_error: msg.isError,
      });
      continue;
    }
    flush();
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
    } else {
      const content: Anthropic.ContentBlockParam[] = [];
      // Thinking blocks must come first and be preserved verbatim, else the API
      // rejects the turn when extended thinking + tool use are combined.
      for (const block of msg.reasoning ?? []) content.push(block as Anthropic.ContentBlockParam);
      if (msg.content) content.push({ type: "text", text: msg.content });
      for (const tc of msg.toolCalls ?? [])
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      out.push({ role: "assistant", content });
    }
  }
  flush();
  return out;
}

// Cache the growing conversation prefix: a breakpoint on the last message block
// lets every prior turn — including large get_document tool results — read from
// cache across the tool loop's passes and later turns instead of re-billing the
// full history each request. Complements the system + tool-definition breakpoints.
export function markLastMessageCacheable(messages: Anthropic.MessageParam[]): void {
  const last = messages[messages.length - 1];
  if (!last) return;
  if (typeof last.content === "string") {
    last.content = [{ type: "text", text: last.content, cache_control: { type: "ephemeral" } }];
    return;
  }
  const block = last.content[last.content.length - 1];
  if (block)
    (block as { cache_control?: { type: "ephemeral" } }).cache_control = { type: "ephemeral" };
}

// Anthropic has no JSON mode — force a single-tool turn whose input *is* the
// schema, then read the tool input back as the structured result.
const ANTHROPIC_STRUCTURED_TOOL = "structured_response";

export class AnthropicClient implements LlmClient {
  constructor(private readonly apiKey: string) {}

  private buildParams(req: CompleteRequest): Anthropic.MessageCreateParamsNonStreaming {
    const budget = req.reasoning ? THINKING_BUDGET[req.reasoning] : 0;
    // max_tokens must exceed the thinking budget, so add the answer allowance on top.
    const maxTokens = (req.maxTokens ?? 2048) + budget;

    const structured = req.jsonSchema && !req.tools?.length;
    const tools: Anthropic.Tool[] | undefined = structured
      ? [
          {
            name: ANTHROPIC_STRUCTURED_TOOL,
            description: "Return the result in the required schema.",
            input_schema: req.jsonSchema as Anthropic.Tool.InputSchema,
          },
        ]
      : req.tools?.map((t) => ({
          name: t.name,
          description: t.description,
          input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
        }));
    // Cache the static tool prefix: a breakpoint on the last tool caches every
    // preceding tool definition across the loop's turns.
    if (req.cache && tools?.length) tools[tools.length - 1]!.cache_control = { type: "ephemeral" };

    const messages = toAnthropicMessages(req.messages);
    // Cache the conversation prefix too, so large tool results (get_document
    // body) aren't re-billed on every pass of the tool loop.
    if (req.cache) markLastMessageCacheable(messages);

    return {
      model: req.model,
      max_tokens: maxTokens,
      // A cache breakpoint on the system block caches the shared instructions too.
      system:
        req.cache && req.system
          ? [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }]
          : req.system,
      messages,
      // Extended thinking pins temperature to 1, so only send it otherwise.
      temperature: budget ? undefined : req.temperature,
      thinking: budget ? { type: "enabled", budget_tokens: budget } : undefined,
      tools,
      tool_choice: structured ? { type: "tool", name: ANTHROPIC_STRUCTURED_TOOL } : undefined,
    };
  }

  private finalize(
    req: CompleteRequest,
    content: Anthropic.ContentBlock[],
    stopReason: Anthropic.Message["stop_reason"]
  ): CompleteResult {
    const structured = req.jsonSchema && !req.tools?.length;
    const toolUses = content.filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use");
    if (structured) {
      const out = toolUses[0];
      return { text: out ? JSON.stringify(out.input) : "", toolCalls: [], stop: "end" };
    }
    const text = content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const toolCalls = toolUses.map((b) => ({
      id: b.id,
      name: b.name,
      input: b.input as Record<string, unknown>,
    }));
    // Keep thinking/redacted_thinking blocks so the next turn can replay them.
    const reasoning = content.filter(
      (b) => b.type === "thinking" || b.type === "redacted_thinking"
    );
    return {
      text,
      toolCalls,
      stop: stopReason === "tool_use" ? "tool_use" : "end",
      reasoning: reasoning.length ? reasoning : undefined,
    };
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const anthropic = new Anthropic({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { timeout: llmTimeoutMs() } : {}),
    });
    const res = await anthropic.messages.create(this.buildParams(req));
    const out = this.finalize(req, res.content, res.stop_reason);
    out.usage = { inputTokens: res.usage.input_tokens, outputTokens: res.usage.output_tokens };
    return out;
  }

  async stream(req: CompleteRequest, handlers: StreamHandlers): Promise<CompleteResult> {
    const anthropic = new Anthropic({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { timeout: llmTimeoutMs() } : {}),
    });
    const s = anthropic.messages.stream(this.buildParams(req));
    if (handlers.onText) s.on("text", (delta) => handlers.onText!(delta));
    if (handlers.onReasoning) s.on("thinking", (delta) => handlers.onReasoning!(delta));
    const msg = await s.finalMessage();
    const out = this.finalize(req, msg.content, msg.stop_reason);
    out.usage = { inputTokens: msg.usage.input_tokens, outputTokens: msg.usage.output_tokens };
    return out;
  }
}
