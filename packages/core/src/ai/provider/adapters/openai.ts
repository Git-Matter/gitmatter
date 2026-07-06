import OpenAI from "openai";
import { THINKING_BUDGET, llmTimeoutMs, safeParse } from "../shared.js";
import type {
  ChatMessage,
  CompleteRequest,
  CompleteResult,
  LlmClient,
  StreamHandlers,
} from "../types.js";

// ---- OpenAI Responses API ↔ normalized ----
// OpenAI speaks the Responses API (/v1/responses); the legacy Chat Completions
// endpoint rejects reasoning_effort + function tools on gpt-5.x.

export function toResponsesInput(messages: ChatMessage[]): OpenAI.Responses.ResponseInput {
  const out: OpenAI.Responses.ResponseInput = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      out.push({ role: "user", content: msg.content });
    } else if (msg.role === "tool") {
      out.push({ type: "function_call_output", call_id: msg.toolCallId, output: msg.content });
    } else {
      // Replay reasoning items verbatim, in the same order the model emitted them
      // (reasoning → message → function_call), so stateless tool turns stay valid.
      for (const item of msg.reasoning ?? []) out.push(item as OpenAI.Responses.ResponseInputItem);
      if (msg.content) out.push({ role: "assistant", content: msg.content });
      for (const tc of msg.toolCalls ?? [])
        out.push({
          type: "function_call",
          call_id: tc.id,
          name: tc.name,
          arguments: JSON.stringify(tc.input),
        });
    }
  }
  return out;
}

export class OpenAIResponsesClient implements LlmClient {
  constructor(private readonly apiKey: string) {}

  private buildParams(req: CompleteRequest): OpenAI.Responses.ResponseCreateParamsNonStreaming {
    const budget = req.reasoning ? THINKING_BUDGET[req.reasoning] : 0;
    return {
      model: req.model,
      instructions: req.system,
      input: toResponsesInput(req.messages),
      max_output_tokens: (req.maxTokens ?? 2048) + budget,
      ...(req.reasoning ? { reasoning: { effort: req.reasoning } } : {}),
      // temperature is intentionally omitted: our OpenAI catalog is gpt-5.x, whose
      // reasoning models reject a non-default temperature on the Responses API.
      // A stable key lets OpenAI reuse the prompt cache across the loop's turns.
      ...(req.cacheKey ? { prompt_cache_key: req.cacheKey } : {}),
      // Structured output: constrain the response to the requested JSON schema.
      ...(req.jsonSchema
        ? {
            text: {
              format: {
                type: "json_schema" as const,
                name: "result",
                schema: req.jsonSchema,
                strict: false,
              },
            },
          }
        : {}),
      // Stay stateless (BYOK / zero-retention): never persist server-side, and carry
      // encrypted reasoning so it can be replayed across tool turns.
      store: false,
      include: ["reasoning.encrypted_content"],
      tools: req.tools?.map((t) => ({
        type: "function" as const,
        name: t.name,
        description: t.description,
        parameters: t.inputSchema,
        strict: false,
      })),
    };
  }

  private finalize(req: CompleteRequest, res: OpenAI.Responses.Response): CompleteResult {
    const items = res.output ?? [];
    const toolCalls = items
      .filter((i): i is OpenAI.Responses.ResponseFunctionToolCall => i.type === "function_call")
      .map((i) => ({ id: i.call_id, name: i.name, input: safeParse(i.arguments) }));
    // Keep reasoning items so the next turn can replay them.
    const reasoning = items.filter((i) => i.type === "reasoning");
    return {
      text: res.output_text ?? "",
      toolCalls,
      stop: toolCalls.length ? "tool_use" : "end",
      reasoning: reasoning.length ? reasoning : undefined,
      usage: res.usage
        ? {
            inputTokens: res.usage.input_tokens,
            outputTokens: res.usage.output_tokens,
            cachedInputTokens: res.usage.input_tokens_details?.cached_tokens,
            cacheMode: "automatic",
            cacheKey: req.cacheKey,
          }
        : undefined,
    };
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const openai = new OpenAI({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { timeout: llmTimeoutMs() } : {}),
    });
    return this.finalize(req, await openai.responses.create(this.buildParams(req)));
  }

  async stream(req: CompleteRequest, handlers: StreamHandlers): Promise<CompleteResult> {
    const openai = new OpenAI({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { timeout: llmTimeoutMs() } : {}),
    });
    // buildParams returns the NonStreaming shape; stream() takes the same fields
    // minus `stream`, so the cast through the method's own param type is safe.
    const s = openai.responses.stream(
      this.buildParams(req) as Parameters<typeof openai.responses.stream>[0]
    );
    // Accumulate text deltas: finalResponse().output_text can come back empty for
    // some models, which would wipe the streamed answer. Fall back to the deltas.
    let acc = "";
    for await (const event of s) {
      if (event.type === "response.output_text.delta") {
        acc += event.delta;
        handlers.onText?.(event.delta);
      } else if (event.type === "response.reasoning_summary_text.delta")
        handlers.onReasoning?.(event.delta);
    }
    const res = this.finalize(req, await s.finalResponse());
    return res.text ? res : { ...res, text: acc };
  }
}
