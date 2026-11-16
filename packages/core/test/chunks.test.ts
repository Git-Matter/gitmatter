import { describe, expect, test } from "vite-plus/test";
import { cacheCapability } from "../src/ai/provider/cache.js";
import {
  choosePipeline,
  chunkMarkdown,
  estimateTokens,
  FULL_TEXT_TOKEN_LIMIT,
  CHUNK_PREFERRED_TOKEN_LIMIT,
} from "../src/content/chunks.js";

describe("document chunks", () => {
  test("splits PDFs by page markers before size", () => {
    const chunks = chunkMarkdown(
      "[Page 1]\n\nGoverning law: Delaware.\n\n[Page 2]\n\nLiability cap.",
      "pdf"
    );

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toMatchObject({ index: 0, pageStart: 1, pageEnd: 1, label: "Page 1" });
    expect(chunks[1]).toMatchObject({ index: 1, pageStart: 2, pageEnd: 2, label: "Page 2" });
    expect(chunks[0]!.text).toContain("Governing law");
  });

  test("uses headings as DOCX/text section labels", () => {
    const chunks = chunkMarkdown(
      [
        "# Master Services Agreement",
        "1. Confidentiality",
        "Keep data secret.",
        "2. Term",
        "Three years.",
      ].join("\n"),
      "docx"
    );

    expect(chunks.map((c) => c.label)).toContain("Master Services Agreement");
    expect(chunks.map((c) => c.label)).toContain("2. Term");
  });

  test("chooses cache, chunk, and hybrid pipelines from token thresholds", () => {
    expect(choosePipeline({ tokenEstimate: FULL_TEXT_TOKEN_LIMIT - 1 })).toBe("cache_first");
    expect(choosePipeline({ tokenEstimate: FULL_TEXT_TOKEN_LIMIT - 1, repeated: true })).toBe(
      "cache_first"
    );
    expect(choosePipeline({ tokenEstimate: CHUNK_PREFERRED_TOKEN_LIMIT + 1 })).toBe("chunk_first");
    expect(choosePipeline({ tokenEstimate: CHUNK_PREFERRED_TOKEN_LIMIT + 1, repeated: true })).toBe(
      "hybrid"
    );
  });

  test("estimates tokens monotonically", () => {
    expect(estimateTokens("short text")).toBeLessThan(estimateTokens("short text ".repeat(100)));
  });
});

describe("provider cache capabilities", () => {
  test("keeps cache behavior provider-specific", () => {
    expect(cacheCapability("openai").mode).toBe("automatic");
    expect(cacheCapability("anthropic").supportsBreakpoints).toBe(true);
    expect(cacheCapability("openrouter").mode).toBe("gateway");
  });
});
