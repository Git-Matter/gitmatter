import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { GoogleGenAI, type Content, type Part } from "@google/genai";
import { OpenRouter } from "@openrouter/sdk";
import type { ChatMessages as OpenRouterMessage } from "@openrouter/sdk/models";
import type {
  LlmModel,
  LlmProvider,
  ModelCapabilities,
  OpenRouterModel,
  ProviderCatalog,
} from "@workspace/contracts";
import { getUserApiKey } from "../core/keys.js";
import { fetchWithTimeout } from "../core/fetch.js";
import { getEnv } from "../core/config.js";

// Optional hard timeout (ms) for LLM SDK calls. Unset by default so long
// streaming generations are never cut off; set LLM_TIMEOUT_MS to enforce one.
function llmTimeoutMs(): number | undefined {
  const v = Number(getEnv("LLM_TIMEOUT_MS"));
  return Number.isFinite(v) && v > 0 ? v : undefined;
}

export type { LlmModel, LlmProvider, ModelCapabilities, OpenRouterModel, ProviderCatalog };

// Multi-provider LLM layer (outbound BYOK). Each provider speaks through its own
// first-party SDK on its current, non-deprecated API surface: Anthropic's Messages
// API, OpenAI's Responses API (/v1/responses — the legacy Chat Completions endpoint
// rejects reasoning_effort + function tools on gpt-5.x), Google's @google/genai, and
// OpenRouter's @openrouter/sdk. One normalized message/tool model flows through all
// four adapters so chat and tabular extraction never branch on the provider.

type ProviderConfig = { envKey: string };

export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  anthropic: { envKey: "ANTHROPIC_API_KEY" },
  openai: { envKey: "OPENAI_API_KEY" },
  gemini: { envKey: "GEMINI_API_KEY" },
  openrouter: { envKey: "OPENROUTER_API_KEY" },
};

// Display names for the native-key providers, surfaced in the model catalog.
export const PROVIDER_LABELS: Record<LlmProvider, string> = {
  anthropic: "Anthropic",
  openai: "OpenAI",
  gemini: "Google Gemini",
  openrouter: "OpenRouter",
};

// Curated catalog for the three native-key providers. OpenRouter is no longer
// listed here — it's searched live (searchOpenRouterModels) so users can pick any
// "vendor/model" id without us hand-maintaining the long tail. Capabilities are
// curated alongside each model. Edit as models ship.
export const LLM_MODELS: LlmModel[] = [
  // Anthropic
  {
    id: "claude-opus-4-8",
    label: "Claude Opus 4.8",
    provider: "anthropic",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 200_000 },
  },
  {
    id: "claude-sonnet-4-6",
    label: "Claude Sonnet 4.6",
    provider: "anthropic",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 200_000 },
  },
  {
    id: "claude-haiku-4-5",
    label: "Claude Haiku 4.5",
    provider: "anthropic",
    capabilities: { vision: true, tools: true, reasoning: false, contextWindow: 200_000 },
  },
  {
    id: "claude-fable-5",
    label: "Claude Fable 5",
    provider: "anthropic",
    capabilities: { vision: true, tools: true, reasoning: false, contextWindow: 200_000 },
  },
  // OpenAI
  {
    id: "gpt-5.5",
    label: "GPT-5.5",
    provider: "openai",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 400_000 },
  },
  {
    id: "gpt-5.1",
    label: "GPT-5.1",
    provider: "openai",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 400_000 },
  },
  // Google Gemini
  {
    id: "gemini-3.5-pro",
    label: "Gemini 3.5 Pro",
    provider: "gemini",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_000_000 },
  },
  {
    id: "gemini-3.5-flash",
    label: "Gemini 3.5 Flash",
    provider: "gemini",
    capabilities: { vision: true, tools: true, reasoning: false, contextWindow: 1_000_000 },
  },
  {
    id: "gemini-2.5-pro",
    label: "Gemini 2.5 Pro",
    provider: "gemini",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_000_000 },
  },
  {
    id: "gemini-2.5-flash",
    label: "Gemini 2.5 Flash",
    provider: "gemini",
    capabilities: { vision: true, tools: true, reasoning: false, contextWindow: 1_000_000 },
  },
];

export const DEFAULT_MODEL = "claude-sonnet-4-6";

// ---- OpenRouter live catalog (search-everything escape hatch) ----

type RawOpenRouterModel = {
  id: string;
  name?: string;
  description?: string;
  context_length?: number;
  pricing?: { prompt?: string; completion?: string };
  architecture?: { input_modalities?: string[] };
  supported_parameters?: string[];
};

// The full list is hundreds of models and rarely changes — fetch once, cache in
// memory, and filter per query. Avoids hammering OpenRouter on every keystroke.
const OR_MODELS_URL = "https://openrouter.ai/api/v1/models";
const OR_CACHE_TTL_MS = 60 * 60 * 1000;
let orCache: { at: number; models: RawOpenRouterModel[] } | null = null;

async function loadOpenRouterModels(): Promise<RawOpenRouterModel[]> {
  if (orCache && Date.now() - orCache.at < OR_CACHE_TTL_MS) return orCache.models;
  const res = await fetchWithTimeout(OR_MODELS_URL, { timeoutMs: 30_000 });
  if (!res.ok) throw new Error(`OpenRouter models ${res.status}`);
  const json = (await res.json()) as { data?: RawOpenRouterModel[] };
  orCache = { at: Date.now(), models: json.data ?? [] };
  return orCache.models;
}

/**
 * Search the live OpenRouter catalog by id/name substring. Empty query returns
 * the head of the list. Capped so the dialog stays snappy.
 */
export async function searchOpenRouterModels(
  query: string,
  limit = 30
): Promise<OpenRouterModel[]> {
  const all = await loadOpenRouterModels();
  const q = query.trim().toLowerCase();
  const matched = q
    ? all.filter((m) => m.id.toLowerCase().includes(q) || (m.name ?? "").toLowerCase().includes(q))
    : all;
  return matched.slice(0, limit).map((m) => ({
    id: m.id,
    name: m.name ?? m.id,
    description: m.description ?? "",
    contextLength: m.context_length ?? 0,
    promptPrice: Number(m.pricing?.prompt ?? 0) * 1_000_000,
    completionPrice: Number(m.pricing?.completion ?? 0) * 1_000_000,
    vision: (m.architecture?.input_modalities ?? []).includes("image"),
    tools: (m.supported_parameters ?? []).includes("tools"),
  }));
}

/** Which provider serves a model id — by catalog, then by sensible prefix. */
export function providerForModel(modelId: string): LlmProvider {
  const known = LLM_MODELS.find((m) => m.id === modelId);
  if (known) return known.provider;
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gemini")) return "gemini";
  return "openai";
}

/**
 * Pick the key for a provider: the user's own key wins, the server env key is
 * the fallback. `source` lets the UI show where the active key came from.
 */
export async function resolveLlmKey(
  userId: string,
  provider: LlmProvider
): Promise<{ key: string | null; source: "user" | "env" | null }> {
  const userKey = await getUserApiKey(userId, provider);
  if (userKey) return { key: userKey, source: "user" };
  const envKey = getEnv(PROVIDERS[provider].envKey);
  if (envKey) return { key: envKey, source: "env" };
  return { key: null, source: null };
}

// ---- Normalized message + tool model ----

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

// How hard the model should think before answering. Undefined means "Instant"
// (no extended thinking). Only reasoning-capable models honor it.
export type ReasoningEffort = "low" | "medium" | "high";

export type ChatMessage =
  | { role: "user"; content: string }
  // `reasoning` carries provider-opaque thinking blocks (Anthropic) that must be
  // replayed verbatim on later turns when extended thinking + tools are combined.
  | { role: "assistant"; content: string; toolCalls?: ToolCall[]; reasoning?: unknown[] }
  | { role: "tool"; toolCallId: string; content: string; isError?: boolean };

export type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };

export type CompleteRequest = {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
  reasoning?: ReasoningEffort;
  // Sampling temperature. Omit for the model default; set 0 for deterministic
  // extraction. Ignored on reasoning turns that reject a non-default temperature.
  temperature?: number;
  // When set, force the model to return JSON matching this schema (structured
  // output) instead of free text. Used by tabular extraction.
  jsonSchema?: Record<string, unknown>;
  // Cache the static prefix (system + tools) so the multi-turn tool loop doesn't
  // re-pay for it each iteration. Providers that cache implicitly ignore it.
  cache?: boolean;
  // Stable per-conversation key that lets OpenAI route to the same prompt cache.
  cacheKey?: string;
};

export type CompleteResult = {
  text: string;
  toolCalls: ToolCall[];
  stop: "end" | "tool_use";
  reasoning?: unknown[];
};

// Live callbacks for streaming. onText fires per answer-token delta; onReasoning
// per thinking-token delta (only providers that expose it). Both optional.
export type StreamHandlers = {
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
};

export interface LlmClient {
  complete(req: CompleteRequest): Promise<CompleteResult>;
  // Optional native streaming. Clients without it fall back to complete() via
  // streamComplete(), which emits the whole answer as one delta.
  stream?(req: CompleteRequest, handlers: StreamHandlers): Promise<CompleteResult>;
}

/**
 * Stream a turn through whichever path the client supports: native token
 * streaming when available, else a single buffered emit. Returns the same
 * CompleteResult either way, so the agent loop is identical for both.
 */
export async function streamComplete(
  client: LlmClient,
  req: CompleteRequest,
  handlers: StreamHandlers
): Promise<CompleteResult> {
  if (client.stream) return client.stream(req, handlers);
  const res = await client.complete(req);
  if (res.text) handlers.onText?.(res.text);
  return res;
}

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

// Per-effort token allowance reserved for reasoning, on top of the answer budget.
// Anthropic/Gemini spend it on thinking; OpenAI's Responses API counts reasoning
// tokens against max_output_tokens, so the same allowance keeps answers from being
// starved when reasoning is on.
const THINKING_BUDGET: Record<ReasoningEffort, number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
};

// Anthropic has no JSON mode — force a single-tool turn whose input *is* the
// schema, then read the tool input back as the structured result.
const ANTHROPIC_STRUCTURED_TOOL = "structured_response";

class AnthropicClient implements LlmClient {
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

    return {
      model: req.model,
      max_tokens: maxTokens,
      // A cache breakpoint on the system block caches the shared instructions too.
      system:
        req.cache && req.system
          ? [{ type: "text", text: req.system, cache_control: { type: "ephemeral" } }]
          : req.system,
      messages: toAnthropicMessages(req.messages),
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
    return this.finalize(req, res.content, res.stop_reason);
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
    return this.finalize(req, msg.content, msg.stop_reason);
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

// ---- OpenAI Responses API ↔ normalized ----

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

class OpenAIResponsesClient implements LlmClient {
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

  private finalize(res: OpenAI.Responses.Response): CompleteResult {
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
    };
  }

  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const openai = new OpenAI({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { timeout: llmTimeoutMs() } : {}),
    });
    return this.finalize(await openai.responses.create(this.buildParams(req)));
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
    const res = this.finalize(await s.finalResponse());
    return res.text ? res : { ...res, text: acc };
  }
}

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

class GeminiClient implements LlmClient {
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
    return this.finalize(res.candidates?.[0]?.content?.parts ?? []);
  }

  async stream(req: CompleteRequest, handlers: StreamHandlers): Promise<CompleteResult> {
    const ai = new GoogleGenAI({
      apiKey: this.apiKey,
      ...(llmTimeoutMs() ? { httpOptions: { timeout: llmTimeoutMs() } } : {}),
    });
    const gen = await ai.models.generateContentStream(this.buildRequest(req));
    const parts: Part[] = [];
    for await (const chunk of gen) {
      for (const p of chunk.candidates?.[0]?.content?.parts ?? []) {
        if (p.text) (p.thought ? handlers.onReasoning : handlers.onText)?.(p.text);
        parts.push(p);
      }
    }
    return this.finalize(parts);
  }
}

function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

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

class OpenRouterClient implements LlmClient {
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
    }

    const toolCalls = [...acc.values()]
      .filter((t) => t.name)
      .map((t) => ({ id: t.id ?? t.name!, name: t.name!, input: safeParse(t.args) }));
    return {
      text,
      toolCalls,
      stop: finishReason === "tool_calls" || toolCalls.length ? "tool_use" : "end",
    };
  }
}

/** Build a client for a provider with an explicit key. */
export function getLlmClient(provider: LlmProvider, apiKey: string): LlmClient {
  switch (provider) {
    case "anthropic":
      return new AnthropicClient(apiKey);
    case "openai":
      return new OpenAIResponsesClient(apiKey);
    case "gemini":
      return new GeminiClient(apiKey);
    case "openrouter":
      return new OpenRouterClient(apiKey);
  }
}

// ---- Boot-time env probe ----

// Which providers the server can serve from its own env keys. Computed once at
// boot by probeEnvProviders() and read by the /api/models endpoint to mark
// models whose provider has no key as unavailable.
let envProbe: Record<LlmProvider, boolean> | null = null;

/**
 * Try to build a client from each provider's env key. A missing key (or a key
 * the SDK rejects on construction) leaves that provider unavailable. Runs once
 * at boot; result cached. This is a presence check — it does not call the API.
 */
export function probeEnvProviders(): Record<LlmProvider, boolean> {
  const out = {} as Record<LlmProvider, boolean>;
  for (const provider of Object.keys(PROVIDERS) as LlmProvider[]) {
    const key = getEnv(PROVIDERS[provider].envKey);
    if (!key) {
      out[provider] = false;
      continue;
    }
    try {
      getLlmClient(provider, key);
      out[provider] = true;
    } catch {
      out[provider] = false;
    }
  }
  envProbe = out;
  return out;
}

/** Cached env probe; probes lazily on first read if boot never ran it. */
export function envProviderStatus(): Record<LlmProvider, boolean> {
  return envProbe ?? probeEnvProviders();
}

// ---- Model catalog contract (client <-> server) ----

/**
 * The full model catalog for a user: every provider grouped with its models,
 * availability, and key source. OpenRouter carries no models (it's searched live
 * via searchOpenRouterModels) but is still included so the picker knows whether an
 * OpenRouter key exists and can grey out OpenRouter results when it doesn't.
 */
export async function buildModelCatalog(userId: string): Promise<ProviderCatalog[]> {
  const providers = Object.keys(PROVIDERS) as LlmProvider[];
  return Promise.all(
    providers.map(async (provider) => {
      const { source } = await resolveLlmKey(userId, provider);
      return {
        provider,
        label: PROVIDER_LABELS[provider],
        available: source !== null,
        source,
        models: LLM_MODELS.filter((m) => m.provider === provider),
      };
    })
  );
}

/**
 * Single-shot text completion across any provider — used by tabular extraction.
 * Resolves the provider from the model, the key from explicit > env.
 */
export async function completeText(params: {
  model?: string;
  systemPrompt?: string;
  user: string;
  maxTokens?: number;
  apiKey?: string | null;
  provider?: LlmProvider;
  temperature?: number;
  jsonSchema?: Record<string, unknown>;
  // Cache the (large, shared) system prefix — e.g. a document reused across many
  // per-column extractions. `cacheKey` routes OpenAI to the same prompt cache.
  cache?: boolean;
  cacheKey?: string;
}): Promise<string> {
  const model = params.model ?? DEFAULT_MODEL;
  const provider = params.provider ?? providerForModel(model);
  const key = params.apiKey ?? getEnv(PROVIDERS[provider].envKey);
  if (!key) throw new Error(`No API key for ${provider} (set one in account settings)`);
  const res = await getLlmClient(provider, key).complete({
    model,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.user }],
    maxTokens: params.maxTokens,
    temperature: params.temperature,
    jsonSchema: params.jsonSchema,
    cache: params.cache,
    cacheKey: params.cacheKey,
  });
  return res.text;
}
