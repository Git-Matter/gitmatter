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
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Skeleton } from "@/components/ui/skeleton";
import { ActorBadge } from "@/components/ActorBadge";
import { CommitHistory } from "@/components/CommitHistory";
import { useSession } from "@/lib/auth/auth-client";
import { DataTable } from "@/components/DataTable";
import { ModelPicker } from "@/components/ModelPicker";
import { PageHeader } from "@/components/PageHeader";
import {
  api,
  type Blame,
  type Cell,
  type ReviewDetail,
  type ReviewStreamCell,
} from "@/lib/data/api";
import { useSelectedModel } from "@/lib/hooks/state/useSelectedModel";
import { DocumentDrawer } from "@/routes/_auth/documents/-components/DocumentDrawer";

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
  const [previewId, setPreviewId] = useState<string | null>(null);
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
    () => (review?.documentIds ?? []).map((docId) => ({ docId, title: docTitle(docId) })),
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
    ];
    for (const col of review?.columnsConfig ?? []) {
      cols.push({
        id: `col-${col.index}`,
        header: col.name,
        size: 240,
        cell: ({ row, table }) => {
          const meta = table.options.meta as ReviewMeta;
          const key = `${row.original.docId}:${col.index}`;
          return (
            <ReviewCell
              cell={meta.cellOf(row.original.docId, col.index)}
              busy={meta.running.has(key)}
              onRun={() => meta.run(row.original.docId, col.index)}
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
    meta: { run, running, cellOf, preview: setPreviewId } satisfies ReviewMeta,
  });

  if (!data || !review)
    return (
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto pt-6 lg:grid-cols-[1fr_280px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-72 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );

  return (
    <div
      className={`grid min-h-0 flex-1 gap-6 overflow-y-auto pt-6 ${
        historyCollapsed ? "lg:grid-cols-[1fr_auto]" : "lg:grid-cols-[1fr_280px]"
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

      <DocumentDrawer docId={previewId} onClose={() => setPreviewId(null)} />
    </div>
  );
}

type ReviewRow = { docId: string; title: string };

type ReviewMeta = {
  run: (docId: string, columnIndex: number) => void;
  running: Set<string>;
  cellOf: (docId: string, columnIndex: number) => Cell | undefined;
  preview: (docId: string) => void;
};

// One matrix cell: extraction result with a flag dot, citation chips + blame,
// or a Run button. Citation chips and the reasoning open in popovers (mike's
// cell overlay, condensed).
function ReviewCell({ cell, busy, onRun }: { cell?: Cell; busy: boolean; onRun: () => void }) {
  // A streaming "Run all" marks the cell "generating" before content lands.
  const isBusy = busy || cell?.status === "generating";
  if (!cell?.content)
    return (
      <Button size="xs" variant="outline" disabled={isBusy} onClick={onRun}>
        {isBusy ? "Running…" : "Run"}
      </Button>
    );
  const citations = cell.citations ?? [];
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-start gap-2">
        <span
          className={`mt-1.5 size-2 shrink-0 rounded-full ${FLAG_COLOR[cell.content.flag] ?? "bg-muted-foreground/50"}`}
        />
        <span className="text-sm">
          {cell.content.summary}
          {citations.map((c, i) => (
            <Popover key={i}>
              <PopoverTrigger
                render={
                  <button className="mx-0.5 inline-flex size-3.5 items-center justify-center rounded-full bg-muted align-super text-[9px] font-medium text-muted-foreground hover:bg-bronze-tint hover:text-bronze">
                    {i + 1}
                  </button>
                }
              />
              <PopoverContent className="w-72 text-xs">
                {c.page != null && (
                  <p className="mb-1 font-medium text-muted-foreground">Page {c.page}</p>
                )}
                <p className="border-l-2 border-bronze pl-2 italic">"{c.quote}"</p>
              </PopoverContent>
            </Popover>
          ))}
        </span>
      </div>
      <div className="flex items-center gap-2">
        {cell.content.reasoning && (
          <Popover>
            <PopoverTrigger
              render={
                <button className="text-xs text-muted-foreground underline-offset-2 hover:underline">
                  reasoning
                </button>
              }
            />
            <PopoverContent className="w-72 text-xs text-muted-foreground">
              {cell.content.reasoning}
            </PopoverContent>
          </Popover>
        )}
        {cell.blame && <BlamePopover blame={cell.blame} />}
        <Button size="xs" variant="ghost" disabled={isBusy} onClick={onRun}>
          {isBusy ? "…" : "Re-run"}
        </Button>
      </div>
    </div>
  );
}

function BlamePopover({ blame }: { blame: Blame }) {
  return (
    <Popover>
      <PopoverTrigger
        render={
          <button className="text-xs text-muted-foreground underline-offset-2 hover:underline">
            blame #{blame.seq}
          </button>
        }
      />
      <PopoverContent className="w-64 text-xs">
        <div className="flex items-center gap-2">
          <ActorBadge
            actorType={blame.actorType}
            agentLabel={blame.agentLabel}
            actorId={blame.actorId}
            actorName={blame.actorName}
          />
          <span className="font-mono">{blame.op}</span>
        </div>
        <p className="mt-1">{blame.message}</p>
        <p className="mt-0.5 text-muted-foreground">{new Date(blame.createdAt).toLocaleString()}</p>
      </PopoverContent>
    </Popover>
  );
}
