import type { LlmModel, LlmProvider, OpenRouterModel } from "@workspace/contracts";
import { fetchWithTimeout } from "../../core/fetch.js";

// The static model registry plus OpenRouter's live "search everything" catalog.
// Each native-key provider has an env key and a display label; OpenRouter is
// searched live instead of hand-listed.

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
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_000_000 },
  },
  {
    id: "claude-sonnet-5",
    label: "Claude Sonnet 5",
    provider: "anthropic",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_000_000 },
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
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_000_000 },
  },
  // OpenAI
  {
    id: "gpt-5.6-sol",
    label: "GPT-5.6 Sol",
    provider: "openai",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_050_000 },
  },
  {
    id: "gpt-5.6-terra",
    label: "GPT-5.6 Terra",
    provider: "openai",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_050_000 },
  },
  {
    id: "gpt-5.6-luna",
    label: "GPT-5.6 Luna",
    provider: "openai",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_050_000 },
  },
  // Google Gemini
  {
    id: "gemini-3.1-pro-preview",
    label: "Gemini 3.1 Pro Preview",
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
    id: "gemini-3.1-flash-lite",
    label: "Gemini 3.1 Flash-Lite",
    provider: "gemini",
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_000_000 },
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
    capabilities: { vision: true, tools: true, reasoning: true, contextWindow: 1_000_000 },
  },
  {
    id: "gemini-2.5-flash-lite",
    label: "Gemini 2.5 Flash-Lite",
    provider: "gemini",
    capabilities: { vision: true, tools: true, reasoning: false, contextWindow: 1_000_000 },
  },
];

export const DEFAULT_MODEL = "claude-sonnet-5";

/** Which provider serves a model id — by catalog, then by sensible prefix. */
export function providerForModel(modelId: string): LlmProvider {
  const known = LLM_MODELS.find((m) => m.id === modelId);
  if (known) return known.provider;
  if (modelId.includes("/")) return "openrouter";
  if (modelId.startsWith("claude")) return "anthropic";
  if (modelId.startsWith("gemini")) return "gemini";
  return "openai";
}

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
