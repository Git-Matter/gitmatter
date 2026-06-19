import { useEffect, useState } from "react";
import type { ReasoningEffort } from "../../data/api";

// Remembers the user's model choice across chat and review runs. Empty string
// means "no choice yet" — callers send `model || undefined` so the server picks.
const STORAGE_KEY = "gitmatter.model";

export function useSelectedModel() {
  // Start empty so SSR and first client render agree; hydrate from localStorage
  // after mount. `hydrated` gates the persisting effect so we don't clear storage
  // before the stored value is loaded.
  const [model, setModel] = useState<string>("");
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    setModel(localStorage.getItem(STORAGE_KEY) ?? "");
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (model) localStorage.setItem(STORAGE_KEY, model);
    else localStorage.removeItem(STORAGE_KEY);
  }, [model, hydrated]);

  return [model, setModel] as const;
}

// Remembers the thinking level. null = "Instant" (no extended thinking).
const REASONING_KEY = "gitmatter.reasoning";
const REASONING_VALUES: ReasoningEffort[] = ["low", "medium", "high"];

export function useSelectedReasoning() {
  const [reasoning, setReasoning] = useState<ReasoningEffort | null>(null);
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const v = localStorage.getItem(REASONING_KEY);
    setReasoning(
      v && REASONING_VALUES.includes(v as ReasoningEffort) ? (v as ReasoningEffort) : null
    );
    setHydrated(true);
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (reasoning) localStorage.setItem(REASONING_KEY, reasoning);
    else localStorage.removeItem(REASONING_KEY);
  }, [reasoning, hydrated]);

  return [reasoning, setReasoning] as const;
}
