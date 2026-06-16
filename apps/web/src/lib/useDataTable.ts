import { useState } from "react";
import {
  getCoreRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type OnChangeFn,
  type PaginationState,
  type RowSelectionState,
  type SortingState,
} from "@tanstack/react-table";
import { useColumnSizing } from "./useColumnSizing";

// The single source of truth for how every list table is wired. Bakes in row
// selection, column-resize persistence, and the page-size/row-model defaults so
// routes stop hand-rolling (and drifting) their own useReactTable config.
//
// "server" mode (the default, used by all current lists): manual pagination /
// sorting / filtering — the route owns `sorting` + `pagination` because its
// query keys depend on them, and passes them in controlled. "client" mode keeps
// that state internally and adds the sorted/paginated row models; kept for any
// future table whose data is fully loaded.
type UseDataTableOptions<T> = {
  columns: ColumnDef<T, any>[];
  data: T[];
  sizingKey: string;
  getRowId: (row: T) => string;
  mode?: "server" | "client";
  enableSorting?: boolean;
  rowSelection?: RowSelectionState;
  onRowSelectionChange?: OnChangeFn<RowSelectionState>;
  // server mode (controlled — route owns these for its query keys)
  rowCount?: number;
  sorting?: SortingState;
  onSortingChange?: OnChangeFn<SortingState>;
  pagination?: PaginationState;
  onPaginationChange?: OnChangeFn<PaginationState>;
  // client mode defaults
  paginated?: boolean;
  defaultSorting?: SortingState;
  defaultPageSize?: number;
};

export function useDataTable<T>(opts: UseDataTableOptions<T>) {
  const server = (opts.mode ?? "server") === "server";
  const enableSorting = opts.enableSorting ?? true;
  const paginated = server ? true : (opts.paginated ?? true);

  const { columnSizing, onColumnSizingChange } = useColumnSizing(opts.sizingKey);

  // Uncontrolled fallbacks for client-mode tables. Always declared (hooks can't
  // be conditional); ignored when the caller passes controlled state.
  const [innerSorting, setInnerSorting] = useState<SortingState>(opts.defaultSorting ?? []);
  const [innerPagination, setInnerPagination] = useState<PaginationState>({
    pageIndex: 0,
    pageSize: opts.defaultPageSize ?? 50,
  });
  const [innerSelection, setInnerSelection] = useState<RowSelectionState>({});

  const sorting = opts.sorting ?? innerSorting;
  const pagination = opts.pagination ?? innerPagination;
  const rowSelection = opts.rowSelection ?? innerSelection;

  const table = useReactTable<T>({
    data: opts.data,
    columns: opts.columns,
    getRowId: opts.getRowId,
    rowCount: server ? opts.rowCount : undefined,
    state: { sorting, pagination, rowSelection, columnSizing },
    onSortingChange: opts.onSortingChange ?? setInnerSorting,
    onPaginationChange: opts.onPaginationChange ?? setInnerPagination,
    onRowSelectionChange: opts.onRowSelectionChange ?? setInnerSelection,
    onColumnSizingChange,
    enableRowSelection: true,
    enableSorting,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    manualFiltering: server,
    manualPagination: server,
    manualSorting: server,
    // Routes reset the page index themselves (useTablePageParams) on filter
    // change, so don't also reset on every data reference change.
    autoResetPageIndex: false,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: server || !enableSorting ? undefined : getSortedRowModel(),
    getPaginationRowModel: server || !paginated ? undefined : getPaginationRowModel(),
  });

  return { table };
}
