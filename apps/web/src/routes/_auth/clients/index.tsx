import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { useWorkspaceViewState } from "@/lib/hooks/state/useWorkspaceViewState";
import { CollectionPanel, collectionBlocked } from "@/components/CollectionPanel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Empty, EmptyHeader, EmptyTitle, EmptyDescription } from "@/components/ui/empty";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { api, type Client, type ClientListItem, type ClientSelection } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";
import { useDataTable } from "@/lib/hooks/table/useDataTable";
import { useTablePageParams } from "@/lib/hooks/table/useTablePageParams";
import { useTableState } from "@/lib/hooks/table/useTableState";
import { ClientDialog } from "./-components/ClientDialog";
import { ClientPeopleModal } from "./-components/ClientPeopleModal";
import { ClientSelectionBar } from "./-components/ClientSelectionBar";
import { CreateClient } from "./-components/CreateClient";
import { DeleteClientsDialog } from "./-components/DeleteClientsDialog";
import { clientColumns } from "./-components/clientColumns";

export const Route = createFileRoute("/_auth/clients/")({
  component: Clients,
  // ?view filters by status; ?client opens that client's dialog (from the
  // sidebar's recent list).
  validateSearch: (s: Record<string, unknown>): { view?: string; client?: string } => ({
    view: typeof s.view === "string" ? s.view : undefined,
    client: typeof s.client === "string" ? s.client : undefined,
  }),
});

function Clients() {
  // See Matters: React Compiler can't track the stable TanStack table's in-place
  // data changes, so it skips the re-render that fills the table. Opt out.
  "use no memo";
  const { view = "all", client } = Route.useSearch();
  const navigate = useNavigate();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useWorkspaceViewState("clients:query", "");
  const [selected, setSelected] = useState<Client | null>(null);
  const [peopleFor, setPeopleFor] = useState<ClientListItem | null>(null);
  const { sorting, setSorting, pagination, setPagination, ready } = useTableState("clients", {
    defaultSorting: [{ id: "name", desc: false }],
  });
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

  const listQuery = useQuery({
    queryKey: queryKeys.clientsPage(pageParams),
    queryFn: () => api.listClientsPage(pageParams),
    placeholderData: keepPreviousData,
    enabled: ready,
  });
  const { data } = listQuery;
  const inputPending = query.trim() !== pageParams.q;
  const viewQuery = {
    ...listQuery,
    isFetching: listQuery.isFetching || inputPending,
    isPlaceholderData: listQuery.isPlaceholderData || inputPending,
  };
  const blocked = collectionBlocked(viewQuery);
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

  const columns = useMemo(
    () =>
      clientColumns(
        (c) => setSelected(c),
        (c) => setPeopleFor(c)
      ),
    []
  );
  const { table } = useDataTable({
    columns,
    data: clients,
    getRowId: (row) => row.id,
    rowCount,
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
    rowSelection,
    onRowSelectionChange: setRowSelection,
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
    onMutate: () => captureActionOrigin(),
    mutationFn: () => api.bulkDeleteClients(selection),
    onSuccess: ({ deleted, skipped }, _variables, origin) => {
      void qc.invalidateQueries({ queryKey: queryKeys.clients });
      notifySuccess(
        skipped > 0
          ? `Deleted ${deleted}. Skipped ${skipped} with matters.`
          : `Deleted ${deleted} client${deleted === 1 ? "" : "s"}.`,
        origin
      );
      clearSelection();
      setConfirmDelete(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-stack">
      <PageHeader
        title="Clients"
        action={
          <Button
            variant="outline"
            size="sm"
            title="New client"
            aria-label="New client"
            disabled={creating || blocked}
            onClick={() => setCreating(true)}
          >
            <Plus data-icon="inline-start" />
            New client
          </Button>
        }
      />

      {creating && (
        <CreateClient onCreated={() => setCreating(false)} onCancel={() => setCreating(false)} />
      )}

      {showTable && (
        <div className="flex h-10 items-center justify-end border-b border-border">
          <TableSearch value={query} onChange={setQuery} placeholder="Search clients…" />
        </div>
      )}

      {
        <CollectionPanel query={viewQuery} label="Clients">
          {showTable ? (
            <>
              <ClientSelectionBar
                table={table}
                selectedCount={selectedCount}
                selectAllMatching={selectAllMatching}
                rowCount={rowCount}
                pageCount={clients.length}
                onSelectAllMatching={() => setSelectAllMatching(true)}
                onClear={clearSelection}
                onExport={exportCsv}
                onDelete={() => {
                  deleteMutation.reset();
                  setConfirmDelete(true);
                }}
              />
              <DataTable
                rowActionColumn="name"
                scrollKey={`clients:${JSON.stringify(pageParams)}`}
                table={table}
                onRowClick={(client) => setSelected(client)}
                empty={`No clients match "${query}".`}
              />
              <TablePager table={table} />
            </>
          ) : (
            <Empty>
              <EmptyHeader>
                <EmptyTitle>No clients yet</EmptyTitle>
                <EmptyDescription>Add a client to open your first matter.</EmptyDescription>
              </EmptyHeader>
            </Empty>
          )}
        </CollectionPanel>
      }

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
        error={deleteMutation.error}
        onOpenChange={setConfirmDelete}
        onConfirm={() => deleteMutation.mutateAsync()}
      />

      {peopleFor && (
        <ClientPeopleModal
          clientId={peopleFor.id}
          clientName={peopleFor.name}
          canManage={peopleFor.role === "owner"}
          open
          onOpenChange={(open) => !open && setPeopleFor(null)}
        />
      )}
    </div>
  );
}
