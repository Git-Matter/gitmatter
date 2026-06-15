import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  getCoreRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { Loader2, Plus, Search } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { api, type Client, type ClientSelection } from "../../lib/api";
import { queryKeys } from "../../lib/queries";
import { useColumnSizing } from "../../lib/useColumnSizing";
import { useTablePageParams } from "../../lib/useTablePageParams";
import { ClientDialog } from "./clients/-components/ClientDialog";
import { ClientSelectionBar } from "./clients/-components/ClientSelectionBar";
import { CreateClient } from "./clients/-components/CreateClient";
import { DeleteClientsDialog } from "./clients/-components/DeleteClientsDialog";
import { clientColumns } from "./clients/-components/clientColumns";

export const Route = createFileRoute("/_auth/clients")({
  component: Clients,
  // ?view filters by status; ?client opens that client's dialog (from the
  // sidebar's recent list).
  validateSearch: (s: Record<string, unknown>): { view?: string; client?: string } => ({
    view: typeof s.view === "string" ? s.view : undefined,
    client: typeof s.client === "string" ? s.client : undefined,
  }),
});

function Clients() {
  const { view = "all", client } = Route.useSearch();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Client | null>(null);
  const [sorting, setSorting] = useState<SortingState>([{ id: "name", desc: false }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  // "Select all matching" spans every row in the DB for the current filter, not
  // just the loaded page — so it's a flag, not an enumerated id set.
  const [selectAllMatching, setSelectAllMatching] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const qc = useQueryClient();
  const pageParams = useTablePageParams({
    query,
    sorting,
    pagination,
    setPagination,
    extraDeps: [view],
    extraParams: { status: view },
  });

  // A new filter changes which rows exist, so any prior selection is stale.
  useEffect(() => {
    setRowSelection({});
    setSelectAllMatching(false);
  }, [pageParams.q, pageParams.sort, pageParams.dir, view]);

  const { data, isPending } = useQuery({
    queryKey: queryKeys.clientsPage(pageParams),
    queryFn: () => api.listClientsPage(pageParams),
    placeholderData: keepPreviousData,
  });
  const clients = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;

  const { data: selectedOverview } = useQuery({
    queryKey: client ? queryKeys.client(client) : ["client", "none"],
    queryFn: () => api.getClient(client!),
    enabled: !!client && !selected,
  });

  // Open the dialog when the sidebar links here with ?client=<id>.
  useEffect(() => {
    if (!client) return;
    const found = clients.find((c) => c.id === client);
    if (found) setSelected(found);
  }, [client, clients]);

  useEffect(() => {
    if (!selectedOverview?.client) return;
    setSelected(selectedOverview.client);
  }, [selectedOverview]);

  const { columnSizing, onColumnSizingChange } = useColumnSizing("clients");

  const table = useReactTable({
    data: clients,
    columns: clientColumns,
    rowCount,
    getRowId: (row) => row.id,
    state: { sorting, pagination, rowSelection, columnSizing },
    onSortingChange: setSorting,
    onPaginationChange: setPagination,
    onRowSelectionChange: setRowSelection,
    onColumnSizingChange,
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    enableRowSelection: true,
    enableColumnResizing: true,
    columnResizeMode: "onChange",
    getCoreRowModel: getCoreRowModel(),
  });
  const showTable = clients.length > 0 || rowCount > 0 || query.trim().length > 0 || view !== "all";

  const selectedIds = Object.keys(rowSelection);
  const selectedCount = selectAllMatching ? rowCount : selectedIds.length;
  const selection: ClientSelection = selectAllMatching
    ? { all: true, q: pageParams.q, status: view }
    : { ids: selectedIds };

  function clearSelection() {
    setRowSelection({});
    setSelectAllMatching(false);
  }

  function exportCsv() {
    const a = document.createElement("a");
    a.href = api.clientsExportUrl(selection);
    a.download = "clients.csv";
    a.click();
  }

  const deleteMutation = useMutation({
    mutationFn: () => api.bulkDeleteClients(selection),
    onSuccess: ({ deleted, skipped }) => {
      void qc.invalidateQueries({ queryKey: queryKeys.clients });
      toast.success(
        skipped > 0
          ? `Deleted ${deleted}. Skipped ${skipped} with matters.`
          : `Deleted ${deleted} client${deleted === 1 ? "" : "s"}.`
      );
      clearSelection();
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="-mb-12 flex min-h-0 flex-1 flex-col gap-stack">
      <PageHeader
        title="Clients"
        action={
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            title="New client"
            aria-label="New client"
            onClick={() => setCreating((v) => !v)}
          >
            <Plus className="size-4" />
          </Button>
        }
      />

      {creating && <CreateClient onCreated={() => setCreating(false)} />}

      {showTable && (
        <>
          <div className="flex h-10 items-center justify-end border-b border-border">
            <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5">
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search clients…"
                className="h-7 w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>
          </div>
          <ClientSelectionBar
            table={table}
            selectedCount={selectedCount}
            selectAllMatching={selectAllMatching}
            rowCount={rowCount}
            pageCount={clients.length}
            onSelectAllMatching={() => setSelectAllMatching(true)}
            onClear={clearSelection}
            onExport={exportCsv}
            onDelete={() => setConfirmDelete(true)}
          />
          <DataTable
            table={table}
            onRowClick={(client) => setSelected(client)}
            empty={`No clients match "${query}".`}
          />
          <TablePager table={table} />
        </>
      )}
      {isPending && !showTable && (
        <div className="flex flex-1 items-center justify-center text-muted-foreground">
          <Loader2 className="size-6 animate-spin" />
        </div>
      )}
      {!isPending && !showTable && (
        <p className="py-section text-center text-sm text-muted-foreground">
          No clients yet. Add one to open your first matter.
        </p>
      )}

      <ClientDialog
        client={selected}
        onClose={() => {
          setSelected(null);
          if (client)
            void navigate({ to: "/clients", search: (s) => ({ ...s, client: undefined }) });
        }}
      />

      <DeleteClientsDialog
        open={confirmDelete}
        selectedCount={selectedCount}
        pending={deleteMutation.isPending}
        onOpenChange={setConfirmDelete}
        onConfirm={() => deleteMutation.mutate()}
      />
    </div>
  );
}
