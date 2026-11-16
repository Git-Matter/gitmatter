import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useRef,
  useState,
  type Dispatch,
  type ReactNode,
  type SetStateAction,
} from "react";

const ViewMemory = createContext<Map<string, unknown> | null>(null);
/** View/search state is memory-only, and is discarded with the authenticated workspace. */
export function WorkspaceViewProvider({ scope, children }: { scope: string; children: ReactNode }) {
  const memory = useMemo(() => new Map<string, unknown>(), [scope]);
  return (
    <ViewMemory.Provider key={scope} value={memory}>
      {children}
    </ViewMemory.Provider>
  );
}
export function useWorkspaceViewMemory() {
  return useContext(ViewMemory);
}
export function useWorkspaceViewState<T>(
  key: string,
  initial: T
): [T, Dispatch<SetStateAction<T>>] {
  const memory = useWorkspaceViewMemory();
  const cached = () => (memory?.has(key) ? (memory.get(key) as T) : initial);
  const [entry, setEntry] = useState(() => ({ key, value: cached() }));
  const value = entry.key === key ? entry.value : cached();
  const current = useRef(value);
  current.current = value;
  const update = useCallback<Dispatch<SetStateAction<T>>>(
    (action) => {
      const next =
        typeof action === "function" ? (action as (previous: T) => T)(current.current) : action;
      current.current = next;
      memory?.set(key, next);
      setEntry({ key, value: next });
    },
    [key, memory]
  );
  return [value, update];
}
