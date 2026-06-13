import { useEffect, useState } from "react";
import type { ReasoningEffort } from "./api";

// Remembers the user's model choice across chat and review runs. Empty string
// means "no choice yet" — callers send `model || undefined` so the server picks.
const STORAGE_KEY = "gitcounsel.model";

export function useSelectedModel() {
  const [model, setModel] = useState<string>(() => {
    if (typeof localStorage === "undefined") return "";
    return localStorage.getItem(STORAGE_KEY) ?? "";
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (model) localStorage.setItem(STORAGE_KEY, model);
    else localStorage.removeItem(STORAGE_KEY);
  }, [model]);

  return [model, setModel] as const;
}

// Remembers the thinking level. null = "Instant" (no extended thinking).
const REASONING_KEY = "gitcounsel.reasoning";
const REASONING_VALUES: ReasoningEffort[] = ["low", "medium", "high"];

export function useSelectedReasoning() {
  const [reasoning, setReasoning] = useState<ReasoningEffort | null>(() => {
    if (typeof localStorage === "undefined") return null;
    const v = localStorage.getItem(REASONING_KEY);
    return v && REASONING_VALUES.includes(v as ReasoningEffort) ? (v as ReasoningEffort) : null;
  });

  useEffect(() => {
    if (typeof localStorage === "undefined") return;
    if (reasoning) localStorage.setItem(REASONING_KEY, reasoning);
    else localStorage.removeItem(REASONING_KEY);
  }, [reasoning]);

  return [reasoning, setReasoning] as const;
}
