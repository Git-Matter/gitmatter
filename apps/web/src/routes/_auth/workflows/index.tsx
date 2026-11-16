import { notifySuccess } from "@/lib/feedback";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { FormFeedback } from "@/components/FormFeedback";
import { CollectionPanel, collectionBlocked } from "@/components/CollectionPanel";
import { useWorkspaceViewState } from "@/lib/hooks/state/useWorkspaceViewState";
import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Library, Plus } from "lucide-react";
import { api, type WorkflowListItem } from "@/lib/data/api";
import {
  Empty,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
  EmptyDescription,
  EmptyContent,
} from "@/components/ui/empty";
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
import { useTableState } from "@/lib/hooks/table/useTableState";
import { DisplayWorkflowModal } from "./-components/DisplayWorkflowModal";
import { WorkflowFormModal } from "./-components/WorkflowFormModal";
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

  const [tab, setTab] = useWorkspaceViewState<WorkflowTab>("workflows:tab", "all");
  const [search, setSearch] = useWorkspaceViewState("workflows:search", "");
  const [practiceFilter, setPracticeFilter] = useWorkspaceViewState<string | null>(
    "workflows:practiceFilter",
    null
  );
  const [typeFilter, setTypeFilter] = useWorkspaceViewState<WorkflowListItem["type"] | null>(
    "workflows:typeFilter",
    null
  );
  const { sorting, setSorting, pagination, setPagination, ready } = useTableState("workflows", {
    defaultSorting: [],
  });
  const [rowSelection, setRowSelection] = useState({});
  const [selected, setSelected] = useState<WorkflowListItem | null>(null);
  const [newOpen, setNewOpen] = useState(false);
  const [removal, setRemoval] = useState<WorkflowListItem[]>([]);
  const [removeError, setRemoveError] = useState<Error | null>(null);

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
  const removeMutation = useMutation({
    mutationFn: async () => {
      setRemoveError(null);
      const results = await Promise.allSettled(
        removal.map((item) =>
          item.isSystem ? api.hideWorkflow(item.id) : api.deleteWorkflow(item.id)
        )
      );
      return removal.filter((_item, index) => results[index]?.status === "rejected");
    },
    onSuccess: (failed) => {
      void invalidate();
      setRowSelection({});
      setRemoval(failed);
      if (failed.length)
        setRemoveError(
          new Error(
            `${failed.length} workflow(s) could not be removed. Successful changes are retained; retry affects only the remaining items.`
          )
        );
      else notifySuccess("Selected workflows removed");
    },
  });

  const pageParams = useTablePageParams({
    query: search,
    sorting,
    pagination,
    setPagination,
    extraDeps: [tab, typeFilter, practiceFilter],
    extraParams: {
      tab,
      type: typeFilter ?? undefined,
      practice: practiceFilter ?? undefined,
      excludePlaybooks: "true",
    },
  });

  const listQuery = useQuery({
    queryKey: queryKeys.workflowsPage(pageParams),
    queryFn: () => api.listWorkflowsPage(pageParams),
    placeholderData: keepPreviousData,
    enabled: ready,
  });
  const { data } = listQuery;
  const inputPending = search.trim() !== pageParams.q;
  const viewQuery = {
    ...listQuery,
    isFetching: listQuery.isFetching || inputPending,
    isPlaceholderData: listQuery.isPlaceholderData || inputPending,
  };
  const blocked = collectionBlocked(viewQuery);
  const rows = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;

  const { data: practices = [] } = useQuery({
    queryKey: queryKeys.workflowPractices({ tab, type: typeFilter, excludePlaybooks: true }),
    queryFn: () =>
      api.listWorkflowPractices({ tab, type: typeFilter ?? undefined, excludePlaybooks: true }),
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
        onDelete: (w) => {
          setRemoveError(null);
          setRemoval([w]);
        },
      }),
    [tab, hideMutation, unhideMutation]
  );

  const { table } = useDataTable({
    columns,
    data: rows,
    getRowId: (w) => w.id,
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

  function bulkRemove() {
    setRemoveError(null);
    setRemoval(selectedRows());
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
        actionsDisabled={blocked}
        tab={tab}
        practices={practices}
        typeFilter={typeFilter}
        practiceFilter={practiceFilter}
        onTypeFilterChange={setTypeFilter}
        onPracticeFilterChange={setPracticeFilter}
        onBulkRemove={bulkRemove}
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
              size="sm"
              disabled={blocked}
              title="New workflow"
              aria-label="New workflow"
              onClick={() => setNewOpen(true)}
            >
              <Plus data-icon="inline-start" />
              New workflow
            </Button>
          }
        />
      }
    >
      <ToolbarTabs tabs={WORKFLOW_TABS} active={tab} onChange={setTab} actions={toolbarActions} />

      <CollectionPanel query={viewQuery} label="Workflows">
        <DataTable
          rowActionColumn="title"
          scrollKey={`workflows:${JSON.stringify(pageParams)}`}
          table={table}
          onRowClick={setSelected}
          empty={<EmptyState tab={tab} onNew={() => setNewOpen(true)} />}
        />

        {rowCount > 0 && <TablePager table={table} />}
      </CollectionPanel>

      <ConfirmDialog
        open={removal.length > 0}
        title={`Remove ${removal.length} workflow(s)?`}
        description="Built-in workflows will be hidden. Custom workflows will be deleted."
        confirmLabel="Remove workflows"
        pending={removeMutation.isPending}
        onCancel={() => {
          setRemoval([]);
          setRemoveError(null);
        }}
        onConfirm={() => removeMutation.mutateAsync()}
        error={removeError}
      />
      <FormFeedback
        error={hideMutation.error || unhideMutation.error}
        title="Workflow action failed"
      />
      <DisplayWorkflowModal workflow={selected} onClose={() => setSelected(null)} />

      <WorkflowFormModal
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
    <Empty>
      <EmptyHeader>
        <EmptyMedia variant="icon">
          <Library />
        </EmptyMedia>
        <EmptyTitle>
          {tab === "custom"
            ? "Custom workflows"
            : tab === "hidden"
              ? "Hidden workflows"
              : "Workflows"}
        </EmptyTitle>
        <EmptyDescription>
          {tab === "custom"
            ? "Create a reusable workflow for your team's document analysis."
            : tab === "hidden"
              ? "Built-in workflows you've hidden appear here. You can unhide them at any time."
              : "Automate document analysis with reusable prompts and review templates."}
        </EmptyDescription>
      </EmptyHeader>
      {tab === "custom" && (
        <EmptyContent>
          <Button size="sm" onClick={onNew}>
            <Plus data-icon="inline-start" />
            Create workflow
          </Button>
        </EmptyContent>
      )}
    </Empty>
  );
}
