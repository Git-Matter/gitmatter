import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Library, Plus, Search } from "lucide-react";
import { api, type WorkflowListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { DisplayWorkflowModal } from "./workflows/-components/DisplayWorkflowModal";
import { NewWorkflowModal } from "./workflows/-components/NewWorkflowModal";
import { WorkflowListHeader } from "./workflows/-components/WorkflowListHeader";
import { WorkflowRow } from "./workflows/-components/WorkflowRow";
import { WorkflowToolbarActions } from "./workflows/-components/WorkflowToolbarActions";
import { WORKFLOW_TABS, type WorkflowTab } from "./workflows/-components/workflowList";
import { workflowDetailRoute } from "./workflows/-components/workflowRoutes";
import { useWorkflowFilters } from "./workflows/-components/useWorkflowFilters";

export const Route = createFileRoute("/_auth/workflows")({ component: Workflows });

function Workflows() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
  });

  const [tab, setTab] = useState<WorkflowTab>("all");
  const [search, setSearch] = useState("");
  const [practiceFilter, setPracticeFilter] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<WorkflowListItem["type"] | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [selected, setSelected] = useState<WorkflowListItem | null>(null);
  const [newOpen, setNewOpen] = useState(false);

  const invalidate = () => qc.invalidateQueries({ queryKey: ["workflows"] });

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

  const { visibleBuiltins, custom, filtered, practices } = useWorkflowFilters({
    workflows,
    tab,
    search,
    practiceFilter,
    typeFilter,
  });

  useEffect(() => {
    setSelectedIds([]);
  }, [tab, practiceFilter, typeFilter]);

  const allSelected = filtered.length > 0 && filtered.every((w) => selectedIds.includes(w.id));
  const someSelected = !allSelected && filtered.some((w) => selectedIds.includes(w.id));

  function toggleAll() {
    setSelectedIds(allSelected ? [] : filtered.map((w) => w.id));
  }
  function toggleOne(id: string) {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function bulkRemove() {
    const ids = [...selectedIds];
    setSelectedIds([]);
    const builtinIds = ids.filter((id) => workflows.find((w) => w.id === id)?.isSystem);
    const customIds = ids.filter((id) => !workflows.find((w) => w.id === id)?.isSystem);
    await Promise.all([
      ...builtinIds.map((id) => api.hideWorkflow(id).catch(() => {})),
      ...customIds.map((id) => api.deleteWorkflow(id).catch(() => {})),
    ]);
    void invalidate();
  }
  async function bulkUnhide() {
    const ids = [...selectedIds];
    setSelectedIds([]);
    await Promise.all(ids.map((id) => api.unhideWorkflow(id).catch(() => {})));
    void invalidate();
  }

  const toolbarActions = (
    <WorkflowToolbarActions
      selectedCount={selectedIds.length}
      tab={tab}
      practices={practices}
      typeFilter={typeFilter}
      practiceFilter={practiceFilter}
      onTypeFilterChange={setTypeFilter}
      onPracticeFilterChange={setPracticeFilter}
      onBulkRemove={() => void bulkRemove()}
      onBulkUnhide={() => void bulkUnhide()}
    />
  );

  return (
    <PageShell
      mode="fill"
      bodyClassName="gap-stack"
      header={
        <PageHeader
          title="Workflows"
          actions={[
            <div
              key="search"
              className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5"
            >
              <Search className="size-4 shrink-0 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search workflows…"
                className="h-7 w-48 bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              />
            </div>,
            <Button
              key="new"
              variant="outline"
              size="icon-sm"
              className="rounded-full"
              title="New workflow"
              aria-label="New workflow"
              onClick={() => setNewOpen(true)}
            >
              <Plus className="size-4" />
            </Button>,
          ]}
        />
      }
    >
      <ToolbarTabs tabs={WORKFLOW_TABS} active={tab} onChange={setTab} actions={toolbarActions} />

      <div className="min-h-0 flex-1 overflow-auto">
        <WorkflowListHeader
          allSelected={allSelected}
          someSelected={someSelected}
          onToggleAll={toggleAll}
        />

        {filtered.length === 0 ? (
          <EmptyState tab={tab} onNew={() => setNewOpen(true)} />
        ) : (
          filtered.map((workflow) => (
            <WorkflowRow
              key={workflow.id}
              workflow={workflow}
              tab={tab}
              selected={selectedIds.includes(workflow.id)}
              onOpen={() => setSelected(workflow)}
              onToggle={() => toggleOne(workflow.id)}
              onHide={() => hideMutation.mutate(workflow.id)}
              onUnhide={() => unhideMutation.mutate(workflow.id)}
              onDelete={() => deleteMutation.mutate(workflow.id)}
            />
          ))
        )}
      </div>

      <DisplayWorkflowModal
        workflows={[...visibleBuiltins, ...custom]}
        workflow={selected}
        onClose={() => setSelected(null)}
      />

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
