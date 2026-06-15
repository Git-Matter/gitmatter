import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  createColumnHelper,
  getCoreRowModel,
  useReactTable,
  type PaginationState,
  type SortingState,
} from "@tanstack/react-table";
import { useForm } from "@tanstack/react-form";
import { Download, Loader2, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { StateCue } from "@/components/StateCue";
import { TablePager } from "@/components/TablePager";
import { api, type Client, type ClientSelection } from "../../lib/api";
import { queryKeys } from "../../lib/queries";
import { useColumnSizing } from "../../lib/useColumnSizing";
import { useDebouncedValue } from "../../lib/useDebouncedValue";
import { ClientDialog } from "./clients/-components/ClientDialog";

export const Route = createFileRoute("/_auth/clients")({
  component: Clients,
  // ?view filters by status; ?client opens that client's dialog (from the
  // sidebar's recent list).
  validateSearch: (s: Record<string, unknown>): { view?: string; client?: string } => ({
    view: typeof s.view === "string" ? s.view : undefined,
    client: typeof s.client === "string" ? s.client : undefined,
  }),
});

const columnHelper = createColumnHelper<Client>();
const columns = [
  columnHelper.display({
    id: "select",
    size: 44,
    enableResizing: false,
    header: ({ table }) => (
      <Checkbox
        checked={table.getIsAllRowsSelected()}
        onChange={table.getToggleAllRowsSelectedHandler()}
        aria-label="Select all"
      />
    ),
    cell: ({ row }) => (
      <Checkbox
        checked={row.getIsSelected()}
        onChange={row.getToggleSelectedHandler()}
        onClick={(e) => e.stopPropagation()}
        aria-label="Select row"
      />
    ),
  }),
  columnHelper.accessor("name", {
    header: "Name",
    size: 280,
    cell: (c) => <span className="block truncate font-medium">{c.getValue()}</span>,
  }),
  columnHelper.accessor("type", {
    header: "Type",
    size: 120,
    cell: (c) => <span className="text-muted-foreground capitalize">{c.getValue()}</span>,
  }),
  columnHelper.accessor("clientNumber", {
    header: "Client no.",
    size: 140,
    cell: (c) => <span className="text-muted-foreground">{c.getValue() ?? "—"}</span>,
  }),
  columnHelper.accessor("status", {
    header: "Status",
    size: 120,
    cell: (c) =>
      c.getValue() === "inactive" ? (
        <StateCue tone="muted">Inactive</StateCue>
      ) : (
        <StateCue tone="bronze">Active</StateCue>
      ),
  }),
];

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
  const search = useDebouncedValue(query, 300);
  const sort = sorting[0];
  const pageParams = {
    q: search,
    status: view,
    page: pagination.pageIndex,
    pageSize: pagination.pageSize,
    sort: sort?.id,
    dir: sort?.desc ? "desc" : "asc",
  } as const;

  // A new filter changes which rows exist, so any prior selection is stale.
  useEffect(() => {
    setPagination((current) => ({ ...current, pageIndex: 0 }));
    setRowSelection({});
    setSelectAllMatching(false);
  }, [search, sort?.desc, sort?.id, view]);

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
    columns,
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
    ? { all: true, q: search, status: view }
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
          {selectedCount > 0 && (
            <div className="flex h-10 items-center justify-between gap-3 border-b border-border text-sm">
              <div className="flex items-center gap-3">
                <span className="font-medium">{selectedCount} selected</span>
                {!selectAllMatching &&
                  table.getIsAllRowsSelected() &&
                  rowCount > clients.length && (
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setSelectAllMatching(true)}
                    >
                      Select all {rowCount}
                    </button>
                  )}
                <button
                  type="button"
                  className="text-muted-foreground hover:text-foreground hover:underline"
                  onClick={clearSelection}
                >
                  Clear
                </button>
              </div>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportCsv}>
                  <Download className="size-4" />
                  Export CSV
                </Button>
                <Button variant="destructive" size="sm" onClick={() => setConfirmDelete(true)}>
                  <Trash2 className="size-4" />
                  Delete
                </Button>
              </div>
            </div>
          )}
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

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              Delete {selectedCount} client{selectedCount === 1 ? "" : "s"}?
            </DialogTitle>
            <DialogDescription>
              This permanently removes the selected clients. Any client that still has matters is
              kept and reported. This can&apos;t be undone.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button
              variant="destructive"
              disabled={deleteMutation.isPending}
              onClick={() => deleteMutation.mutate()}
            >
              {deleteMutation.isPending ? "Deleting…" : "Delete"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function CreateClient({ onCreated }: { onCreated: () => void }) {
  const qc = useQueryClient();
  const createMutation = useMutation({
    mutationFn: (d: { name: string; type: "organization" | "individual"; clientNumber?: string }) =>
      api.createClient(d),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: queryKeys.clients });
      toast.success("Client created");
      onCreated();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const form = useForm({
    defaultValues: {
      name: "",
      type: "organization" as "organization" | "individual",
      clientNumber: "",
    },
    onSubmit: ({ value }) =>
      createMutation
        .mutateAsync({
          name: value.name.trim(),
          type: value.type,
          clientNumber: value.clientNumber.trim() || undefined,
        })
        // Error already surfaced via the mutation's onError toast.
        .catch(() => {}),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New client</CardTitle>
      </CardHeader>
      <CardContent>
        <form
          className="flex flex-col gap-stack"
          onSubmit={(e) => {
            e.preventDefault();
            void form.handleSubmit();
          }}
        >
          <form.Field
            name="name"
            validators={{
              onChange: ({ value }) => (value.trim() ? undefined : "Name is required"),
            }}
          >
            {(field) => (
              <div className="flex flex-col gap-field">
                <Label htmlFor={field.name}>Name</Label>
                <Input
                  id={field.name}
                  value={field.state.value}
                  onBlur={field.handleBlur}
                  onChange={(e) => field.handleChange(e.target.value)}
                  placeholder="Acme Corp"
                />
                {field.state.meta.isTouched && field.state.meta.errors[0] && (
                  <p className="text-xs text-destructive">{field.state.meta.errors[0]}</p>
                )}
              </div>
            )}
          </form.Field>

          <div className="grid grid-cols-2 gap-stack">
            <form.Field name="type">
              {(field) => (
                <div className="flex flex-col gap-field">
                  <Label htmlFor={field.name}>Type</Label>
                  <select
                    id={field.name}
                    className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
                    value={field.state.value}
                    onChange={(e) =>
                      field.handleChange(e.target.value as "organization" | "individual")
                    }
                  >
                    <option value="organization">Organization</option>
                    <option value="individual">Individual</option>
                  </select>
                </div>
              )}
            </form.Field>

            <form.Field name="clientNumber">
              {(field) => (
                <div className="flex flex-col gap-field">
                  <Label htmlFor={field.name}>Client number (optional)</Label>
                  <Input
                    id={field.name}
                    value={field.state.value}
                    onChange={(e) => field.handleChange(e.target.value)}
                    placeholder="2024-001"
                  />
                </div>
              )}
            </form.Field>
          </div>

          <form.Subscribe selector={(s) => [s.canSubmit, s.isSubmitting]}>
            {([canSubmit, isSubmitting]) => (
              <Button type="submit" disabled={!canSubmit} className="self-start">
                {isSubmitting ? "Creating…" : "Create client"}
              </Button>
            )}
          </form.Subscribe>
        </form>
      </CardContent>
    </Card>
  );
}
