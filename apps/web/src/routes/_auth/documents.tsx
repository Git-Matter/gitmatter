import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PaginationState, type SortingState } from "@tanstack/react-table";
import { Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { api, type Doc } from "../../lib/api";
import { queryKeys } from "../../lib/queries";
import { useDataTable } from "../../lib/useDataTable";
import { useWorkingMatterId } from "../../lib/matters-context";
import { useTablePageParams } from "../../lib/useTablePageParams";
import { DocumentDrawer } from "./documents/-components/DocumentDrawer";
import { documentColumns } from "./documents/-components/documentColumns";
import { useDocumentUpload } from "./documents/-hooks/useDocumentUpload";

export const Route = createFileRoute("/_auth/documents")({
  component: Documents,
  // ?view filters by extraction status (set from the sidebar): all | ready |
  // processing (pending+processing) | failed.
  validateSearch: (s: Record<string, unknown>): { view?: string } => ({
    view: typeof s.view === "string" ? s.view : undefined,
  }),
});

function Documents() {
  const qc = useQueryClient();
  const matterId = useWorkingMatterId();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const { view = "all" } = Route.useSearch();
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const pageParams = useTablePageParams({
    query,
    sorting,
    pagination,
    setPagination,
    extraDeps: [view],
    extraParams: { status: view },
  });

  const { data, isPending } = useQuery({
    queryKey: queryKeys.documentsPage(pageParams),
    queryFn: () => api.listDocumentsPage(pageParams),
    placeholderData: keepPreviousData,
  });
  const docs = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;
  const invalidateDocs = () => qc.invalidateQueries({ queryKey: queryKeys.documents });

  // Extraction runs in-process; one SSE stream pushes status changes (pending ->
  // processing -> ready/failed). Refetch the list on each event instead of polling.
  useEffect(() => {
    const es = new EventSource("/api/documents/events");
    es.addEventListener("status", () => {
      void qc.invalidateQueries({ queryKey: queryKeys.documents });
    });
    return () => es.close();
  }, [qc]);

  const [confirmDelete, setConfirmDelete] = useState<Doc | null>(null);
  const retryMutation = useMutation({
    mutationFn: (id: string) => api.retryDocument(id),
    onSuccess: () => invalidateDocs(),
    onError: (e) => toast.error(e instanceof Error ? e.message : "Retry failed"),
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteDocument(id),
    onSuccess: () => {
      toast.success("Document deleted");
      void invalidateDocs();
      setConfirmDelete(null);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });
  const { dragging, fileRef, onDragEnter, onDragLeave, onDragOver, onDrop, onPick, uploading } =
    useDocumentUpload({
      matterId,
      onUploaded: () => void invalidateDocs(),
      setPagination,
    });

  const columns = useMemo(
    () =>
      documentColumns({
        onRetry: (id) => retryMutation.mutate(id),
        onDownload: (id) => window.open(api.documentDownloadUrl(id), "_blank"),
        onDelete: (doc) => setConfirmDelete(doc),
      }),
    [retryMutation]
  );

  const { table } = useDataTable({
    columns,
    data: docs,
    sizingKey: "documents",
    getRowId: (row) => row.id,
    rowCount,
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  });
  const showTable = docs.length > 0 || rowCount > 0 || query.trim().length > 0 || view !== "all";

  return (
    <div
      className="relative flex min-h-0 flex-1 flex-col gap-stack"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDrop}
    >
      {dragging && (
        <div className="pointer-events-none absolute inset-0 z-10 flex items-center justify-center rounded-lg border-2 border-dashed border-primary bg-primary/5 text-sm font-medium text-primary">
          Drop files to upload
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        accept=".pdf,.docx,.doc"
        className="hidden"
        onChange={onPick}
      />
      <PageHeader
        title="Documents"
        action={
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            disabled={uploading}
            title={uploading ? "Uploading…" : "Upload"}
            aria-label={uploading ? "Uploading…" : "Upload"}
            onClick={() => fileRef.current?.click()}
          >
            {uploading ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <Upload className="size-4" />
            )}
          </Button>
        }
      />

      {showTable && (
        <div className="flex h-10 items-center justify-end border-b border-border">
          <TableSearch value={query} onChange={setQuery} placeholder="Search documents…" />
        </div>
      )}

      {showTable && (
        <>
          <DataTable
            table={table}
            onRowClick={(doc) => setSelectedId(doc.id)}
            empty={query.trim() ? `No documents match "${query}".` : "No documents in this view."}
          />
          <TablePager table={table} />
        </>
      )}
      {isPending ? (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      ) : (
        !showTable && (
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="flex flex-col items-center gap-2 rounded-lg border-2 border-dashed border-border py-section text-center text-sm text-muted-foreground hover:border-primary/50 hover:text-foreground"
          >
            <Upload className="size-5" />
            Drop files here or click to upload. PDF or DOCX.
          </button>
        )
      )}
      <DocumentDrawer docId={selectedId} onClose={() => setSelectedId(null)} />

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete document?"
        message={
          confirmDelete
            ? `"${confirmDelete.title}" and all its versions will be deleted.`
            : undefined
        }
        confirmLabel="Delete"
        pending={deleteMutation.isPending}
        onConfirm={() => confirmDelete && deleteMutation.mutate(confirmDelete.id)}
        onCancel={() => setConfirmDelete(null)}
      />
    </div>
  );
}
