import type { LlmProvider } from "@workspace/contracts";

export type CacheMode = "automatic" | "explicit" | "gateway" | "none";

export type CacheCapability = {
  mode: CacheMode;
  minTokens: number | null;
  supportsBreakpoints: boolean;
  ttlOptions: string[];
  usageFields: string[];
};

const CAPABILITIES: Record<LlmProvider, CacheCapability> = {
  openai: {
    mode: "automatic",
    minTokens: 1024,
    supportsBreakpoints: false,
    ttlOptions: [],
    usageFields: ["cachedInputTokens"],
  },
  anthropic: {
    mode: "explicit",
    minTokens: 1024,
    supportsBreakpoints: true,
    ttlOptions: ["5m"],
    usageFields: ["cacheReadTokens", "cacheWriteTokens"],
  },
  gemini: {
    mode: "automatic",
    minTokens: 1024,
    supportsBreakpoints: false,
    ttlOptions: [],
    usageFields: ["cachedInputTokens"],
  },
  openrouter: {
    mode: "gateway",
    minTokens: null,
    supportsBreakpoints: true,
    ttlOptions: ["provider-dependent"],
    usageFields: ["cachedInputTokens", "cacheReadTokens", "cacheWriteTokens"],
  },
};

export function cacheCapability(provider: LlmProvider): CacheCapability {
  return (
    CAPABILITIES[provider] ?? {
      mode: "none",
      minTokens: null,
      supportsBreakpoints: false,
      ttlOptions: [],
      usageFields: [],
    }
  );
}
