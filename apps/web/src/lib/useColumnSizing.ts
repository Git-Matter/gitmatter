import { useState } from "react";
import type { ColumnSizingState, OnChangeFn } from "@tanstack/react-table";

// Persists a react-table's column widths to localStorage so a user's manual
// resize survives reloads. Pass a stable per-table key. Returns the sizing
// state and an onColumnSizingChange handler to spread into useReactTable.
export function useColumnSizing(key: string): {
  columnSizing: ColumnSizingState;
  onColumnSizingChange: OnChangeFn<ColumnSizingState>;
} {
  const storageKey = `table-col-sizing:${key}`;
  const [columnSizing, setColumnSizing] = useState<ColumnSizingState>(() => {
    try {
      const raw = localStorage.getItem(storageKey);
      return raw ? (JSON.parse(raw) as ColumnSizingState) : {};
    } catch {
      return {};
    }
  });

  const onColumnSizingChange: OnChangeFn<ColumnSizingState> = (updater) => {
    setColumnSizing((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      try {
        localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // ignore quota/availability errors; resizing still works in-session
      }
      return next;
    });
  };

  return { columnSizing, onColumnSizingChange };
}
