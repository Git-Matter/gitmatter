import { OpenRouter } from "@openrouter/sdk";
import type { ChatMessages as OpenRouterMessage } from "@openrouter/sdk/models";
import { llmTimeoutMs, safeParse } from "../shared.js";
import type {
  ChatMessage,
  CompleteRequest,
  CompleteResult,
  LlmClient,
  UsageInfo,
  StreamHandlers,
} from "../types.js";

// ---- OpenRouter (@openrouter/sdk) ↔ normalized ----

export function toOpenRouterMessages(
  system: string | undefined,
  messages: ChatMessage[]
): OpenRouterMessage[] {
  const out: OpenRouterMessage[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const msg of messages) {
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
    } else if (msg.role === "tool") {
      out.push({ role: "tool", toolCallId: msg.toolCallId, content: msg.content });
    } else {
      out.push({
        role: "assistant",
        content: msg.content || null,
        toolCalls: msg.toolCalls?.length
          ? msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            }))
          : undefined,
      });
    }
  }
  return out;
}

export class OpenRouterClient implements LlmClient {
  constructor(private readonly apiKey: string) {}

  // Shared request body (everything but the `stream` flag, which the overloads
  // require as a literal at the call site).
  private chatRequest(req: CompleteRequest) {
    return {
      model: req.model,
      messages: toOpenRouterMessages(req.system, req.messages),
      maxCompletionTokens: req.maxTokens ?? 2048,
      ...(req.reasoning ? { reasoning: { effort: req.reasoning } } : {}),
      ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
      // Auto-cache the static prefix (applies to Claude models routed here).
      ...(req.cache ? { cacheControl: { type: "ephemeral" as const } } : {}),
      // Structured output: constrain the response to the requested JSON schema.
      ...(req.jsonSchema
        ? {
            responseFormat: {
              type: "json_schema" as const,
              jsonSchema: { name: "result", schema: req.jsonSchema, strict: false },
            },
          }
        : {}),
      // Route only to providers that don't retain user data.
      provider: { dataCollection: "deny" as const },
      tools: req.tools?.map((t) => ({
        type: "function" as const,
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
    };
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const client = new OpenRouter({ apiKey: this.apiKey });
    const res = await client.chat.send(
      { chatRequest: { stream: false, ...this.chatRequest(req) } },
      llmTimeoutMs() ? { timeoutMs: llmTimeoutMs() } : undefined
    );
    const choice = res.choices[0];
    const toolCalls = (choice?.message.toolCalls ?? []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      input: safeParse(tc.function.arguments),
    }));
    return {
      text: typeof choice?.message.content === "string" ? choice.message.content : "",
      toolCalls,
      stop: choice?.finishReason === "tool_calls" ? "tool_use" : "end",
      usage: openrouterUsage(res.usage, req),
    };
  }

  async stream(req: CompleteRequest, handlers: StreamHandlers): Promise<CompleteResult> {
    const client = new OpenRouter({ apiKey: this.apiKey });
    const events = await client.chat.send(
      { chatRequest: { stream: true, ...this.chatRequest(req) } },
      llmTimeoutMs() ? { timeoutMs: llmTimeoutMs() } : undefined
    );

    let text = "";
    let finishReason: string | null = null;
    let usage: UsageInfo | undefined;
    // Tool-call fragments arrive split across chunks; merge by their position index.
    const acc = new Map<number, { id?: string; name?: string; args: string }>();

    for await (const chunk of events) {
      const choice = chunk.choices?.[0];
      const delta = choice?.delta;
      if (delta?.content) {
        text += delta.content;
        handlers.onText?.(delta.content);
      }
      if (delta?.reasoning) handlers.onReasoning?.(delta.reasoning);
      for (const [i, tc] of (delta?.toolCalls ?? []).entries()) {
        const idx = (tc as { index?: number }).index ?? i;
        const cur = acc.get(idx) ?? { args: "" };
        if (tc.id) cur.id = tc.id;
        if (tc.function?.name) cur.name = tc.function.name;
        if (tc.function?.arguments) cur.args += tc.function.arguments;
        acc.set(idx, cur);
      }
      if (choice?.finishReason) finishReason = choice.finishReason;
      if (chunk.usage) usage = openrouterUsage(chunk.usage, req); // last chunk carries usage
    }

    const toolCalls = [...acc.values()]
      .filter((t) => t.name)
      .map((t) => ({ id: t.id ?? t.name!, name: t.name!, input: safeParse(t.args) }));
    return {
      text,
      toolCalls,
      stop: finishReason === "tool_calls" || toolCalls.length ? "tool_use" : "end",
      usage,
    };
  }
}

// OpenRouter usage comes back snake- or camel-cased depending on path; read both.
function openrouterUsage(u: unknown, req: CompleteRequest): UsageInfo | undefined {
  if (!u || typeof u !== "object") return undefined;
  const o = u as Record<string, number | undefined>;
  const input = o.promptTokens ?? o.prompt_tokens;
  const output = o.completionTokens ?? o.completion_tokens;
  const cached = o.cachedTokens ?? o.cached_tokens;
  const cacheWrite = o.cacheWriteTokens ?? o.cache_write_tokens ?? o.cache_creation_input_tokens;
  const cacheRead = o.cacheReadTokens ?? o.cache_read_tokens ?? o.cache_read_input_tokens;
  if (input === undefined && output === undefined) return undefined;
  return {
    inputTokens: input ?? 0,
    outputTokens: output ?? 0,
    cachedInputTokens: cached ?? cacheRead,
    cacheWriteTokens: cacheWrite,
    cacheReadTokens: cacheRead,
    cacheMode: req.cache ? "gateway" : undefined,
    cacheKey: req.cacheKey,
  };
}
