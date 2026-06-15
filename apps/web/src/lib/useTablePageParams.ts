import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useDebouncedValue } from "./useDebouncedValue";

export type TablePageParams = {
  q: string;
  page: number;
  pageSize: number;
  sort?: string;
  dir: "asc" | "desc";
};

export function useTablePageParams({
  query,
  sorting,
  pagination,
  setPagination,
  extraDeps = [],
  extraParams = {},
}: {
  query: string;
  sorting: SortingState;
  pagination: PaginationState;
  setPagination: Dispatch<SetStateAction<PaginationState>>;
  extraDeps?: readonly unknown[];
  extraParams?: Record<string, string | undefined>;
}): TablePageParams {
  const search = useDebouncedValue(query, 300);
  const sort = sorting[0];

  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [search, sort?.desc, sort?.id, setPagination, ...extraDeps]);

  return {
    q: search,
    ...extraParams,
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
    sort: sort?.id,
    dir: sort?.desc ? "desc" : "asc",
  } as TablePageParams;
}
