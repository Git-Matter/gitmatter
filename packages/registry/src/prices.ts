// Indicative USD prices per million tokens, matched by model-id prefix.
// Used to estimate a matter's LLM spend at READ time (never stored), so
// updating a price here reprices history. Longest prefix wins. Models not
// listed (e.g. arbitrary OpenRouter ids) estimate as null — the UI shows
// tokens without a dollar figure rather than a wrong one.

export type ModelPrice = {
  /** Model-id prefix this price applies to. */
  prefix: string;
  /** USD per 1M input tokens. */
  inputPerMTok: number;
  /** USD per 1M output tokens. */
  outputPerMTok: number;
};

export const MODEL_PRICES: ModelPrice[] = [
  // Anthropic
  { prefix: "claude-opus-4", inputPerMTok: 15, outputPerMTok: 75 },
  { prefix: "claude-sonnet-4", inputPerMTok: 3, outputPerMTok: 15 },
  { prefix: "claude-sonnet-5", inputPerMTok: 3, outputPerMTok: 15 },
  { prefix: "claude-haiku-4", inputPerMTok: 1, outputPerMTok: 5 },
  { prefix: "claude-3-5-haiku", inputPerMTok: 0.8, outputPerMTok: 4 },
  // OpenAI
  { prefix: "gpt-5", inputPerMTok: 1.25, outputPerMTok: 10 },
  { prefix: "gpt-5-mini", inputPerMTok: 0.25, outputPerMTok: 2 },
  { prefix: "gpt-4o", inputPerMTok: 2.5, outputPerMTok: 10 },
  { prefix: "gpt-4.1", inputPerMTok: 2, outputPerMTok: 8 },
  // Google
  { prefix: "gemini-2.5-pro", inputPerMTok: 1.25, outputPerMTok: 10 },
  { prefix: "gemini-2.5-flash", inputPerMTok: 0.3, outputPerMTok: 2.5 },
];

/** The price entry for a model id, longest matching prefix, or null. */
export function priceForModel(model: string): ModelPrice | null {
  let best: ModelPrice | null = null;
  for (const p of MODEL_PRICES) {
    if (model.startsWith(p.prefix) && (!best || p.prefix.length > best.prefix.length)) best = p;
  }
  return best;
}

/** Estimated USD cost of a completion, or null when the model is unpriced. */
export function estimateCostUsd(
  model: string,
  inputTokens: number,
  outputTokens: number
): number | null {
  const price = priceForModel(model);
  if (!price) return null;
  return (inputTokens * price.inputPerMTok + outputTokens * price.outputPerMTok) / 1_000_000;
}
