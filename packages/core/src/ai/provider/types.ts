import type {
  LlmModel,
  LlmProvider,
  ModelCapabilities,
  OpenRouterModel,
  ProviderCatalog,
} from "@workspace/contracts";
import type { CacheMode } from "./cache.js";

export type { LlmModel, LlmProvider, ModelCapabilities, OpenRouterModel, ProviderCatalog };

// ---- Normalized message + tool model ----
// One message/tool shape flows through every provider adapter, so chat and
// tabular extraction never branch on the provider.

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

export type UsageInfo = {
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens?: number;
  cacheWriteTokens?: number;
  cacheReadTokens?: number;
  cacheMode?: CacheMode;
  cacheKey?: string;
};

export type CompleteResult = {
  text: string;
  toolCalls: ToolCall[];
  stop: "end" | "tool_use";
  reasoning?: unknown[];
  // Token usage as reported by the provider, when it exposes it. Optional —
  // absent providers leave it undefined; metering treats that as zero.
  usage?: UsageInfo;
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
