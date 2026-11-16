import * as React from "react";
import { Link } from "@tanstack/react-router";
import { useWorkspaceViewMemory } from "@/lib/hooks/state/useWorkspaceViewState";
import { useVirtualizer } from "@tanstack/react-virtual";
import { flexRender, type Row, type RowData, type Table as RTable } from "@tanstack/react-table";
import type { VirtualItem } from "@tanstack/react-virtual";
import { ChevronDown, ChevronsUpDown, ChevronUp, ChevronLeft, ChevronRight } from "lucide-react";
import { Empty, EmptyHeader, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/util/utils";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    // Opt out of the default ellipsis truncation (e.g. avatar groups, icon buttons).
    noTruncate?: boolean;
  }
}

// A row-virtualized table. Column widths are published as CSS variables on the
// <table> and read by every cell. Each column's `size` is its base width;
// flexible columns scale to fill the container (or shrink toward their minSize),
// and fixed columns (those with `enableResizing: false`) keep their exact width.
// When the flexible columns can't shrink any further the table overflows and
// scrolls horizontally instead of cramming.
//
// GOTCHA: the consuming component MUST start with `"use no memo"`. The `table`
// prop is a stable TanStack reference whose rows mutate in place, so the React
// Compiler (on in this project) memoizes <DataTable> and skips the re-render
// when query data loads — the table renders empty until some other state change.
// Not a virtualization issue. See react-compiler-tanstack-table notes.
type DataTableProps<T> = {
  table: RTable<T>;
  estimateSize?: number;
  variant?: "list" | "matrix";
  // Measure each row's real height (variable-height content). Off = fixed
  // estimateSize per row (cheaper; use when rows are single-line).
  measureRows?: boolean;
  onRowClick?: (row: T) => void;
  rowActionColumn?: string;
  getRowHref?: (row: T) => string;
  cellClassName?: string;
  empty?: React.ReactNode;
  className?: string;
  scrollKey?: string;
};

export function DataTable<T>({
  table,
  estimateSize = 40,
  variant = "list",
  measureRows = false,
  onRowClick,
  rowActionColumn,
  getRowHref,
  cellClassName,
  empty,
  className,
  scrollKey,
}: DataTableProps<T>) {
  const memory = useWorkspaceViewMemory();
  const restored = React.useRef<string | null>(null);
  const [scrollEl, setScrollEl] = React.useState<HTMLDivElement | null>(null);
  const setScrollRef = React.useCallback((node: HTMLDivElement | null) => {
    setScrollEl(node);
  }, []);
  const rows = table.getRowModel().rows;

  // Track the container width so flexible columns can stretch to fill it instead
  // of leaving empty space on the right. Fixed columns (the checkbox, the actions
  // column) keep their exact size; the remaining width is split among flexible
  // columns in proportion to their base size.
  const [containerWidth, setContainerWidth] = React.useState(0);
  React.useEffect(() => {
    if (!scrollEl) return;
    const ro = new ResizeObserver(([entry]) => {
      // Floor so the computed table width never exceeds the real container
      // width — an off-by-a-subpixel overflow would toggle the horizontal
      // scrollbar, which resizes the container, which re-fires this observer:
      // a feedback loop that tanks performance.
      if (!entry) return;
      const nextWidth = Math.floor(entry.contentRect.width);
      setContainerWidth((currentWidth) => (currentWidth === nextWidth ? currentWidth : nextWidth));
    });
    ro.observe(scrollEl);
    return () => ro.disconnect();
  }, [scrollEl]);

  const virtualizer = useVirtualizer({
    count: rows.length,
    enabled: !!scrollEl,
    getScrollElement: () => scrollEl,
    estimateSize: () => estimateSize,
    // Key the size cache by row id, not index — these tables sort/filter, so a
    // row's index is unstable. Index-keyed caching would misattribute measured
    // heights (and break scroll position) after a reorder, especially with
    // measureRows on.
    getItemKey: (index) => rows[index]?.id ?? index,
    overscan: 5,
    // React 19: the virtualizer's default flushSync runs during a commit, which
    // trips React's "Should not already be working" invariant — corrupting the
    // scheduler into a render loop (and an OOM in the dev component-perf track).
    // Disabling it lets React batch the scroll update naturally.
    useFlushSync: false,
  });
  const items = virtualizer.getVirtualItems();
  const paddingTop = items.length ? items[0]!.start : 0;
  const paddingBottom = items.length
    ? virtualizer.getTotalSize() - items[items.length - 1]!.end
    : 0;
  const leafColumns = table.getVisibleLeafColumns();
  const colSpan = leafColumns.length;

  const { columnSizeVars, tableWidth } = React.useMemo(() => {
    // A column is flexible unless it explicitly opts out via enableResizing:false.
    const isFlexible = (c: (typeof leafColumns)[number]) => c.columnDef.enableResizing !== false;
    const fixedTotal = leafColumns
      .filter((c) => !isFlexible(c))
      .reduce((s, c) => s + c.getSize(), 0);
    const flexibleTotal = leafColumns.filter(isFlexible).reduce((s, c) => s + c.getSize(), 0);
    const available = containerWidth - fixedTotal;
    // Grow flexible columns to fill leftover space, but never shrink them below
    // their base size: when the columns don't all fit, the table keeps its
    // comfortable widths and scrolls horizontally instead of cramming/truncating.
    const scale =
      containerWidth > 0 && flexibleTotal > 0 ? Math.max(1, available / flexibleTotal) : 1;
    const widthOf = (c: (typeof leafColumns)[number]) =>
      isFlexible(c) ? c.getSize() * scale : c.getSize();
    const vars: Record<string, number> = {};
    for (const header of table.getFlatHeaders()) {
      const w = widthOf(header.column);
      vars[`--header-${header.id}-size`] = w;
      vars[`--col-${header.column.id}-size`] = w;
    }
    const baseWidth = leafColumns.reduce((s, c) => s + widthOf(c), 0);
    return {
      columnSizeVars: vars,
      tableWidth: Math.floor(containerWidth > 0 ? Math.max(baseWidth, containerWidth) : baseWidth),
    };
  }, [containerWidth, leafColumns, table]);

  const [scrollState, setScrollState] = React.useState({ previous: false, next: false });
  React.useEffect(() => {
    if (!scrollEl || variant !== "matrix") return;
    const sync = () => {
      const previous = scrollEl.scrollLeft > 1;
      const next = scrollEl.scrollLeft + scrollEl.clientWidth < scrollEl.scrollWidth - 1;
      setScrollState((current) =>
        current.previous === previous && current.next === next ? current : { previous, next }
      );
    };
    sync();
    scrollEl.addEventListener("scroll", sync, { passive: true });
    return () => scrollEl.removeEventListener("scroll", sync);
  }, [scrollEl, containerWidth, tableWidth, variant]);
  function scrollColumns(direction: number) {
    scrollEl?.scrollBy({ left: direction * scrollEl.clientWidth * 0.7, behavior: "smooth" });
  }

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
    rowActionColumn,
    getRowHref,
    cellClassName,
    matrix: variant === "matrix",
    empty,
  };

  React.useLayoutEffect(() => {
    if (!scrollEl || !scrollKey || !rows.length || !items.length || restored.current === scrollKey)
      return;
    restored.current = scrollKey;
    const saved = memory?.get(`scroll:${scrollKey}`) as
      | { top: number; left: number; focus?: string }
      | undefined;
    if (!saved) {
      scrollEl.scrollTop = 0;
      scrollEl.scrollLeft = 0;
      return;
    }
    scrollEl.scrollTop = saved.top;
    scrollEl.scrollLeft = saved.left;
    if (saved.focus)
      requestAnimationFrame(() =>
        requestAnimationFrame(() => {
          scrollEl
            .querySelector<HTMLElement>(`[data-row-object="${CSS.escape(saved.focus!)}"]`)
            ?.focus({ preventScroll: true });
          memory?.set(`scroll:${scrollKey}`, { top: saved.top, left: saved.left });
        })
      );
  }, [scrollEl, scrollKey, rows.length, items.length, memory]);
  React.useLayoutEffect(
    () => () => {
      if (!scrollEl || !scrollKey) return;
      const previous = memory?.get(`scroll:${scrollKey}`) as
        | { top: number; left: number; focus?: string }
        | undefined;
      memory?.set(`scroll:${scrollKey}`, {
        ...previous,
        top: scrollEl.scrollTop,
        left: scrollEl.scrollLeft,
      });
    },
    [scrollEl, scrollKey, memory]
  );
  const content = (
    <div
      ref={setScrollRef}
      onScroll={(event) => {
        if (scrollKey) {
          const element = event.currentTarget;
          memory?.set(`scroll:${scrollKey}`, { top: element.scrollTop, left: element.scrollLeft });
        }
      }}
      onClickCapture={(event) => {
        const target =
          event.target instanceof Element
            ? event.target.closest<HTMLElement>("[data-row-navigation]")
            : null;
        if (target && scrollKey)
          memory?.set(`scroll:${scrollKey}`, {
            top: event.currentTarget.scrollTop,
            left: event.currentTarget.scrollLeft,
            focus: target.dataset.rowObject,
          });
      }}
      tabIndex={variant === "matrix" ? 0 : undefined}
      aria-label={variant === "matrix" ? "Table columns" : undefined}
      className={cn(
        "min-h-0 flex-1 overflow-auto",
        variant === "matrix" &&
          "focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-ring",
        className
      )}
    >
      <Table
        className="table-fixed"
        containerClassName="overflow-x-visible bg-transparent"
        // minWidth keeps the table from ever rendering narrower than its
        // container (e.g. before the width is measured) — otherwise a row's
        // background would stop short of the right edge. table-fixed spreads
        // the slack across the columns.
        style={{ ...columnSizeVars, width: tableWidth, minWidth: "100%" }}
      >
        <TableHeader className="sticky top-0 z-10 bg-background">
          {table.getHeaderGroups().map((hg) => (
            <TableRow key={hg.id} className={variant === "matrix" ? "border-grid-line" : undefined}>
              {hg.headers.map((header) => {
                const dir = header.column.getIsSorted();
                const canSort = header.column.getCanSort();
                const Icon = !dir ? ChevronsUpDown : dir === "asc" ? ChevronUp : ChevronDown;
                return (
                  <TableHead
                    key={header.id}
                    className={cn(
                      "h-8 overflow-hidden",
                      variant === "matrix" &&
                        "h-review-header border-e border-grid-line bg-card py-2 whitespace-normal text-foreground first:bg-card md:first:sticky md:first:start-0 md:first:z-20"
                    )}
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
                            dir ? "text-foreground" : "text-muted-foreground"
                          )}
                        />
                      </button>
                    ) : (
                      flexRender(header.column.columnDef.header, header.getContext())
                    )}
                  </TableHead>
                );
              })}
            </TableRow>
          ))}
        </TableHeader>
        <DataTableBody {...bodyProps} />
      </Table>
    </div>
  );
  if (variant !== "matrix") return content;
  return (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      {content}
      {(scrollState.previous || scrollState.next) && (
        <nav
          aria-label="Table column navigation"
          className="flex shrink-0 items-center justify-between gap-2 border-t border-grid-line py-2"
        >
          <span className="text-xs text-muted-foreground">Scroll to compare questions</span>
          <div className="flex items-center gap-1">
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Previous columns"
              disabled={!scrollState.previous}
              onClick={() => scrollColumns(-1)}
            >
              <ChevronLeft />
            </Button>
            <Button
              size="icon-xs"
              variant="ghost"
              aria-label="Next columns"
              disabled={!scrollState.next}
              onClick={() => scrollColumns(1)}
            >
              <ChevronRight />
            </Button>
          </div>
        </nav>
      )}
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
  matrix: boolean;
  onRowClick?: (row: T) => void;
  rowActionColumn?: string;
  getRowHref?: (row: T) => string;
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
  rowActionColumn,
  getRowHref,
  cellClassName,
  matrix,
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
        const RenderRow = matrix ? DataRowInner : DataRow;
        return (
          <RenderRow
            key={row.id}
            row={row}
            index={item.index}
            isSelected={row.getIsSelected()}
            matrix={matrix}
            measureRef={measureRows ? measureElement : undefined}
            onRowClick={onRowClick}
            rowActionColumn={rowActionColumn}
            getRowHref={getRowHref}
            cellClassName={cellClassName}
          />
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
            <Empty>
              <EmptyHeader>
                <EmptyDescription>{empty}</EmptyDescription>
              </EmptyHeader>
            </Empty>
          </TableCell>
        </TableRow>
      )}
    </TableBody>
  );
}

type DataRowProps<T> = {
  row: Row<T>;
  index: number;
  isSelected: boolean;
  matrix: boolean;
  measureRef?: (el: Element | null) => void;
  onRowClick?: (row: T) => void;
  rowActionColumn?: string;
  getRowHref?: (row: T) => string;
  cellClassName?: string;
};

function DataRowInner<T>({
  row,
  index,
  measureRef,
  onRowClick,
  rowActionColumn,
  getRowHref,
  cellClassName,
  matrix,
}: DataRowProps<T>) {
  return (
    <TableRow
      data-index={index}
      ref={measureRef}
      className={cn(
        "group hover:bg-muted/60",
        matrix ? "border-grid-line" : "border-border/60",
        onRowClick && "cursor-pointer"
      )}
      onClick={onRowClick ? () => onRowClick(row.original) : undefined}
    >
      {row.getVisibleCells().map((cell) => {
        // Clip every cell so content never bleeds into the next column. Text
        // cells truncate to an ellipsis; columns that opt out (avatar groups,
        // icon buttons) render as-is but are still clipped at the boundary.
        const noTruncate = cell.column.columnDef.meta?.noTruncate;
        const rendered = flexRender(cell.column.columnDef.cell, cell.getContext());
        const content =
          onRowClick && cell.column.id === rowActionColumn ? (
            getRowHref ? (
              <Link
                to={getRowHref(row.original)}
                data-row-object={row.id}
                data-row-navigation
                onClick={(event) => event.stopPropagation()}
                className="inline-flex min-h-6 max-w-full items-center truncate font-medium underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
              >
                {rendered}
              </Link>
            ) : (
              <Button
                variant="link"
                className="h-auto min-h-6 max-w-full justify-start p-0"
                data-row-object={row.id}
                onClick={(event) => {
                  event.stopPropagation();
                  onRowClick(row.original);
                }}
              >
                {rendered}
              </Button>
            )
          ) : (
            rendered
          );
        return (
          <TableCell
            key={cell.id}
            className={cn(
              "overflow-hidden py-2",
              matrix &&
                "h-review-row border-e border-grid-line p-0 first:bg-card first:px-3 first:ps-3 last:pe-0 md:first:sticky md:first:start-0 md:first:z-10",
              cellClassName
            )}
            style={{ width: `calc(var(--col-${cell.column.id}-size) * 1px)` }}
          >
            {noTruncate ? content : <div className="min-w-0 truncate">{content}</div>}
          </TableCell>
        );
      })}
    </TableRow>
  );
}

// Cell widths come from CSS vars on the <table>, so a row's output depends only
// on its data + selection — never on scroll position or column width. Memoizing
// on those means a scroll that shifts the window re-renders only the row(s) that
// entered it (not the whole visible set). onRowClick/cellClassName are stable
// across a scroll (the route doesn't re-render), so comparing by reference is safe.
const DataRow = React.memo(
  DataRowInner,
  (prev, next) =>
    prev.row.original === next.row.original &&
    prev.isSelected === next.isSelected &&
    prev.matrix === next.matrix &&
    prev.index === next.index &&
    prev.onRowClick === next.onRowClick &&
    prev.rowActionColumn === next.rowActionColumn &&
    prev.getRowHref === next.getRowHref &&
    prev.cellClassName === next.cellClassName
) as typeof DataRowInner;
