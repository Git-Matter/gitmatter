import Anthropic from "@anthropic-ai/sdk";

// Latest Claude models (see claude-api guidance).
export const MODELS = {
  opus: "claude-opus-4-8",
  sonnet: "claude-sonnet-4-6",
  haiku: "claude-haiku-4-5-20251001",
} as const;

export const DEFAULT_MODEL = MODELS.sonnet;

function client(apiKey?: string | null): Anthropic {
  const key = apiKey ?? process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error("No Anthropic API key (set one in account settings)");
  return new Anthropic({ apiKey: key });
}

export async function completeClaudeText(params: {
  model?: string;
  systemPrompt?: string;
  user: string;
  maxTokens?: number;
  apiKey?: string | null;
}): Promise<string> {
  const anthropic = client(params.apiKey);
  const resp = await anthropic.messages.create({
    model: params.model ?? DEFAULT_MODEL,
    max_tokens: params.maxTokens ?? 1024,
    system: params.systemPrompt,
    messages: [{ role: "user", content: params.user }],
  });
  return resp.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
}
