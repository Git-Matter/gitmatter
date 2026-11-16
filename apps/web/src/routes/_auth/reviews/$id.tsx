import { notifySuccess } from "@/lib/feedback";
import { useMediaQuery } from "@/lib/hooks/useMediaQuery";
import { configuredModelAvailable } from "@/lib/data/configured-model";
import { readableSnapshot, snapshotIsCurrent } from "@/lib/data/snapshot-refresh";
import { SnapshotNotice } from "@/components/SnapshotNotice";
import {
  ContractReviewActions,
  ContractReviewCompletion,
} from "./-components/ContractReviewActions";
import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
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
  FileText,
  Text,
  Table2,
  PanelLeft,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
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
import { ContractReviewWorkspace } from "./-components/ContractReviewWorkspace";
import { useReviewActionDrafts } from "./-components/useReviewActionDrafts";
import { UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";

export const Route = createFileRoute("/_auth/reviews/$id")({
  component: ReviewView,
  validateSearch: (
    input: Record<string, unknown>
  ): {
    finding?: string;
    view?: "table" | "document";
    executionRoute?: "application" | "agent";
    model?: string;
    modelHintInvalid?: boolean;
  } => ({
    view: input.view === "document" ? "document" : undefined,
    finding:
      typeof input.finding === "string" && /^[0-9a-f-]{36}$/i.test(input.finding)
        ? input.finding
        : undefined,
    executionRoute:
      input.executionRoute === "application" || input.executionRoute === "agent"
        ? input.executionRoute
        : undefined,
    model:
      typeof input.model === "string" && input.model.length > 0 && input.model.length <= 200
        ? input.model
        : undefined,
    modelHintInvalid:
      input.modelHintInvalid === true ||
      input.modelHintInvalid === "true" ||
      (input.model !== undefined &&
        (typeof input.model !== "string" || input.model.length === 0 || input.model.length > 200))
        ? true
        : undefined,
  }),
});

const FLAG_COLOR: Record<string, string> = {
  green: "bg-success",
  yellow: "bg-warning",
  red: "bg-destructive",
  grey: "bg-muted-foreground/50",
};

function ReviewView() {
  // See Matters: React Compiler can't track the stable TanStack table's in-place
  // data changes, so it skips the re-render that fills the table. Opt out.
  "use no memo";
  const { id } = Route.useParams();
  const actionDrafts = useReviewActionDrafts(id);
  const searchParams = Route.useSearch();
  const navigate = useNavigate();
  const documentView = searchParams.view === "document";
  const wide = useMediaQuery("(min-width: 1024px)");
  const [documentVisited, setDocumentVisited] = useState(documentView);
  useEffect(() => {
    if (documentView) setDocumentVisited(true);
  }, [documentView]);
  const applicationMode = searchParams.executionRoute !== "agent";
  const qc = useQueryClient();
  const { data: session } = useSession();
  const reviewKey = ["review", id];
  const reviewQuery = useQuery({
    queryKey: reviewKey,
    queryFn: () => api.getReview(id),
    refetchInterval: (query) =>
      query.state.data?.cells.some(
        (cell) => cell.status === "pending" || cell.status === "generating"
      )
        ? 2500
        : false,
  });
  const data = readableSnapshot(reviewQuery);
  const { dataUpdatedAt } = reviewQuery;
  const completionQuery = useQuery({
    queryKey: ["review-completion", id],
    queryFn: () => api.getReviewCompletion(id),
    enabled: !!data,
    refetchInterval: 5000,
  });
  const completion = readableSnapshot(completionQuery);
  const current = snapshotIsCurrent(reviewQuery) && snapshotIsCurrent(completionQuery);
  useEffect(() => {
    void qc.invalidateQueries({ queryKey: ["review-completion", id] });
  }, [qc, id, dataUpdatedAt]);
  const historyQuery = useQuery({
    queryKey: ["review-history", id],
    queryFn: () => api.history(id),
  });
  const history = readableSnapshot(historyQuery) ?? [];
  const [running, setRunning] = useState<Set<string>>(new Set());
  const retryRequests = useRef(new Map<string, string>());
  const retryFailed = useMutation({
    mutationFn: (acknowledgeUnknown: boolean) => {
      if (!canRun) throw new Error(runUnavailableReason);
      const key = `${model}:${acknowledgeUnknown}`;
      const requestId = retryRequests.current.get(key) ?? crypto.randomUUID();
      retryRequests.current.set(key, requestId);
      return api.queueFailedReviewRules(id, requestId, model, acknowledgeUnknown);
    },
    onSuccess: (_result, acknowledgeUnknown) => {
      retryRequests.current.delete(`${model}:${acknowledgeUnknown}`);
      void qc.invalidateQueries({ queryKey: reviewKey });
      void qc.invalidateQueries({ queryKey: ["review-history", id] });
      notifySuccess("Failed rules queued. Completed findings are preserved.");
    },
    onError: (error) =>
      toast.error(error instanceof Error ? error.message : "Retry could not be queued"),
  });
  const [runningAll, setRunningAll] = useState(false);
  const runAllAbort = useRef<AbortController | null>(null);
  useEffect(() => () => runAllAbort.current?.abort(), []);
  const [savedModel, setSavedModel] = useSelectedModel();
  const [explicitModel, setExplicitModel] = useState<{ reviewId: string; model: string } | null>(
    null
  );
  const chosenModel = explicitModel?.reviewId === id ? explicitModel.model : null;
  // A URL hint stays local to this review. It never replaces the user's saved choice.
  const model = chosenModel ?? searchParams.model ?? savedModel;
  const catalog = useQuery({
    queryKey: ["models"],
    queryFn: () => api.listModels(),
    enabled: applicationMode,
  });
  const hintedModel = chosenModel === null && !!searchParams.model;
  const guide = useQuery({
    queryKey: ["first-review", data?.review.matterId],
    queryFn: () => api.getFirstReviewStatus(data!.review.matterId),
    enabled: applicationMode && hintedModel && !!data?.review.matterId,
  });
  const configuredModel = configuredModelAvailable(model, catalog.data ?? [], !hintedModel);
  const verifiedHint =
    (chosenModel !== null || !searchParams.modelHintInvalid) &&
    (!hintedModel ||
      (!guide.isPending &&
        !guide.isFetching &&
        !guide.error &&
        (guide.data?.application.providers.some(
          (provider) =>
            provider.available && provider.models.some((candidate) => candidate.id === model)
        ) ??
          false)));
  const modelAvailable =
    model.length > 0 &&
    model.length <= 200 &&
    !catalog.isPending &&
    !catalog.isFetching &&
    !catalog.error &&
    configuredModel &&
    verifiedHint;
  const canRun = current && applicationMode && modelAvailable && completion?.canEscalate !== false;
  const runUnavailableReason = !current
    ? "Refresh the review and its decision permissions before running it."
    : !applicationMode
      ? "Use your connected agent, or explicitly switch to an application model before running paid calls."
      : "Choose an available model before running this review.";
  function chooseModel(next: string) {
    setExplicitModel({ reviewId: id, model: next });
    setSavedModel(next);
  }
  const { data: estimate, error: estimateError } = useQuery({
    queryKey: ["review-estimate", id, model, dataUpdatedAt],
    queryFn: () => api.getReviewEstimate(id, model),
    enabled: !!data && canRun,
  });
  const [historyCollapsed, setHistoryCollapsed] = useState(true);
  // Source document preview (optionally jumped to a cited page).
  const [preview, setPreview] = useState<{ docId: string; page?: number } | null>(null);
  // URL selection survives a source round trip and browser back/forward.
  const tableRegion = useRef<HTMLElement>(null);
  const selectedCell = data?.cells.find((cell) => cell.id === searchParams.finding);
  const detail = selectedCell
    ? { docId: selectedCell.documentId, columnIndex: selectedCell.columnIndex }
    : null;
  function selectCell(docId: string, columnIndex: number) {
    const finding = cellOf(docId, columnIndex)?.id;
    if (finding)
      void navigate({ to: "/reviews/$id", params: { id }, search: { ...searchParams, finding } });
  }
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
    mutationFn: (v: { documentId: string; columnIndex: number }) => {
      if (!canRun) throw new Error(runUnavailableReason);
      return api.runCell(id, v.documentId, v.columnIndex, model);
    },
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
    if (!canRun) {
      toast.error(runUnavailableReason);
      return;
    }
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
    if (!review || runningAll || !canRun) return;
    setRunningAll(true);
    const controller = new AbortController();
    runAllAbort.current = controller;
    try {
      await api.runReviewStream(
        id,
        { model },
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
  const commonMatter =
    tableData.length && tableData.every((row) => row.matterName === tableData[0]?.matterName)
      ? tableData[0]?.matterName
      : null;
  const columns = useMemo<ColumnDef<ReviewRow>[]>(() => {
    const cols: ColumnDef<ReviewRow>[] = [
      {
        id: "document",
        header: "Document",
        size: 264,
        enableResizing: false,
        cell: ({ row, table }) => {
          const meta = table.options.meta as ReviewMeta;
          return (
            <button
              className="flex h-review-row w-full min-w-0 items-center gap-2 text-start text-xs hover:text-bronze"
              onClick={() => meta.preview(row.original.docId)}
            >
              <span className="w-5 shrink-0 text-end font-normal text-muted-foreground tabular-nums">
                {row.index + 1}
              </span>
              <span className="flex min-w-0 items-center gap-1.5 rounded-sm bg-muted px-2 py-1 font-medium">
                <FileText className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="truncate">{row.original.title}</span>
              </span>
            </button>
          );
        },
      },
    ];
    if (!commonMatter)
      cols.push({
        id: "matter",
        header: "Matter",
        size: 160,
        cell: ({ row }) => (
          <span className="px-3 text-xs text-muted-foreground">
            {row.original.matterName ?? "Unassigned"}
          </span>
        ),
      });
    cols.push({
      id: "source",
      header: "Review source",
      size: 132,
      cell: ({ row, table }) => {
        const doc = (table.options.meta as ReviewMeta).sourceOf(row.original.docId);
        const changed =
          !!doc?.sourceChanged ||
          !!(
            doc?.reviewedVersionId &&
            doc.currentVersionId &&
            doc.reviewedVersionId !== doc.currentVersionId
          );
        const status = changed
          ? "Changed"
          : doc?.reviewedVersionId && doc.currentVersionId
            ? "Current"
            : "Unavailable";
        return (
          <Badge variant={changed ? "warning" : "secondary"} className="mx-3">
            {status}
          </Badge>
        );
      },
    });
    for (const col of review?.columnsConfig ?? []) {
      cols.push({
        id: `col-${col.index}`,
        header: ({ table }) => (
          <ColumnHeader
            reviewId={id}
            columnIndex={col.index}
            name={col.name}
            prompt={col.prompt}
            format={col.format}
            tags={col.tags}
            current={(table.options.meta as ReviewMeta).current}
          />
        ),
        size: 176,
        cell: ({ row, table }) => {
          const meta = table.options.meta as ReviewMeta;
          const key = `${row.original.docId}:${col.index}`;
          return (
            <ReviewCell
              cell={meta.cellOf(row.original.docId, col.index)}
              busy={meta.running.has(key)}
              canRun={meta.canRun}
              selected={meta.selectedId === meta.cellOf(row.original.docId, col.index)?.id}
              onRun={() => meta.run(row.original.docId, col.index)}
              onDetail={() => meta.openDetail(row.original.docId, col.index)}
            />
          );
        },
      });
    }
    return cols;
  }, [review, commonMatter]);

  const table = useReactTable({
    data: tableData,
    columns,
    getRowId: (row) => row.docId,
    enableSorting: false,
    getCoreRowModel: getCoreRowModel(),
    meta: {
      run,
      selectedId: selectedCell?.id,
      sourceOf: (docId: string) => completion?.documents.find((doc) => doc.documentId === docId),
      running,
      canRun,
      current,
      cellOf,
      preview: (docId: string) => setPreview({ docId }),
      openDetail: (docId: string, columnIndex: number) => {
        selectCell(docId, columnIndex);
        void fetch(`/api/tabular/reviews/${id}/findings/${docId}/${columnIndex}/opened`, {
          method: "POST",
        }).catch(() => {});
      },
    } satisfies ReviewMeta,
  });

  const inspector = detail && !documentView && (
    <CellDetailDrawer
      open={!reviewQuery.error && !completionQuery.error}
      inline={wide}
      columnName={
        review?.columnsConfig.find((c) => c.index === detail.columnIndex)?.name ??
        `Column ${detail.columnIndex}`
      }
      docTitle={docTitle(detail.docId)}
      cell={cellOf(detail.docId, detail.columnIndex)}
      busy={running.has(`${detail.docId}:${detail.columnIndex}`)}
      canRun={canRun}
      onRun={() => run(detail.docId, detail.columnIndex)}
      onClose={() => {
        const target = tableRegion.current?.querySelector<HTMLButtonElement>(
          'button[data-review-finding][aria-expanded="true"]'
        );
        void navigate({
          to: "/reviews/$id",
          params: { id },
          search: { ...searchParams, finding: undefined },
        }).then(() => target?.focus({ preventScroll: true }));
      }}
      onOpenSource={(page) => setPreview({ docId: detail.docId, page })}
      sourceVersionChanged={completion?.documents.some(
        (d) =>
          d.documentId === detail.docId &&
          (d.reviewedVersionId !== d.currentVersionId || d.sourceChanged)
      )}
      reviewedSourceUrl={(() => {
        const doc = completion?.documents.find((d) => d.documentId === detail.docId);
        return doc?.reviewedVersionId
          ? api.versionDownloadUrl(doc.documentId, doc.reviewedVersionId)
          : undefined;
      })()}
      decisions={(() => {
        const document = completion?.documents.find((d) => d.documentId === detail.docId);
        const finding = document?.findings.find((f) => f.columnIndex === detail.columnIndex);
        return completion && document && finding ? (
          <ContractReviewActions
            key={finding.finding?.revisionId ?? "pending"}
            {...actionDrafts.bind(
              document.documentId,
              finding.finding?.revisionId,
              finding.columnIndex
            )}
            reviewId={id}
            document={document}
            finding={finding}
            cell={cellOf(detail.docId, detail.columnIndex)}
            canDecide={completion.canDecide}
            canEscalate={completion.canEscalate}
            policyRevision={completion.policyRevision}
          />
        ) : undefined;
      })()}
    />
  );

  if (!data || !review)
    return (
      <div className="grid min-h-0 w-full min-w-0 flex-1 gap-6 overflow-x-hidden overflow-y-auto pt-6 lg:grid-cols-[minmax(0,1fr)_280px]">
        <UnsavedNavigationGuard {...actionDrafts.guardProps} allowSearchNavigation />
        {reviewQuery.error ? (
          <SnapshotNotice query={reviewQuery} label="Review" />
        ) : (
          <>
            <div className="flex flex-col gap-4">
              <Skeleton className="h-8 w-64" />
              <Skeleton className="h-72 w-full" />
            </div>
            <Skeleton className="h-40 w-full" />
          </>
        )}
      </div>
    );

  return (
    <div
      className={`grid min-h-0 w-full min-w-0 flex-1 gap-5 overflow-x-hidden overflow-y-auto ${
        historyCollapsed
          ? "lg:grid-cols-[minmax(0,1fr)_auto]"
          : "lg:grid-cols-[minmax(0,1fr)_280px]"
      }`}
    >
      <UnsavedNavigationGuard {...actionDrafts.guardProps} allowSearchNavigation />
      {(reviewQuery.error || completionQuery.error) && (
        <div className="space-y-3 lg:col-span-full">
          <SnapshotNotice query={reviewQuery} label="Review" />
          <SnapshotNotice query={completionQuery} label="Review permissions and output" />
        </div>
      )}
      <div inert={!current} className="flex min-h-0 min-w-0 flex-col">
        <div className="mb-3">
          <PageHeader
            breadcrumbs={[{ label: "Reviews", to: "/reviews" }, { label: review.title }]}
            title={review.title}
            action={
              <div className="flex w-full min-w-0 flex-wrap items-center gap-2 sm:w-auto">
                {applicationMode ? <ModelPicker value={model} onChange={chooseModel} /> : null}
                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button size="sm" variant="outline" disabled={!current}>
                        <Download className="size-3.5" />
                        Export
                        <ChevronDown className="size-3.5 opacity-60" />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end">
                    {completion && (
                      <DropdownMenuItem
                        disabled={!current}
                        render={<a href={api.reviewReportUrl(id)} />}
                      >
                        Review report and manifest
                      </DropdownMenuItem>
                    )}
                    <DropdownMenuItem
                      disabled={!current}
                      render={<a href={api.reviewExportUrl(id, "csv")} />}
                    >
                      CSV
                    </DropdownMenuItem>
                    <DropdownMenuItem
                      disabled={!current}
                      render={<a href={api.reviewExportUrl(id, "xlsx")} />}
                    >
                      XLSX
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
                <Button size="sm" onClick={runAll} disabled={runningAll || !canRun}>
                  {runningAll ? "Running…" : "Run"}
                </Button>
              </div>
            }
          />
        </div>

        {!applicationMode ? (
          <Alert className="mb-4">
            <AlertTitle>Continue in your connected agent</AlertTitle>
            <AlertDescription>
              <p>
                Ask the client to inspect this saved review with <code>get_review</code>, read its
                captured source and instructions, and write cited rule findings with{" "}
                <code>write_cell</code>. Use this review's ID: <code>{id}</code>. Then return here
                for human decisions and output.
              </p>
              <p>
                The client's subscription or model bill is separate from application AI usage. This
                page will not start an application model call in connected-agent mode.
              </p>
              <div className="flex flex-wrap gap-3">
                <Link
                  to="/settings"
                  search={{ tab: "agents" }}
                  className="underline underline-offset-4"
                >
                  Inspect agent connections
                </Link>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() =>
                    void navigate({
                      to: "/reviews/$id",
                      params: { id },
                      search: { ...searchParams, executionRoute: "application" },
                    })
                  }
                >
                  Use an application model instead
                </Button>
              </div>
            </AlertDescription>
          </Alert>
        ) : !modelAvailable ? (
          <p role="status" className="mb-4 max-w-prose text-sm text-muted-foreground">
            {runUnavailableReason}
          </p>
        ) : null}
        {applicationMode && estimate && (
          <details className="mb-3 text-xs text-muted-foreground">
            <summary className="cursor-pointer">
              Run estimate: {estimate.cells} rules ·{" "}
              {estimate.costUsd === null
                ? "price unavailable"
                : `estimated $${estimate.costUsd.toFixed(2)} USD`}
            </summary>
            <p className="mt-2 max-w-prose">
              Up to {estimate.inputTokenUpperEstimate.toLocaleString()} input tokens and{" "}
              {estimate.outputTokenLimit.toLocaleString()} output tokens ·{" "}
              {estimate.costUsd === null
                ? "price unavailable for this model"
                : `estimated $${estimate.costUsd.toFixed(2)} USD`}
              . Application AI limits apply before dispatch; this is an estimate, not a provider
              invoice.
            </p>
          </details>
        )}
        {applicationMode && estimateError && (
          <p className="mb-4 text-xs text-muted-foreground">
            Run estimate unavailable. Check model access before starting.
          </p>
        )}
        <Tabs
          value={documentView ? "document" : "table"}
          onValueChange={(view) =>
            void navigate({
              to: "/reviews/$id",
              params: { id },
              search: { ...searchParams, view: view === "document" ? "document" : "table" },
            })
          }
          className="min-h-0 flex-1 gap-0"
        >
          <div className="mb-3 flex shrink-0 items-center justify-between gap-2 border-b border-grid-line pb-1">
            <TabsList variant="line" aria-label="Review views">
              <TabsTrigger value="table">
                <Table2 data-icon="inline-start" />
                Table
              </TabsTrigger>
              <TabsTrigger value="document">
                <PanelLeft data-icon="inline-start" />
                Document
              </TabsTrigger>
            </TabsList>
            <span className="text-xs text-muted-foreground">
              {tableData.length} document{tableData.length === 1 ? "" : "s"}
            </span>
          </div>
          {completion && (
            <ContractReviewCompletion completion={completion} compact={!documentView} />
          )}
          <TabsContent value="table" keepMounted className="flex min-h-64 flex-col gap-3">
            {commonMatter && (
              <p className="text-xs text-muted-foreground">
                Matter <span className="ms-1 font-medium text-foreground">{commonMatter}</span>
              </p>
            )}
            <section
              ref={tableRegion}
              aria-label="Review table"
              className="flex min-h-64 flex-1 overflow-hidden border-t border-grid-line bg-card"
            >
              <DataTable table={table} variant="matrix" estimateSize={45} className="min-w-0" />
              {inspector}
            </section>
            <p className="text-xs text-muted-foreground">
              Select a finding to inspect its sources and record a decision. Flags are model
              findings; source status describes version identity.
            </p>
          </TabsContent>
          <TabsContent value="document" keepMounted className="flex min-h-0 flex-col">
            {documentVisited && completion && (
              <ContractReviewWorkspace
                completion={completion}
                cells={data.cells}
                drafts={actionDrafts}
                guardNavigation={false}
                onSelectFinding={selectCell}
                initialFindingId={searchParams.finding}
                onOpenDraft={(docId) => setPreview({ docId })}
                onRetry={(acknowledgeUnknown) => retryFailed.mutate(acknowledgeUnknown)}
                retrying={retryFailed.isPending}
                canRetry={canRun}
              />
            )}
          </TabsContent>
        </Tabs>
      </div>

      {historyCollapsed ? (
        <aside className="hidden lg:flex lg:flex-col lg:items-center lg:gap-2 lg:border-l lg:border-border lg:pl-2">
          <Button variant="ghost" size="icon-sm" tooltip="Show history" onClick={toggleHistory}>
            <ChevronLeft className="size-3.5" />
          </Button>
          <HistoryIcon className="size-3.5 text-muted-foreground" />
        </aside>
      ) : (
        <aside className="hidden min-h-0 overflow-y-auto lg:block lg:border-l lg:border-border lg:pl-6">
          <div className="mb-3 flex items-center justify-between border-b border-border pb-2">
            <h2 className="text-xs font-medium text-foreground">History</h2>
            <Button variant="ghost" size="icon-sm" tooltip="Hide history" onClick={toggleHistory}>
              <ChevronRight className="size-3.5" />
            </Button>
          </div>
          <SnapshotNotice query={historyQuery} label="Review history" />
          <CommitHistory commits={history} currentUserId={session?.user.id} />
        </aside>
      )}

      <details className="max-h-64 overflow-y-auto border-t border-border pt-2 text-xs lg:hidden">
        <summary className="cursor-pointer font-medium">History</summary>
        <div className="mt-3">
          <SnapshotNotice query={historyQuery} label="Review history" />
          <CommitHistory commits={history} currentUserId={session?.user.id} />
        </div>
      </details>

      <DocumentDrawer
        docId={!reviewQuery.error && !completionQuery.error ? (preview?.docId ?? null) : null}
        page={preview?.page}
        onClose={() => setPreview(null)}
      />
    </div>
  );
}

type ReviewRow = { docId: string; title: string; matterName: string | null };

type ReviewMeta = {
  run: (docId: string, columnIndex: number) => void;
  running: Set<string>;
  canRun: boolean;
  current: boolean;
  selectedId?: string;
  sourceOf: (
    docId: string
  ) => import("@/lib/data/api").ReviewCompletion["documents"][number] | undefined;
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
  current,
}: {
  reviewId: string;
  columnIndex: number;
  name: string;
  prompt: string;
  format?: string;
  tags?: string[];
  current: boolean;
}) {
  const qc = useQueryClient();
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(prompt);
  const save = useMutation({
    mutationFn: (nextPrompt: string) => {
      if (!current) throw new Error("Refresh the review before changing its prompt.");
      return api.updateReviewColumn(reviewId, columnIndex, { prompt: nextPrompt });
    },
    onSuccess: (updated) => {
      qc.setQueryData(["review", reviewId], updated);
      void qc.invalidateQueries({ queryKey: ["review-history", reviewId] });
      notifySuccess("Prompt updated");
      setOpen(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Save failed"),
  });
  const promptChanged = draft.trim() !== prompt.trim();
  return (
    <span className="flex min-w-0 items-center gap-1">
      <Text className="size-3.5 shrink-0 text-muted-foreground" />
      <span className="min-w-0 leading-snug whitespace-normal">{name}</span>
      <Popover
        open={open && current}
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
          <p className="font-medium text-foreground">Prompt</p>
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
              disabled={!current || !promptChanged || !draft.trim() || save.isPending}
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
  canRun,
  selected,
  onRun,
  onDetail,
}: {
  cell?: Cell;
  busy: boolean;
  canRun: boolean;
  onRun: () => void;
  onDetail: () => void;
  selected: boolean;
}) {
  const buttonRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) buttonRef.current?.scrollIntoView({ block: "nearest", inline: "nearest" });
  }, [selected]);
  const isBusy = busy || cell?.status === "generating";
  if (!cell?.content)
    return (
      <div className="flex h-review-row items-center gap-2 px-3 text-xs">
        <button
          ref={buttonRef}
          data-review-finding
          aria-expanded={selected}
          onClick={onDetail}
          className="truncate text-muted-foreground hover:text-foreground"
        >
          {isBusy
            ? "Generating…"
            : cell?.status === "error"
              ? "Failed"
              : cell?.status === "pending"
                ? "Pending"
                : "Not run"}
        </button>
        <Button size="xs" variant="ghost" disabled={isBusy || !canRun} onClick={onRun}>
          {cell?.status === "error" ? "Retry" : "Run"}
        </Button>
      </div>
    );
  const sourceCount = cell.citations?.length ?? 0;
  return (
    <button
      ref={buttonRef}
      data-review-finding
      onClick={onDetail}
      aria-expanded={selected}
      aria-label={`${cell.content.summary} · ${cell.content.flag} flag · ${sourceCount} source${sourceCount === 1 ? "" : "s"}`}
      className="flex h-review-row w-full items-center gap-2 px-3 text-start text-xs hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none focus-visible:ring-inset aria-expanded:bg-accent"
    >
      <span
        aria-hidden="true"
        className={`size-1.5 shrink-0 rounded-full ${FLAG_COLOR[cell.content.flag] ?? "bg-muted-foreground/50"}`}
      />
      <span className="shrink-0 text-xs text-muted-foreground">{cell.content.flag}</span>
      <span className="min-w-0 flex-1 truncate">{cell.content.summary}</span>
      <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{sourceCount}</span>
    </button>
  );
}
