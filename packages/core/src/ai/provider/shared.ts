import { getEnv } from "../../core/config.js";
import type {
  CompleteRequest,
  CompleteResult,
  LlmClient,
  ReasoningEffort,
  StreamHandlers,
} from "./types.js";
import { withProviderSpend, type ProviderCallContext } from "./spend.js";

// Every admitted provider call has a finite timeout. Ambiguous timeouts retain
// the spend reservation; SDK retries are disabled by the shared admission path.
export function llmTimeoutMs(): number | undefined {
  const v = Number(getEnv("LLM_TIMEOUT_MS"));
  return Number.isFinite(v) && v > 0 ? Math.min(v, 600_000) : 120_000;
}

// Per-effort token allowance reserved for reasoning, on top of the answer budget.
// Anthropic/Gemini spend it on thinking; OpenAI's Responses API counts reasoning
// tokens against max_output_tokens, so the same allowance keeps answers from being
// starved when reasoning is on.
export const THINKING_BUDGET: Record<ReasoningEffort, number> = {
  low: 2048,
  medium: 8192,
  high: 16384,
};

export function safeParse(s: string): Record<string, unknown> {
  try {
    return JSON.parse(s || "{}") as Record<string, unknown>;
  } catch {
    return {};
  }
}

export function tryJson(s: string): unknown {
  try {
    return JSON.parse(s);
  } catch {
    return s;
  }
}

/**
 * Stream a turn through whichever path the client supports: native token
 * streaming when available, else a single buffered emit. Returns the same
 * CompleteResult either way, so the agent loop is identical for both.
 */
export async function streamComplete(
  client: LlmClient,
  req: CompleteRequest,
  handlers: StreamHandlers,
  context?: ProviderCallContext
): Promise<CompleteResult> {
  return withProviderSpend(context, req, async (protectedRequest) => {
    if (client.stream) return client.stream(protectedRequest, handlers);
    const res = await client.complete(protectedRequest);
    if (res.text) handlers.onText?.(res.text);
    return res;
  });
}
