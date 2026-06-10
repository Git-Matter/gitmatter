import { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";
import { api, type MatterListItem } from "./api";

type MattersContext = {
  matters: MatterListItem[];
  current: MatterListItem | null;
  setCurrent: (matterId: string) => void;
  refresh: () => void;
};

const Ctx = createContext<MattersContext | null>(null);
const STORAGE_KEY = "workingMatter";

/**
 * Tracks the firm's matters and which one is "current" — the working matter new
 * artifacts (reviews, contracts, documents) are filed under. The choice is
 * remembered in localStorage. Read lists stay firm-wide for now.
 */
export function MattersProvider({ children }: { children: React.ReactNode }) {
  const [matters, setMatters] = useState<MatterListItem[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(null);

  const refresh = useCallback(() => {
    api
      .listMatters()
      .then(setMatters)
      .catch(() => {});
  }, []);

  useEffect(() => {
    refresh();
    setCurrentId(typeof window !== "undefined" ? localStorage.getItem(STORAGE_KEY) : null);
  }, [refresh]);

  const setCurrent = useCallback((matterId: string) => {
    setCurrentId(matterId);
    localStorage.setItem(STORAGE_KEY, matterId);
  }, []);

  const current = useMemo(() => {
    if (!matters.length) return null;
    return matters.find((m) => m.matter.id === currentId) ?? matters[0]!;
  }, [matters, currentId]);

  const value = useMemo(
    () => ({ matters, current, setCurrent, refresh }),
    [matters, current, setCurrent, refresh]
  );
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMatters() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useMatters must be used within MattersProvider");
  return ctx;
}

/** The current working matter's id, for filing new artifacts. */
export function useWorkingMatterId() {
  return useMatters().current?.matter.id;
}
