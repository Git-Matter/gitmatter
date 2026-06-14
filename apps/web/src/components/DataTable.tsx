import * as React from "react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { flexRender, type Row, type Table as RTable } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ChevronDown, ChevronsUpDown, ChevronUp } from "lucide-react";
import { cn } from "@/lib/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

// A row-virtualized, column-resizable table. Resizing follows TanStack's
// "performant" pattern: column widths are published as CSS variables on the
// <table> and read by every cell, so a drag only mutates those vars (a cheap
// repaint) instead of re-rendering the rows. During an active drag the body is
// swapped for a memoized copy that ignores everything but the data reference,
// so per-frame state churn never reaches the row tree. Widths persist via the
// table's columnSizing state (see useColumnSizing).
type DataTableProps<T> = {
  table: RTable<T>;
  estimateSize?: number;
  // Measure each row's real height (variable-height content). Off = fixed
  // estimateSize per row (cheaper; use when rows are single-line).
  measureRows?: boolean;
  onRowClick?: (row: T) => void;
  cellClassName?: string;
  empty?: React.ReactNode;
  className?: string;
};

export function DataTable<T>({
  table,
  estimateSize = 49,
  measureRows = false,
  onRowClick,
  cellClassName,
  empty,
  className,
}: DataTableProps<T>) {
  const scrollRef = React.useRef<HTMLDivElement>(null);
  const rows = table.getRowModel().rows;
  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: () => estimateSize,
    overscan: 10,
  });
  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length ? items[0]!.start : 0;
  const paddingBottom = items.length
    ? virtualizer.getTotalSize() - items[items.length - 1]!.end
    : 0;
  const leafColumns = table.getVisibleLeafColumns();
  const colSpan = leafColumns.length;

  // Track the container width so resizable columns can stretch to fill it
  // instead of leaving empty space on the right. Fixed (non-resizable) columns
  // — like the checkbox — keep their exact size; the remaining width is split
  // among resizable columns in proportion to their current size, so a manual
  // resize still adjusts the ratio between them.
  const [containerWidth, setContainerWidth] = React.useState(0);
  React.useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      // Floor so the computed table width never exceeds the real container
      // width — an off-by-a-subpixel overflow would toggle the horizontal
      // scrollbar, which resizes the container, which re-fires this observer:
      // a feedback loop that tanks performance during a column drag.
      if (entry) setContainerWidth(Math.floor(entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const sizingInfo = table.getState().columnSizingInfo;
  const sizing = table.getState().columnSizing;
  const { columnSizeVars, tableWidth } = React.useMemo(() => {
    const fixedTotal = leafColumns
      .filter((c) => !c.getCanResize())
      .reduce((s, c) => s + c.getSize(), 0);
    const resizableTotal = leafColumns
      .filter((c) => c.getCanResize())
      .reduce((s, c) => s + c.getSize(), 0);
    const available = containerWidth - fixedTotal;
    const scale =
      containerWidth > 0 && resizableTotal > 0 && available > resizableTotal
        ? available / resizableTotal
        : 1;
    const vars: Record<string, number> = {};
    for (const header of table.getFlatHeaders()) {
      const w = header.column.getCanResize() ? header.getSize() * scale : header.getSize();
      vars[`--header-${header.id}-size`] = w;
      vars[`--col-${header.column.id}-size`] = w;
    }
    return { columnSizeVars: vars, tableWidth: Math.floor(fixedTotal + resizableTotal * scale) };
    // Recompute on resize (in progress/commit) or container width change.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sizingInfo, sizing, containerWidth]);

  const bodyProps: BodyProps<T> = {
    table,
    rows,
    items,
    paddingTop,
    paddingBottom,
    colSpan,
    measureElement: virtualizer.measureElement,
    measureRows,
    onRowClick,
    cellClassName,
    empty,
  };
  // Freeze the row tree during a drag: only the CSS vars on <table> change.
  const Body = sizingInfo.isResizingColumn ? MemoBody : DataTableBody;

  return (
    <div
      ref={scrollRef}
      className={cn("min-h-0 flex-1 overflow-auto rounded-lg border border-border", className)}
    >
      <Table
        className="table-fixed"
        containerClassName="overflow-x-visible"
        style={{ ...columnSizeVars, width: tableWidth }}
      >
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id}>
              {hg.headers.map((header) => {
                const dir = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const Icon = !dir ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
                return (
                  <TableHead
                    key={header.id}
                    className="relative"
                    style={{ width: `calc(var(--header-${header.id}-size) * 1px)` }}
                  >
                    {canSort ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className="-mx-1 flex items-center gap-1 rounded px-1 hover:text-foreground"
                      >
                        {flexRender(header.column.columnDef.header, header.getContext())}
                        <Icon
                          className={cn(
                            "size-3.5",
                            dir ? "text-foreground" : "text-muted-foreground/50"
                          )}
                        />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                    {header.column.getCanResize() && (
                      <span
                        onMouseDown={header.getResizeHandler()}
                        onTouchStart={header.getResizeHandler()}
                        onClick={(e) => e.stopPropagation()}
                        className={cn(
                          "absolute end-0 top-0 h-full w-1 cursor-col-resize touch-none select-none hover:bg-border",
                          header.column.getIsResizing() && "bg-primary"
                        )}
                      />
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <Body {...bodyProps} />
      </Table>
    </div>
  );
}

type BodyProps<T> = {
  table: RTable<T>;
  rows: Row<T>[];
  items: VirtualItem[];
  paddingTop: number;
  paddingBottom: number;
  colSpan: number;
  measureElement: (el: Element | null) => void;
  measureRows: boolean;
  onRowClick?: (row: T) => void;
  cellClassName?: string;
  empty?: React.ReactNode;
};

function DataTableBody<T>({
  rows,
  items,
  paddingTop,
  paddingBottom,
  colSpan,
  measureElement,
  measureRows,
  onRowClick,
  cellClassName,
  empty,
}: BodyProps<T>) {
  return (
    <TableBody>
      {paddingTop > 0 && (
        <tr>
          <td colSpan={colSpan} style={{ height: paddingTop }} />
        </tr>
      )}
      {items.map((item) => {
        const row = rows[item.index]!;
        return (
          <TableRow
            key={row.id}
            data-index={item.index}
            ref={measureRows ? measureElement : undefined}
            className={onRowClick ? "cursor-pointer" : undefined}
            onClick={onRowClick ? () => onRowClick(row.original) : undefined}
          >
            {row.getVisibleCells().map((cell) => (
              <TableCell
                key={cell.id}
                className={cellClassName}
                style={{ width: `calc(var(--col-${cell.column.id}-size) * 1px)` }}
              >
                {flexRender(cell.column.columnDef.cell, cell.getContext())}
              </TableCell>
            ))}
          </TableRow>
        );
      })}
      {paddingBottom > 0 && (
        <tr>
          <td colSpan={colSpan} style={{ height: paddingBottom }} />
        </tr>
      )}
      {!rows.length && empty != null && (
        <TableRow>
          <TableCell colSpan={colSpan} className="py-section text-center text-muted-foreground">
            {empty}
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

// Only re-render the row tree when the data changes. Mounted exclusively during
// an active resize, when no scroll (and thus no virtual-window change) happens,
// so ignoring item/padding props is safe — the swap back to the live body on
// drag end picks up the committed widths.
const MemoBody = React.memo(
  DataTableBody,
  (prev, next) => prev.table.options.data === next.table.options.data
) as typeof DataTableBody;
