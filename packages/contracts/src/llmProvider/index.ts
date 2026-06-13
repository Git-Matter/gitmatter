// AI provider & model contracts shared between the browser client
// (apps/web/src/lib/api.ts) and the server (packages/core). Types only.

export type LlmProvider = "anthropic" | "openai" | "gemini" | "openrouter";

// What a model can do — surfaced in the model picker.
export type ModelCapabilities = {
  // Accepts image input (scanned contracts, screenshots).
  vision: boolean;
  // Supports function/tool calling (required for the catalog tools).
  tools: boolean;
  // Extended-thinking / reasoning-class model.
  reasoning: boolean;
  // Max context window in tokens, for display.
  contextWindow: number;
};

// A curated native-key model.
export type LlmModel = {
  id: string;
  label: string;
  provider: LlmProvider;
  capabilities: ModelCapabilities;
};

// One native-key provider, its availability, and the models it serves. Returned
// by GET /api/models. The picker greys out a provider's models when `available`
// is false (no key found).
export type ProviderCatalog = {
  provider: LlmProvider;
  label: string;
  // A key resolves for this user (their own key, else the server env key).
  available: boolean;
  // Where the active key came from — drives the "using your key / server key" hint.
  source: "user" | "env" | null;
  models: LlmModel[];
};

// A live OpenRouter catalog result. Returned by GET /api/models/openrouter.
export type OpenRouterModel = {
  id: string;
  name: string;
  description: string;
  contextLength: number;
  // Dollars per 1M tokens. 0 means free / unpriced.
  promptPrice: number;
  completionPrice: number;
  vision: boolean;
  tools: boolean;
};

// Per-provider key status. Returned by GET /api/keys.
export type ProviderKeyStatus = {
  provider: LlmProvider;
  hasUserKey: boolean;
  source: "user" | "env" | null;
};
