import type { LlmProvider } from "@workspace/contracts";
import { getEnv } from "../../core/config.js";
import { DEFAULT_MODEL, PROVIDERS, providerForModel } from "./catalog.js";
import { getLlmClient } from "./factory.js";

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
  // Reports the provider's token usage after the call so callers can meter it
  // (best-effort: some providers omit usage; never blocks the completion).
  onUsage?: (u: {
    provider: LlmProvider;
    model: string;
    inputTokens: number;
    outputTokens: number;
  }) => void;
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
  if (res.usage && params.onUsage)
    params.onUsage({
      provider,
      model,
      inputTokens: res.usage.inputTokens,
      outputTokens: res.usage.outputTokens,
    });
  return res.text;
}
