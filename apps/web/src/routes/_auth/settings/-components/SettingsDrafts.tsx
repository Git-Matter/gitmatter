import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useState,
  type ReactNode,
} from "react";
import { UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";

type DraftState = { dirty: boolean; saving: boolean };
type RegisterDraft = (id: string, state: DraftState | null) => void;
const SettingsDraftContext = createContext<RegisterDraft | null>(null);

/** One exit decision covers drafts across all retained settings panels. No field values are stored. */
export function SettingsDrafts({ children }: { children: ReactNode }) {
  const [drafts, setDrafts] = useState<Record<string, DraftState>>({});
  const register = useCallback<RegisterDraft>((id, state) => {
    setDrafts((previous) => {
      const next = { ...previous };
      if (state) next[id] = state;
      else delete next[id];
      return next;
    });
  }, []);
  const states = Object.values(drafts);
  const dirty = states.some((state) => state.dirty || state.saving);
  const saving = states.some((state) => state.saving);
  return (
    <SettingsDraftContext.Provider value={register}>
      <UnsavedNavigationGuard
        isDirty={() => dirty}
        saving={saving}
        allowSearchNavigation
        description="Unfinished settings are kept while you switch sections. Leaving this page discards them."
      />
      {children}
    </SettingsDraftContext.Provider>
  );
}

export function useSettingsDraft(dirty: boolean, saving = false) {
  const register = useContext(SettingsDraftContext);
  const id = useId();
  useEffect(() => {
    register?.(id, { dirty, saving });
    return () => register?.(id, null);
  }, [register, id, dirty, saving]);
}
