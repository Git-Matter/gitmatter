import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PaginationState, type SortingState } from "@tanstack/react-table";
import { toast } from "sonner";
import { Library, Plus } from "lucide-react";
import { api, type WorkflowListItem } from "@/lib/data/api";
import { Button } from "@/components/ui/button";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { queryKeys } from "@/lib/data/queries";
import { useDataTable } from "@/lib/hooks/table/useDataTable";
import { useTablePageParams } from "@/lib/hooks/table/useTablePageParams";
import { DisplayWorkflowModal } from "./-components/DisplayWorkflowModal";
import { NewWorkflowModal } from "./-components/NewWorkflowModal";
import { WorkflowToolbarActions } from "./-components/WorkflowToolbarActions";
import { workflowColumns } from "./-components/workflowColumns";
import { WORKFLOW_TABS, type WorkflowTab } from "./-components/workflowList";
import { workflowDetailRoute } from "./-components/workflowRoutes";

export const Route = createFileRoute("/_auth/workflows/")({ component: Workflows });

function Workflows() {
  // See Matters: React Compiler can't track the stable TanStack table's in-place
  // data changes, so it skips the re-render that fills the table. Opt out.
  "use no memo";
  const navigate = useNavigate();
  const qc = useQueryClient();

  const [tab, setTab] = useState<WorkflowTab>("all");
  const [search, setSearch] = useState("");
  const [practiceFilter, setPracticeFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<WorkflowListItem["type"] | null>(null);
  const [sorting, setSorting] = useState<SortingState>([]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const [selected, setSelected] = useState<WorkflowListItem | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  // Invalidating the "workflows" prefix covers the paged list, the practices
  // dropdown, and the non-paged list the modals use.
  const invalidate = () => qc.invalidateQueries({ queryKey: queryKeys.workflows });

  const hideMutation = useMutation({
    mutationFn: (id: string) => api.hideWorkflow(id),
    onSuccess: invalidate,
  });
  const unhideMutation = useMutation({
    mutationFn: (id: string) => api.unhideWorkflow(id),
    onSuccess: invalidate,
  });
  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.deleteWorkflow(id),
    onSuccess: invalidate,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Delete failed"),
  });

  const pageParams = useTablePageParams({
    query: search,
    sorting,
    pagination,
    setPagination,
    extraDeps: [tab, typeFilter, practiceFilter],
    extraParams: { tab, type: typeFilter ?? undefined, practice: practiceFilter ?? undefined },
  });

  const { data } = useQuery({
    queryKey: queryKeys.workflowsPage(pageParams),
    queryFn: () => api.listWorkflowsPage(pageParams),
    placeholderData: keepPreviousData,
  });
  const rows = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;

  const { data: practices = [] } = useQuery({
    queryKey: queryKeys.workflowPractices({ tab, type: typeFilter }),
    queryFn: () => api.listWorkflowPractices({ tab, type: typeFilter ?? undefined }),
  });

  // A new filter changes which rows exist, so any prior selection is stale.
  useEffect(() => {
    setRowSelection({});
  }, [pageParams.q, tab, typeFilter, practiceFilter]);

  const columns = useMemo(
    () =>
      workflowColumns({
        tab,
        onHide: (w) => hideMutation.mutate(w.id),
        onUnhide: (w) => unhideMutation.mutate(w.id),
        onDelete: (w) => deleteMutation.mutate(w.id),
      }),
    [tab, hideMutation, unhideMutation, deleteMutation]
  );

  const { table } = useDataTable({
    columns,
    data: rows,
    getRowId: (w) => w.id,
    enableSorting: false,
    rowCount,
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  });

  // Row selection only spans the loaded page, so the selected rows' originals
  // carry everything bulk actions need (isSystem to choose hide vs delete).
  const selectedRows = () => table.getSelectedRowModel().rows.map((r) => r.original);
  const selectedCount = Object.keys(rowSelection).length;

  async function bulkRemove() {
    const ws = selectedRows();
    setRowSelection({});
    await Promise.all(
      ws.map((w) =>
        (w.isSystem ? api.hideWorkflow(w.id) : api.deleteWorkflow(w.id)).catch(() => {})
      )
    );
    void invalidate();
  }
  async function bulkUnhide() {
    const ws = selectedRows();
    setRowSelection({});
    await Promise.all(ws.map((w) => api.unhideWorkflow(w.id).catch(() => {})));
    void invalidate();
  }

  const toolbarActions = (
    <div className="flex items-center gap-3">
      <TableSearch value={search} onChange={setSearch} placeholder="Search workflows…" />
      <WorkflowToolbarActions
        selectedCount={selectedCount}
        tab={tab}
        practices={practices}
        typeFilter={typeFilter}
        practiceFilter={practiceFilter}
        onTypeFilterChange={setTypeFilter}
        onPracticeFilterChange={setPracticeFilter}
        onBulkRemove={() => void bulkRemove()}
        onBulkUnhide={() => void bulkUnhide()}
      />
    </div>
  );

  return (
    <PageShell
      mode="fill"
      bodyClassName="gap-stack"
      header={
        <PageHeader
          title="Workflows"
          action={
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-full"
              title="New workflow"
              aria-label="New workflow"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="size-4" />
            </Button>
          }
        />
      }
    >
      <ToolbarTabs tabs={WORKFLOW_TABS} active={tab} onChange={setTab} actions={toolbarActions} />

      <DataTable
        table={table}
        onRowClick={setSelected}
        empty={<EmptyState tab={tab} onNew={() => setNewOpen(true)} />}
      />

      {rowCount > 0 && <TablePager table={table} />}

      <DisplayWorkflowModal workflow={selected} onClose={() => setSelected(null)} />

      <NewWorkflowModal
        open={newOpen}
        onClose={() => setNewOpen(false)}
        onCreated={(wf) => {
          setNewOpen(false);
          void invalidate();
          void navigate(workflowDetailRoute(wf));
        }}
      />
    </PageShell>
  );
}

function EmptyState({ tab, onNew }: { tab: WorkflowTab; onNew: () => void }) {
  return (
    <div className="mx-auto flex w-full max-w-xs flex-col items-start py-24">
      <Library className="mb-4 h-8 w-8 text-muted-foreground/30" />
      {tab === "custom" ? (
        <>
          <p className="font-serif text-2xl">Custom Workflows</p>
          <p className="mt-1 text-left text-xs text-muted-foreground">
            Build reusable prompts and tabular review templates tailored to your practice.
          </p>
          <Button size="sm" className="mt-4 rounded-full" onClick={onNew}>
            <Plus className="size-3.5" /> Create New
          </Button>
        </>
      ) : tab === "hidden" ? (
        <>
          <p className="font-serif text-2xl">Hidden Workflows</p>
          <p className="mt-1 text-left text-xs text-muted-foreground">
            Built-in workflows you've hidden appear here. You can unhide them at any time.
          </p>
        </>
      ) : (
        <>
          <p className="font-serif text-2xl">Workflows</p>
          <p className="mt-1 text-left text-xs text-muted-foreground">
            Automate document analysis with reusable prompts and tabular review templates.
          </p>
        </>
      )}
    </div>
  );
}
