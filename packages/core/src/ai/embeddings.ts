import { GoogleGenAI } from "@google/genai";
import OpenAI from "openai";
import type { LlmProvider } from "@workspace/contracts";
import { getEnv } from "../core/config.js";
import { llmTimeoutMs } from "./provider/shared.js";

// Voyage is an embedding-only provider (Anthropic's recommended embedder); it is
// not an LlmProvider (no chat completions), so it is added to the union directly.
// voyage-law-2 is legal-domain-tuned — the best retrieval quality for contracts.
export type EmbeddingProvider = Extract<LlmProvider, "openai" | "gemini"> | "voyage";

export type EmbeddingProfile = {
  provider: EmbeddingProvider;
  model: string;
  dimensions: number;
  source: "env";
};

export type ResolvedEmbeddingProfile = EmbeddingProfile & {
  key: string;
};

const DEFAULTS: Record<EmbeddingProvider, { envKey: string; model: string; dimensions: number }> = {
  openai: {
    envKey: "OPENAI_API_KEY",
    model: "text-embedding-3-small",
    dimensions: 1536,
  },
  gemini: {
    envKey: "GEMINI_API_KEY",
    model: "text-embedding-004",
    dimensions: 768,
  },
  voyage: {
    envKey: "VOYAGE_API_KEY",
    model: "voyage-law-2",
    dimensions: 1024,
  },
};

function normalizeProvider(value?: string): EmbeddingProvider | null {
  if (value === "openai" || value === "gemini" || value === "voyage") return value;
  return null;
}

function positiveInt(value?: string): number | null {
  if (!value) return null;
  const n = Number(value);
  return Number.isInteger(n) && n > 0 ? n : null;
}

function profileFor(provider: EmbeddingProvider): ResolvedEmbeddingProfile | null {
  const key = getEnv(DEFAULTS[provider].envKey)?.trim();
  if (!key) return null;
  return {
    provider,
    key,
    source: "env",
    model: getEnv("EMBEDDING_MODEL")?.trim() || DEFAULTS[provider].model,
    dimensions: positiveInt(getEnv("EMBEDDING_DIMENSIONS")) ?? DEFAULTS[provider].dimensions,
  };
}

/**
 * Resolve the deployment embedding profile. This deliberately uses env/deployment
 * keys only; shared tenant indexes should not be built with a random user's key.
 */
export function resolveEmbeddingProfile(): ResolvedEmbeddingProfile | null {
  const configured = normalizeProvider(getEnv("EMBEDDING_PROVIDER")?.trim());
  if (configured) return profileFor(configured);
  return profileFor("openai") ?? profileFor("gemini") ?? profileFor("voyage");
}

// `inputType` only affects Voyage, which asymmetrically embeds documents vs
// queries for better retrieval; OpenAI and Gemini ignore it. Chunk indexing
// passes "document" (the default); a search query passes "query".
export async function embedTexts(
  profile: ResolvedEmbeddingProfile,
  texts: string[],
  inputType: "document" | "query" = "document"
): Promise<{ vectors: number[][]; inputTokens?: number }> {
  const input = texts.map((text) => text.trim()).filter(Boolean);
  if (!input.length) return { vectors: [] };
  if (profile.provider === "voyage") {
    const timeout = llmTimeoutMs();
    const res = await fetch("https://api.voyageai.com/v1/embeddings", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        authorization: `Bearer ${profile.key}`,
      },
      body: JSON.stringify({
        input,
        model: profile.model,
        input_type: inputType,
        output_dimension: profile.dimensions,
      }),
      ...(timeout ? { signal: AbortSignal.timeout(timeout) } : {}),
    });
    if (!res.ok) {
      throw new Error(`voyage embeddings failed: ${res.status} ${await res.text()}`);
    }
    const json = (await res.json()) as {
      data: Array<{ embedding: number[]; index: number }>;
      usage?: { total_tokens?: number };
    };
    return {
      vectors: json.data.sort((a, b) => a.index - b.index).map((item) => item.embedding),
      inputTokens: json.usage?.total_tokens,
    };
  }
  if (profile.provider === "openai") {
    const openai = new OpenAI({
      apiKey: profile.key,
      ...(llmTimeoutMs() ? { timeout: llmTimeoutMs() } : {}),
    });
    const res = await openai.embeddings.create({
      model: profile.model,
      input,
      dimensions: profile.dimensions,
      encoding_format: "float",
    });
    return {
      vectors: res.data.sort((a, b) => a.index - b.index).map((item) => item.embedding as number[]),
      inputTokens: res.usage?.total_tokens,
    };
  }

  const ai = new GoogleGenAI({
    apiKey: profile.key,
    ...(llmTimeoutMs() ? { httpOptions: { timeout: llmTimeoutMs() } } : {}),
  });
  const res = await ai.models.embedContent({
    model: profile.model,
    contents: input,
    config: { outputDimensionality: profile.dimensions },
  });
  return {
    vectors: res.embeddings?.map((embedding) => embedding.values ?? []) ?? [],
  };
}
