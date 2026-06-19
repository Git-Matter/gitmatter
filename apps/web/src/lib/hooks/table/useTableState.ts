import { useEffect, useRef, useState } from "react";
import type { PaginationState, SortingState } from "@tanstack/react-table";

// Per-table sort + page-size memory, backed by localStorage.
//
// SSR-safe by the same recipe as usePersistentState (ChatNavPanel): start from
// the passed defaults so the server render and the first client render match
// (no hydration mismatch), then read the stored value in a mount effect and
// persist on change. `ready` flips true once that read has run — server tables
// gate their list query on it so the single fetch already carries the restored
// sort/pageSize instead of fetching the default first and refetching.
//
// Only sort + pageSize are remembered; pageIndex always resets to 0 on load.

type StoredState = { sorting?: SortingState; pageSize?: number };

export function useTableState(
  key: string,
  opts: { defaultSorting: SortingState; defaultPageSize?: number }
) {
  const storeKey = `gitmatter.table.${key}`;
  const [sorting, setSorting] = useState<SortingState>(opts.defaultSorting);
  const [pagination, setPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: opts.defaultPageSize ?? 50,
  });
  const [ready, setReady] = useState(false);
  const hydrated = useRef(false);

  useEffect(() => {
    const raw = localStorage.getItem(storeKey);
    if (raw) {
      try {
        const stored = JSON.parse(raw) as StoredState;
        if (stored.sorting) setSorting(stored.sorting);
        if (stored.pageSize)
          setPagination((cur) => ({ ...cur, pageSize: stored.pageSize as number }));
      } catch {
        // Corrupt value — ignore and fall back to defaults.
      }
    }
    hydrated.current = true;
    setReady(true);
  }, [storeKey]);

  useEffect(() => {
    if (!hydrated.current) return;
    const value: StoredState = { sorting, pageSize: pagination.pageSize };
    localStorage.setItem(storeKey, JSON.stringify(value));
  }, [storeKey, sorting, pagination.pageSize]);

  return { sorting, setSorting, pagination, setPagination, ready };
}
