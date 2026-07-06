import { type Content, GoogleGenAI, type Part } from "@google/genai";
import { THINKING_BUDGET, llmTimeoutMs, tryJson } from "../shared.js";
import type {
  ChatMessage,
  CompleteRequest,
  CompleteResult,
  LlmClient,
  UsageInfo,
  StreamHandlers,
} from "../types.js";

// ---- Google Gemini (@google/genai) ↔ normalized ----

export function toGeminiContents(messages: ChatMessage[]): Content[] {
  // Gemini matches a tool result to its call by function name, not id, so map our
  // normalized tool-call ids back to names from the assistant turns.
  const idToName = new Map<string, string>();
  for (const m of messages)
    if (m.role === "assistant") for (const tc of m.toolCalls ?? []) idToName.set(tc.id, tc.name);

  const out: Content[] = [];
  for (const msg of messages) {
    if (msg.role === "user") {
      out.push({ role: "user", parts: [{ text: msg.content }] });
    } else if (msg.role === "tool") {
      out.push({
        role: "user",
        parts: [
          {
            functionResponse: {
              id: msg.toolCallId,
              name: idToName.get(msg.toolCallId) ?? msg.toolCallId,
              response: { result: tryJson(msg.content) },
            },
          },
        ],
      });
    } else if (msg.reasoning?.length) {
      // Replay the raw model parts verbatim — they carry the thought signatures
      // Gemini requires to accept multi-turn function calling.
      out.push({ role: "model", parts: msg.reasoning as Part[] });
    } else {
      const parts: Part[] = [];
      if (msg.content) parts.push({ text: msg.content });
      for (const tc of msg.toolCalls ?? [])
        parts.push({ functionCall: { id: tc.id, name: tc.name, args: tc.input } });
      out.push({ role: "model", parts });
    }
  }
  return out;
}

export class GeminiClient implements LlmClient {
  constructor(private readonly apiKey: string) {}

  private buildRequest(req: CompleteRequest) {
    const budget = req.reasoning ? THINKING_BUDGET[req.reasoning] : 0;
    return {
      model: req.model,
      contents: toGeminiContents(req.messages),
      config: {
        systemInstruction: req.system,
        maxOutputTokens: (req.maxTokens ?? 2048) + budget,
        ...(req.temperature !== undefined ? { temperature: req.temperature } : {}),
        ...(req.reasoning
          ? { thinkingConfig: { thinkingBudget: budget, includeThoughts: true } }
          : {}),
        // Structured output (tools and a response schema are mutually exclusive).
        ...(req.jsonSchema
          ? { responseMimeType: "application/json", responseJsonSchema: req.jsonSchema }
          : {}),
        tools: req.tools?.length
          ? [
              {
                functionDeclarations: req.tools.map((t) => ({
                  name: t.name,
                  description: t.description,
                  parametersJsonSchema: t.inputSchema,
                })),
              },
            ]
          : undefined,
      },
    };
  }

  // Reconstruct the result from the model's parts. For streaming, `parts` is the
  // concatenation of every chunk's parts — text fragments stay as separate parts
  // (replay tolerates that); functionCall/thought parts carry their signatures.
  private finalize(parts: Part[]): CompleteResult {
    const text = parts
      .filter((p) => p.text && !p.thought)
      .map((p) => p.text)
      .join("");
    const toolCalls = parts
      .filter((p): p is Part & { functionCall: NonNullable<Part["functionCall"]> } =>
        Boolean(p.functionCall)
      )
      .map((p, i) => ({
        id: p.functionCall.id ?? `${p.functionCall.name ?? "fn"}-${i}`,
        name: p.functionCall.name ?? "",
        input: (p.functionCall.args ?? {}) as Record<string, unknown>,
      }));
    return {
      text,
      toolCalls,
      stop: toolCalls.length ? "tool_use" : "end",
      // Keep the raw model parts so thought signatures + calls replay verbatim.
      reasoning: toolCalls.length ? parts : undefined,
    };
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { httpOptions: { timeout: llmTimeoutMs() } } : {}),
    });
    const res = await ai.models.generateContent(this.buildRequest(req));
    const out = this.finalize(res.candidates?.[0]?.content?.parts ?? []);
    out.usage = geminiUsage(res.usageMetadata, req);
    return out;
  }

  async stream(req: CompleteRequest, handlers: StreamHandlers): Promise<CompleteResult> {
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { httpOptions: { timeout: llmTimeoutMs() } } : {}),
    });
    const gen = await ai.models.generateContentStream(this.buildRequest(req));
    const parts: Part[] = [];
    let usageMeta:
      | {
          promptTokenCount?: number;
          candidatesTokenCount?: number;
          cachedContentTokenCount?: number;
        }
      | undefined;
    for await (const chunk of gen) {
      for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (p.text) (p.thought ? handlers.onReasoning : handlers.onText)?.(p.text);
        parts.push(p);
      }
      if (chunk.usageMetadata) usageMeta = chunk.usageMetadata; // last chunk carries the totals
    }
    const out = this.finalize(parts);
    out.usage = geminiUsage(usageMeta, req);
    return out;
  }
}

// Gemini reports cumulative counts on usageMetadata; map to our shape (null-safe).
function geminiUsage(
  m:
    | { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number }
    | undefined,
  req: CompleteRequest
): UsageInfo | undefined {
  if (!m) return undefined;
  return {
    inputTokens: m.promptTokenCount ?? 0,
    outputTokens: m.candidatesTokenCount ?? 0,
    cachedInputTokens: m.cachedContentTokenCount,
    cacheReadTokens: m.cachedContentTokenCount,
    cacheMode: "automatic",
    cacheKey: req.cacheKey,
  };
}
