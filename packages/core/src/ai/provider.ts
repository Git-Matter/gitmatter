import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getUserApiKey } from "../core/keys.js";

// Multi-provider LLM layer (outbound BYOK). Two API shapes cover every provider:
// Anthropic's Messages API (native SDK) and OpenAI's Chat Completions API (the
// OpenAI SDK, pointed at OpenAI, Gemini's OpenAI-compatible endpoint, or
// OpenRouter). One normalized message/tool model flows through both adapters so
// chat and tabular extraction never branch on the provider.

export type LlmProvider = "anthropic" | "openai" | "gemini" | "openrouter";

type ProviderConfig = {
  envKey: string;
  kind: "anthropic" | "openai";
  baseURL?: string;
  // OpenRouter only routes to zero-retention endpoints when asked — our default.
  zdr?: boolean;
};

export const PROVIDERS: Record<LlmProvider, ProviderConfig> = {
  anthropic: { envKey: "ANTHROPIC_API_KEY", kind: "anthropic" },
  openai: { envKey: "OPENAI_API_KEY", kind: "openai" },
  gemini: {
    envKey: "GEMINI_API_KEY",
    kind: "openai",
    baseURL: "https://generativelanguage.googleapis.com/v1beta/openai/",
  },
  openrouter: {
    envKey: "OPENROUTER_API_KEY",
    kind: "openai",
    baseURL: "https://openrouter.ai/api/v1",
    zdr: true,
  },
};

export type LlmModel = { id: string; label: string; provider: LlmProvider };

// A small curated catalog. OpenRouter passes any "vendor/model" id through, so
// it's the escape hatch for anything not listed. Edit freely as models ship.
export const LLM_MODELS: LlmModel[] = [
  { id: "claude-sonnet-4-6", label: "Claude Sonnet 4.6", provider: "anthropic" },
  { id: "claude-opus-4-8", label: "Claude Opus 4.8", provider: "anthropic" },
  { id: "gpt-5.1", label: "GPT-5.1", provider: "openai" },
  { id: "gemini-2.5-pro", label: "Gemini 2.5 Pro", provider: "gemini" },
  { id: "gemini-2.5-flash", label: "Gemini 2.5 Flash", provider: "gemini" },
  { id: "openai/gpt-5.1", label: "GPT-5.1 (OpenRouter ZDR)", provider: "openrouter" },
];

export const DEFAULT_MODEL = "claude-sonnet-4-6";

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
  const envKey = process.env[PROVIDERS[provider].envKey];
  if (envKey) return { key: envKey, source: "env" };
  return { key: null, source: null };
}

// ---- Normalized message + tool model ----

export type ToolCall = { id: string; name: string; input: Record<string, unknown> };

export type ChatMessage =
  | { role: "user"; content: string }
  | { role: "assistant"; content: string; toolCalls?: ToolCall[] }
  | { role: "tool"; toolCallId: string; content: string; isError?: boolean };

export type ToolDef = { name: string; description: string; inputSchema: Record<string, unknown> };

export type CompleteRequest = {
  model: string;
  system?: string;
  messages: ChatMessage[];
  tools?: ToolDef[];
  maxTokens?: number;
};

export type CompleteResult = { text: string; toolCalls: ToolCall[]; stop: "end" | "tool_use" };

export interface LlmClient {
  complete(req: CompleteRequest): Promise<CompleteResult>;
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
      if (msg.content) content.push({ type: "text", text: msg.content });
      for (const tc of msg.toolCalls ?? [])
        content.push({ type: "tool_use", id: tc.id, name: tc.name, input: tc.input });
      out.push({ role: "assistant", content });
    }
  }
  flush();
  return out;
}

class AnthropicClient implements LlmClient {
  constructor(private readonly apiKey: string) {}
  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const anthropic = new Anthropic({ apiKey: this.apiKey });
    const res = await anthropic.messages.create({
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      system: req.system,
      messages: toAnthropicMessages(req.messages),
      tools: req.tools?.map((t) => ({
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      })),
    });
    const text = res.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    const toolCalls = res.content
      .filter((b): b is Anthropic.ToolUseBlock => b.type === "tool_use")
      .map((b) => ({ id: b.id, name: b.name, input: b.input as Record<string, unknown> }));
    return { text, toolCalls, stop: res.stop_reason === "tool_use" ? "tool_use" : "end" };
  }
}

// ---- OpenAI (and Gemini / OpenRouter via OpenAI-compatible) ↔ normalized ----

export function toOpenAIMessages(
  system: string | undefined,
  messages: ChatMessage[]
): OpenAI.Chat.ChatCompletionMessageParam[] {
  const out: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (system) out.push({ role: "system", content: system });
  for (const msg of messages) {
    if (msg.role === "user") out.push({ role: "user", content: msg.content });
    else if (msg.role === "tool")
      out.push({ role: "tool", tool_call_id: msg.toolCallId, content: msg.content });
    else
      out.push({
        role: "assistant",
        content: msg.content || null,
        tool_calls: msg.toolCalls?.length
          ? msg.toolCalls.map((tc) => ({
              id: tc.id,
              type: "function" as const,
              function: { name: tc.name, arguments: JSON.stringify(tc.input) },
            }))
          : undefined,
      });
  }
  return out;
}

class OpenAICompatClient implements LlmClient {
  constructor(
    private readonly apiKey: string,
    private readonly config: ProviderConfig
  ) {}
  async complete(req: CompleteRequest): Promise<CompleteResult> {
    const openai = new OpenAI({ apiKey: this.apiKey, baseURL: this.config.baseURL });
    const params: OpenAI.Chat.ChatCompletionCreateParamsNonStreaming = {
      model: req.model,
      max_tokens: req.maxTokens ?? 2048,
      messages: toOpenAIMessages(req.system, req.messages),
      tools: req.tools?.map((t) => ({
        type: "function",
        function: { name: t.name, description: t.description, parameters: t.inputSchema },
      })),
    };
    // Ask OpenRouter to route only to zero-retention endpoints.
    const body = this.config.zdr ? { ...params, provider: { data_collection: "deny" } } : params;
    const res = await openai.chat.completions.create(
      body as OpenAI.Chat.ChatCompletionCreateParamsNonStreaming
    );
    const choice = res.choices[0];
    const toolCalls = (choice?.message.tool_calls ?? [])
      .filter(
        (tc): tc is OpenAI.Chat.ChatCompletionMessageFunctionToolCall => tc.type === "function"
      )
      .map((tc) => ({
        id: tc.id,
        name: tc.function.name,
        input: safeParse(tc.function.arguments),
      }));
    return {
      text: choice?.message.content ?? "",
      toolCalls,
      stop: choice?.finish_reason === "tool_calls" ? "tool_use" : "end",
    };
  }
}

function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

/** Build a client for a provider with an explicit key. */
export function getLlmClient(provider: LlmProvider, apiKey: string): LlmClient {
  const config = PROVIDERS[provider];
  return config.kind === "anthropic"
    ? new AnthropicClient(apiKey)
    : new OpenAICompatClient(apiKey, config);
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
}): Promise<string> {
  const model = params.model ?? DEFAULT_MODEL;
  const provider = params.provider ?? providerForModel(model);
  const key = params.apiKey ?? process.env[PROVIDERS[provider].envKey];
  if (!key) throw new Error(`No API key for ${provider} (set one in account settings)`);
  const res = await getLlmClient(provider, key).complete({
    model,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.user }],
    maxTokens: params.maxTokens,
  });
  return res.text;
}
