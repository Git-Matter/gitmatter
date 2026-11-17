import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import type { Table } from "@tanstack/react-table";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight } from "lucide-react";
import { Button } from "@/components/ui/button";

type TablePagerProps<T> = {
  table: Table<T>;
  pageSizes?: number[];
};

export function TablePager<T>({ table, pageSizes = [25, 50, 100] }: TablePagerProps<T>) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const rowCount = table.getRowCount();
  const pageCount = table.getPageCount();
  const first = rowCount === 0 ? 0 : pageIndex * pageSize + 1;
  const last = Math.min(rowCount, (pageIndex + 1) * pageSize);

  return (
    <nav
      aria-label="Table pagination"
      className="flex min-h-11 shrink-0 flex-wrap items-center justify-between gap-2 border-t border-grid-line py-2 text-sm text-muted-foreground"
    >
      <div>
        {first}-{last} of {rowCount}
      </div>
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <NativeSelect
          value={pageSize}
          onChange={(e) => table.setPageSize(Number(e.target.value))}
          aria-label="Rows per page"
        >
          {pageSizes.map((size) => (
            <NativeSelectOption key={size} value={size}>
              {size} rows
            </NativeSelectOption>
          ))}
        </NativeSelect>
        <span>
          Page {pageCount === 0 ? 0 : pageIndex + 1} of {pageCount}
        </span>
        <div className="flex items-center gap-1">
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => table.setPageIndex(0)}
            disabled={!table.getCanPreviousPage()}
            tooltip="First page"
          >
            <ChevronsLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            tooltip="Previous page"
          >
            <ChevronLeft className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            tooltip="Next page"
          >
            <ChevronRight className="size-3.5" />
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="icon-xs"
            onClick={() => table.setPageIndex(pageCount - 1)}
            disabled={!table.getCanNextPage()}
            tooltip="Last page"
          >
            <ChevronsRight className="size-3.5" />
          </Button>
        </div>
      </div>
    </nav>
  );
}
