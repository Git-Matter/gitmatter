import { afterEach, describe, expect, test } from "vite-plus/test";
import { resolveEmbeddingProfile } from "../src/ai/embeddings.js";

const ENV_KEYS = [
  "OPENAI_API_KEY",
  "GEMINI_API_KEY",
  "VOYAGE_API_KEY",
  "EMBEDDING_PROVIDER",
  "EMBEDDING_MODEL",
  "EMBEDDING_DIMENSIONS",
] as const;

const oldEnv = new Map<string, string | undefined>();

for (const key of ENV_KEYS) oldEnv.set(key, process.env[key]);

afterEach(() => {
  for (const key of ENV_KEYS) {
    const old = oldEnv.get(key);
    if (old === undefined) delete process.env[key];
    else process.env[key] = old;
  }
});

function clearEnv() {
  for (const key of ENV_KEYS) delete process.env[key];
}

describe("resolveEmbeddingProfile", () => {
  test("returns null when no deployment embedding key exists", () => {
    clearEnv();

    expect(resolveEmbeddingProfile()).toBeNull();
  });

  test("prefers OpenAI as the automatic low-cost default", () => {
    clearEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "gemini-test";

    expect(resolveEmbeddingProfile()).toMatchObject({
      provider: "openai",
      model: "text-embedding-3-small",
      dimensions: 1536,
      source: "env",
    });
  });

  test("honors an explicit Gemini profile", () => {
    clearEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.GEMINI_API_KEY = "gemini-test";
    process.env.EMBEDDING_PROVIDER = "gemini";
    process.env.EMBEDDING_MODEL = "text-embedding-004";
    process.env.EMBEDDING_DIMENSIONS = "256";

    expect(resolveEmbeddingProfile()).toMatchObject({
      provider: "gemini",
      model: "text-embedding-004",
      dimensions: 256,
    });
  });

  test("does not fall back when an explicit provider has no env key", () => {
    clearEnv();
    process.env.OPENAI_API_KEY = "sk-test";
    process.env.EMBEDDING_PROVIDER = "gemini";

    expect(resolveEmbeddingProfile()).toBeNull();
  });

  test("auto-selects Voyage (legal-tuned) when only VOYAGE_API_KEY exists", () => {
    clearEnv();
    process.env.VOYAGE_API_KEY = "voyage-test";

    expect(resolveEmbeddingProfile()).toMatchObject({
      provider: "voyage",
      model: "voyage-law-2",
      dimensions: 1024,
      source: "env",
    });
  });

  test("honors an explicit Voyage profile with a custom model", () => {
    clearEnv();
    process.env.VOYAGE_API_KEY = "voyage-test";
    process.env.EMBEDDING_PROVIDER = "voyage";
    process.env.EMBEDDING_MODEL = "voyage-4";
    process.env.EMBEDDING_DIMENSIONS = "512";

    expect(resolveEmbeddingProfile()).toMatchObject({
      provider: "voyage",
      model: "voyage-4",
      dimensions: 512,
    });
  });
});
