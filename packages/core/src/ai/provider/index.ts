// Multi-provider LLM layer (outbound BYOK). Each provider speaks through its own
// first-party SDK on its current, non-deprecated API surface: Anthropic's Messages
// API, OpenAI's Responses API (/v1/responses — the legacy Chat Completions endpoint
// rejects reasoning_effort + function tools on gpt-5.x), Google's @google/genai, and
// OpenRouter's @openrouter/sdk. One normalized message/tool model flows through all
// four adapters so chat and tabular extraction never branch on the provider.
//
// Split by responsibility: types.ts (normalized model), shared.ts (streaming +
// shared helpers), catalog.ts (model registry + OpenRouter live search), keys.ts
// (key/model resolution + availability), adapters/* (per-provider translation),
// factory.ts (client construction), complete.ts (single-shot completion).

export * from "./types.js";
export { streamComplete } from "./shared.js";
export * from "./catalog.js";
export * from "./cache.js";
export * from "./keys.js";
export { getLlmClient } from "./factory.js";
export { completeText } from "./complete.js";

// Per-provider message converters (the client classes stay module-private; build
// one via getLlmClient instead).
export { toAnthropicMessages } from "./adapters/anthropic.js";
export { toResponsesInput } from "./adapters/openai.js";
export { toGeminiContents } from "./adapters/gemini.js";
export { toOpenRouterMessages } from "./adapters/openrouter.js";
