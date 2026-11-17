import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { useWorkspaceViewState } from "@/lib/hooks/state/useWorkspaceViewState";
import { CollectionPanel, collectionBlocked } from "@/components/CollectionPanel";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { api, type MatterListItem } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";
import { useDataTable } from "@/lib/hooks/table/useDataTable";
import { useTablePageParams } from "@/lib/hooks/table/useTablePageParams";
import { useTableState } from "@/lib/hooks/table/useTableState";
import { useMatters } from "@/lib/context/matters-context";
import { matterColumns } from "./-components/matterColumns";
import { EditMatterModal } from "./-components/EditMatterModal";
import { PeopleModal } from "./-components/PeopleModal";
import { CreateMatterModal } from "./-components/CreateMatterModal";

export const Route = createFileRoute("/_auth/matters/")({
  component: Matters,
  // ?view filters the list by status (set from the sidebar): all | active | closed.
  // ?new=1 opens the create-matter dialog (set from the sidebar's + button).
  validateSearch: (s: Record<string, unknown>): { view?: string; new?: boolean } => ({
    view: typeof s.view === "string" ? s.view : undefined,
    new: s.new === true || s.new === "1" || s.new === "true" ? true : undefined,
  }),
});

type Scope = "all" | "mine" | "shared";

function Matters() {
  // TanStack table rows mutate in place; keep the list responsive to query changes.
  "use no memo";
  const navigate = useNavigate();
  const search = Route.useSearch();
  const qc = useQueryClient();
  const { refresh, setCurrent } = useMatters();
  const [creating, setCreating] = useState(false);

  // The sidebar's + button links to /matters?new=1; open the dialog and strip
  // the param so a refresh or back-nav doesn't reopen it.
  useEffect(() => {
    if (!search.new) return;
    setCreating(true);
    void navigate({ to: "/matters", search: { view: search.view }, replace: true });
  }, [search.new, search.view, navigate]);
  const [scope, setScope] = useWorkspaceViewState<Scope>("matters:scope", "all");
  const [query, setQuery] = useWorkspaceViewState("matters:query", "");
  const { sorting, setSorting, pagination, setPagination, ready } = useTableState("matters", {
    defaultSorting: [{ id: "updatedAt", desc: true }],
  });
  const [rowSelection, setRowSelection] = useState({});
  const [editing, setEditing] = useState<MatterListItem | null>(null);
  const [peopleFor, setPeopleFor] = useState<MatterListItem | null>(null);

  const pageParams = useTablePageParams({
    query,
    sorting,
    pagination,
    setPagination,
    extraDeps: [scope],
    extraParams: { scope },
  });

  const listQuery = useQuery({
    queryKey: queryKeys.mattersPage(pageParams),
    queryFn: () => api.listMattersPage(pageParams),
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
  const shown = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;

  // Mutations touch both the sidebar's full list (the matters context) and this
  // paged query, so refresh both.
  const refreshMatters = () => {
    refresh();
    void qc.invalidateQueries({ queryKey: queryKeys.matters });
  };

  const closeMutation = useMutation({
    onMutate: () => captureActionOrigin(),
    mutationFn: (m: MatterListItem) =>
      api.updateMatter(m.matter.id, {
        status: m.matter.status === "closed" ? "open" : "closed",
      }),
    onSuccess: (_, m, origin) => {
      notifySuccess(m.matter.status === "closed" ? "Matter reopened" : "Matter closed", origin);
      refreshMatters();
      void qc.invalidateQueries({ queryKey: ["matter", m.matter.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const columns = useMemo(
    () =>
      matterColumns({
        onEdit: setEditing,
        onManagePeople: setPeopleFor,
        onToggleClose: (m) => closeMutation.mutate(m),
      }),
    [closeMutation]
  );

  const { table } = useDataTable({
    columns,
    data: shown,
    getRowId: (m) => m.matter.id,
    rowCount,
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-stack">
      {/* Matters header: serif title + a round add button. */}
      <PageHeader
        title="Matters"
        action={
          <Button
            variant="outline"
            size="sm"
            title="New matter"
            aria-label="New matter"
            disabled={blocked}
            onClick={() => setCreating(true)}
          >
            <Plus data-icon="inline-start" />
            New matter
          </Button>
        }
      />

      <ToolbarTabs
        tabs={[
          { id: "all" as const, label: "All" },
          { id: "mine" as const, label: "Mine" },
          { id: "shared" as const, label: "Shared with me" },
        ]}
        active={scope}
        onChange={setScope}
        actions={<TableSearch value={query} onChange={setQuery} placeholder="Search matters…" />}
      />

      <CreateMatterModal
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => {
          refreshMatters();
          setCurrent(id);
        }}
      />

      <CollectionPanel query={viewQuery} label="Matters">
        <DataTable
          rowActionColumn="name"
          getRowHref={(row) => `/matters/${row.matter.id}`}
          scrollKey={`matters:${JSON.stringify(pageParams)}`}
          table={table}
          empty={
            query || scope !== "all"
              ? "No matters match this filter."
              : "No matters yet. Create one to start filing work."
          }
          onRowClick={(m) => navigate({ to: "/matters/$id", params: { id: m.matter.id } })}
        />
        <TablePager table={table} />
      </CollectionPanel>

      {editing && (
        <EditMatterModal
          matter={editing.matter}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          canClose={editing.role === "owner"}
          onSaved={() => {
            refreshMatters();
            void qc.invalidateQueries({ queryKey: ["matter", editing.matter.id] });
          }}
        />
      )}

      {peopleFor && (
        <PeopleModal
          matterId={peopleFor.matter.id}
          matterName={peopleFor.matter.name}
          canManage={peopleFor.role === "owner"}
          open
          onOpenChange={(open) => !open && setPeopleFor(null)}
        />
      )}
    </div>
  );
}
