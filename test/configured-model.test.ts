import { expect, test } from "vite-plus/test";
import type { ProviderCatalog } from "../packages/contracts/src/index";
import { configuredModelAvailable } from "../apps/web/src/lib/data/configured-model";

test("configured model eligibility rejects missing/stale providers and distinguishes explicit OpenRouter choices from hints", () => {
  const providers: ProviderCatalog[] = [
    {
      provider: "anthropic",
      label: "Fictional provider",
      available: true,
      source: "user",
      models: [
        {
          id: "fixture-model",
          label: "Fictional model",
          provider: "anthropic",
          capabilities: { tools: true, vision: false, reasoning: true, contextWindow: 200000 },
        },
      ],
    },
    {
      provider: "openrouter",
      label: "Fictional router",
      available: true,
      source: "user",
      models: [],
    },
  ];
  expect(configuredModelAvailable("", providers)).toBe(false);
  expect(configuredModelAvailable("fixture-model", providers)).toBe(true);
  expect(configuredModelAvailable("fixture-model", [{ ...providers[0], available: false }])).toBe(
    false
  );
  expect(configuredModelAvailable("missing-model", providers)).toBe(false);
  expect(configuredModelAvailable("vendor/model", providers)).toBe(true);
  expect(configuredModelAvailable("vendor/model", providers, false)).toBe(false);
  expect(configuredModelAvailable("vendor/model", [{ ...providers[1], available: false }])).toBe(
    false
  );
  expect(configuredModelAvailable("a".repeat(201), providers)).toBe(false);
});
