import { useEffect, useRef } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { PaginationState, SortingState } from "@tanstack/react-table";
import { useDebouncedValue } from "../state/useDebouncedValue";

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
  const search = useDebouncedValue(query.trim(), 300);
  const sort = sorting[0];

  const identity = JSON.stringify([search, sort?.desc, sort?.id, ...extraDeps]);
  const previous = useRef(identity);
  useEffect(() => {
    if (previous.current === identity) return;
    previous.current = identity;
    setPagination((current) => ({ ...current, pageIndex: 0 }));
  }, [identity, setPagination]);

  return {
    q: search,
    ...extraParams,
    page: previous.current !== identity ? 0 : pagination.pageIndex,
    pageSize: pagination.pageSize,
    sort: sort?.id,
    dir: sort?.desc ? "desc" : "asc",
  } as TablePageParams;
}
