import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type ColumnDef, getCoreRowModel, useReactTable } from "@tanstack/react-table";
import { toast } from "sonner";
import {
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Download,
  History as HistoryIcon,
  Info,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Skeleton } from "@/components/ui/skeleton";
import { CommitHistory } from "@/components/CommitHistory";
import { useSession } from "@/lib/auth/auth-client";
import { DataTable } from "@/components/DataTable";
import { ModelPicker } from "@/components/ModelPicker";
import { PageHeader } from "@/components/PageHeader";
import { api, type Cell, type ReviewDetail, type ReviewStreamCell } from "@/lib/data/api";
import { useSelectedModel } from "@/lib/hooks/state/useSelectedModel";
import { DocumentDrawer } from "@/routes/_auth/documents/-components/DocumentDrawer";
import { CellDetailDrawer } from "./-components/CellDetailDrawer";

export const Route = createFileRoute("/_auth/reviews/$id")({ component: ReviewView });

const FLAG_COLOR: Record<string, string> = {
  green: "bg-emerald-500",
  yellow: "bg-amber-500",
  red: "bg-red-500",
  grey: "bg-muted-foreground/50",
};

function ReviewView() {
  // See Matters: React Compiler can't track the stable TanStack table's in-place
  // data changes, so it skips the re-render that fills the table. Opt out.
  "use no memo";
  const { id } = Route.useParams();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const reviewKey = ["review", id];
  const { data } = useQuery({ queryKey: reviewKey, queryFn: () => api.getReview(id) });
  const { data: history = [] } = useQuery({
    queryKey: ["review-history", id],
    queryFn: () => api.history(id),
  });
  const [running, setRunning] = useState<Set<string>>(new Set());
  const [runningAll, setRunningAll] = useState(false);
  const runAllAbort = useRef<AbortController | null>(null);
  useEffect(() => () => runAllAbort.current?.abort(), []);
  const [model, setModel] = useSelectedModel();
  const [historyCollapsed, setHistoryCollapsed] = useState(false);
  // Source document preview (optionally jumped to a cited page).
  const [preview, setPreview] = useState<{ docId: string; page?: number } | null>(null);
  // The cell whose full detail panel is open.
  const [detail, setDetail] = useState<{ docId: string; columnIndex: number } | null>(null);
  useEffect(() => {
    const saved = localStorage.getItem("reviewHistoryCollapsed");
    if (saved !== null) setHistoryCollapsed(saved === "true");
  }, []);
  function toggleHistory() {
    setHistoryCollapsed((v) => {
      const next = !v;
      localStorage.setItem("reviewHistoryCollapsed", String(next));
      return next;
    });
  }

  const runMutation = useMutation({
    mutationFn: (v: { documentId: string; columnIndex: number }) =>
      api.runCell(id, v.documentId, v.columnIndex, model || undefined),
    onSuccess: (updated) => {
      qc.setQueryData(reviewKey, updated);
      void qc.invalidateQueries({ queryKey: ["review-history", id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Run failed"),
  });

  const review = data?.review;
  const cells = data?.cells;
  const docTitle = (docId: string) => data?.documentTitles[docId] ?? docId.slice(0, 8);
  const docMatter = (docId: string) => data?.documentMatters[docId] ?? null;
  const cellOf = (docId: string, col: number): Cell | undefined =>
    cells?.find((c) => c.documentId === docId && c.columnIndex === col);

  async function run(documentId: string, columnIndex: number) {
    const key = `${documentId}:${columnIndex}`;
    setRunning((s) => new Set(s).add(key));
    try {
      // Errors surface via the mutation's onError toast; swallow so runAll continues.
      await runMutation.mutateAsync({ documentId, columnIndex }).catch(() => {});
    } finally {
      setRunning((s) => {
        const n = new Set(s);
        n.delete(key);
        return n;
      });
    }
  }

  // Patch cells of the cached review in place (by document + column) so the grid
  // fills as the stream lands, without a refetch per document.
  const patchCells = (match: (c: Cell) => boolean, apply: (c: Cell) => Cell) =>
    qc.setQueryData<ReviewDetail>(reviewKey, (prev) =>
      prev ? { ...prev, cells: prev.cells.map((c) => (match(c) ? apply(c) : c)) } : prev
    );

  async function runAll() {
    if (!review || runningAll) return;
    setRunningAll(true);
    const controller = new AbortController();
    runAllAbort.current = controller;
    try {
      await api.runReviewStream(
        id,
        { model: model || undefined },
        {
          // A cell flips to "generating" the moment its column query starts…
          onCellStart: (documentId, columnIndex) =>
            patchCells(
              (c) => c.documentId === documentId && c.columnIndex === columnIndex,
              (c) => ({ ...c, status: "generating" })
            ),
          // …then fills in when that column's result lands.
          onCell: (documentId, columnIndex, sc: ReviewStreamCell) =>
            patchCells(
              (c) => c.documentId === documentId && c.columnIndex === columnIndex,
              (c) => ({ ...c, content: sc.content, citations: sc.citations, status: sc.status })
            ),
          onError: (documentId, columnIndex, message) => {
            toast.error(message);
            if (documentId != null && columnIndex != null)
              patchCells(
                (c) => c.documentId === documentId && c.columnIndex === columnIndex,
                (c) => ({ ...c, status: "error" })
              );
          },
        },
        controller.signal
      );
    } catch (e) {
      if ((e as Error)?.name !== "AbortError")
        toast.error(e instanceof Error ? e.message : "Run failed");
    } finally {
      if (runAllAbort.current === controller) runAllAbort.current = null;
      setRunningAll(false);
      // Reconcile blame + final state from the server.
      void qc.invalidateQueries({ queryKey: reviewKey });
      void qc.invalidateQueries({ queryKey: ["review-history", id] });
    }
  }

  // Each document is a row; the columns are a fixed "Document" label plus one
  // per configured extraction column. Cell rendering reads run state through
  // the table meta so column identity stays stable across runs.
  const tableData = useMemo<ReviewRow[]>(
    () =>
      (review?.documentIds ?? []).map((docId) => ({
        docId,
        title: docTitle(docId),
        matterName: docMatter(docId),
      })),
    // docTitle reads data.documentTitles; recompute when the review payload changes.
    [data, review] // eslint-disable-line react-hooks/exhaustive-deps
  );
  const columns = useMemo<ColumnDef<ReviewRow>[]>(() => {
    const cols: ColumnDef<ReviewRow>[] = [
      {
        id: "document",
        header: "Document",
        size: 200,
        cell: ({ row, table }) => {
          const meta = table.options.meta as ReviewMeta;
          return (
            <button
              className="text-start font-medium hover:text-bronze hover:underline"
              onClick={() => meta.preview(row.original.docId)}
            >
              {row.original.title}
            </button>
          );
        },
      },
      {
        id: "matter",
        header: "Matter",
        size: 160,
        cell: ({ row }) => (
          <span className="block truncate text-muted-foreground">
            {row.original.matterName ?? "—"}
          </span>
        ),
      },
    ];
    for (const col of review?.columnsConfig ?? []) {
      cols.push({
        id: `col-${col.index}`,
        header: () => (
          <ColumnHeader
            reviewId={id}
            columnIndex={col.index}
            name={col.name}
            prompt={col.prompt}
            format={col.format}
            tags={col.tags}
          />
        ),
        size: 240,
        cell: ({ row, table }) => {
          const meta = table.options.meta as ReviewMeta;
          const key = `${row.original.docId}:${col.index}`;
          return (
            <ReviewCell
              cell={meta.cellOf(row.original.docId, col.index)}
              busy={meta.running.has(key)}
              onRun={() => meta.run(row.original.docId, col.index)}
              onDetail={() => meta.openDetail(row.original.docId, col.index)}
            />
          );
        },
      });
    }
    return cols;
  }, [review]);

  const table = useReactTable({
    data: tableData,
    columns,
    getRowId: (row) => row.docId,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      run,
      running,
      cellOf,
      preview: (docId: string) => setPreview({ docId }),
      openDetail: (docId: string, columnIndex: number) => setDetail({ docId, columnIndex }),
    } satisfies ReviewMeta,
  });

  if (!data || !review)
    return (
      <div className="grid min-h-0 w-full min-w-0 flex-1 gap-6 overflow-x-hidden overflow-y-auto pt-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );

  return (
    <div
      className={`grid min-h-0 w-full min-w-0 flex-1 gap-6 overflow-x-hidden overflow-y-auto pt-6 ${
        historyCollapsed
          ? "lg:grid-cols-[minmax(0,1fr)_auto]"
          : "lg:grid-cols-[minmax(0,1fr)_280px]"
      }`}
    >
      <div className="min-w-0">
        <div className="mb-3">
          <PageHeader
            breadcrumbs={[{ label: "Reviews", to: "/reviews" }, { label: review.title }]}
            title={review.title}
            action={
              <div className="flex items-center gap-2">
                <ModelPicker value={model} onChange={setModel} />
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button size="sm" variant="outline">
                        <Download className="size-3.5" />
                        Export
                        <ChevronDown className="size-3.5 opacity-60" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    <DropdownMenuItem render={<a href={api.reviewExportUrl(id, "csv")} />}>
                      CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem render={<a href={api.reviewExportUrl(id, "xlsx")} />}>
                      XLSX
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" onClick={runAll} disabled={runningAll}>
                  {runningAll ? "Running…" : "Run"}
                </Button>
              </div>
            }
          />
        </div>

        <DataTable
          table={table}
          estimateSize={72}
          measureRows
          cellClassName="align-top"
          className="max-h-[70vh] flex-none rounded-md"
        />
      </div>

      {historyCollapsed ? (
        <aside className="hidden lg:flex lg:flex-col lg:items-center lg:gap-2 lg:border-l lg:border-border lg:pl-2">
          <Button variant="ghost" size="icon-sm" tooltip="Show history" onClick={toggleHistory}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <HistoryIcon className="size-3.5 text-muted-foreground" />
        </aside>
      ) : (
        <aside className="lg:border-l lg:border-border lg:pl-6">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-xs font-semibold tracking-wide text-muted-foreground uppercase">
              History
            </h2>
            <Button variant="ghost" size="icon-sm" tooltip="Hide history" onClick={toggleHistory}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <CommitHistory commits={history} currentUserId={session?.user.id} />
        </aside>
      )}

      <DocumentDrawer
        docId={preview?.docId ?? null}
        page={preview?.page}
        onClose={() => setPreview(null)}
      />

      {detail && (
        <CellDetailDrawer
          open
          columnName={
            review.columnsConfig.find((c) => c.index === detail.columnIndex)?.name ??
            `Column ${detail.columnIndex}`
          }
          docTitle={docTitle(detail.docId)}
          cell={cellOf(detail.docId, detail.columnIndex)}
          busy={running.has(`${detail.docId}:${detail.columnIndex}`)}
          onRun={() => run(detail.docId, detail.columnIndex)}
          onClose={() => setDetail(null)}
          onOpenSource={(page) => setPreview({ docId: detail.docId, page })}
        />
      )}
    </div>
  );
}

type ReviewRow = { docId: string; title: string; matterName: string | null };

type ReviewMeta = {
  run: (docId: string, columnIndex: number) => void;
  running: Set<string>;
  cellOf: (docId: string, columnIndex: number) => Cell | undefined;
  preview: (docId: string) => void;
  openDetail: (docId: string, columnIndex: number) => void;
};

// Column header: the column name plus an info button that reveals — and lets you
// edit — the extraction prompt (and shows format/tags). Saving records a commit;
// the new prompt applies the next time the column is run.
function ColumnHeader({
  reviewId,
  columnIndex,
  name,
  prompt,
  format,
  tags,
}: {
  reviewId: string;
  columnIndex: number;
  name: string;
  prompt: string;
  format?: string;
  tags?: string[];
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const save = useMutation({
    mutationFn: (nextPrompt: string) =>
      api.updateReviewColumn(reviewId, columnIndex, { prompt: nextPrompt }),
    onSuccess: (updated) => {
      qc.setQueryData(["review", reviewId], updated);
      void qc.invalidateQueries({ queryKey: ["review-history", reviewId] });
      toast.success("Prompt updated");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const promptChanged = draft.trim() !== prompt.trim();
  return (
    <span className="inline-flex items-center gap-1">
      <span className="truncate">{name}</span>
      <Popover
        open={open}
        onOpenChange={(next) => {
          // Seed the editor from the current prompt each time it opens.
          if (next) setDraft(prompt);
          setOpen(next);
        }}
      >
        <PopoverTrigger
          render={
            <button
              className="shrink-0 text-muted-foreground/60 hover:text-bronze"
              aria-label={`Edit prompt for ${name}`}
            >
              <Info className="size-3.5" />
            </button>
          }
        />
        <PopoverContent className="w-80 space-y-2 text-xs">
          <p className="font-semibold tracking-wide text-muted-foreground uppercase">Prompt</p>
          <Textarea
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            rows={5}
            className="text-xs leading-relaxed normal-case"
          />
          {(format || tags?.length) && (
            <div className="flex flex-wrap gap-1.5 text-muted-foreground">
              {format && <span className="rounded bg-muted px-1.5 py-0.5">format: {format}</span>}
              {tags?.map((t) => (
                <span key={t} className="rounded bg-muted px-1.5 py-0.5">
                  {t}
                </span>
              ))}
            </div>
          )}
          <div className="flex items-center justify-end gap-1.5 pt-1">
            <Button size="xs" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              size="xs"
              disabled={!promptChanged || !draft.trim() || save.isPending}
              onClick={() => save.mutate(draft.trim())}
            >
              {save.isPending ? "Saving…" : "Save"}
            </Button>
          </div>
        </PopoverContent>
      </Popover>
    </span>
  );
}

// One matrix cell: a flag dot + clamped summary that opens the full detail panel
// on click (full text, reasoning, sources, blame). Keeps a Run button when empty.
function ReviewCell({
  cell,
  busy,
  onRun,
  onDetail,
}: {
  cell?: Cell;
  busy: boolean;
  onRun: () => void;
  onDetail: () => void;
}) {
  // A streaming "Run all" marks the cell "generating" before content lands.
  const isBusy = busy || cell?.status === "generating";
  if (!cell?.content)
    return (
      <Button size="xs" variant="outline" disabled={isBusy} onClick={onRun}>
        {isBusy ? "Running…" : "Run"}
      </Button>
    );
  const sourceCount = cell.citations?.length ?? 0;
  return (
    <div className="flex flex-col gap-1.5">
      <button onClick={onDetail} className="group flex items-start gap-2 text-start">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${FLAG_COLOR[cell.content.flag] ?? "bg-muted-foreground/50"}`}
        />
        <span className="line-clamp-3 text-sm group-hover:text-bronze">{cell.content.summary}</span>
      </button>
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <button onClick={onDetail} className="hover:text-bronze hover:underline">
          Details{sourceCount ? ` · ${sourceCount} source${sourceCount > 1 ? "s" : ""}` : ""}
        </button>
        <Button size="xs" variant="ghost" disabled={isBusy} onClick={onRun}>
          {isBusy ? "…" : "Re-run"}
        </Button>
      </div>
    </div>
  );
}
