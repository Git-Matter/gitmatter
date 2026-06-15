import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  ChevronDown,
  Library,
  MessageSquare,
  Plus,
  Search,
  Sparkles,
  Table2,
  User,
} from "lucide-react";
import { api, type WorkflowListItem } from "@/lib/api";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { cn } from "@/lib/utils";
import { DisplayWorkflowModal } from "./workflows/-components/DisplayWorkflowModal";
import { NewWorkflowModal } from "./workflows/-components/NewWorkflowModal";
import { RowActions } from "./workflows/-components/RowActions";
import { workflowDetailRoute } from "./workflows/-components/workflowRoutes";

export const Route = createFileRoute("/_auth/workflows")({ component: Workflows });

type Tab = "all" | "builtin" | "custom" | "hidden";

const TABS: { id: Tab; label: string }[] = [
  { id: "all", label: "All" },
  { id: "builtin", label: "Built-in" },
  { id: "custom", label: "Custom" },
  { id: "hidden", label: "Hidden" },
];

function typeMeta(type: WorkflowListItem["type"]) {
  return type === "tabular"
    ? { label: "Tabular", Icon: Table2 }
    : { label: "Assistant", Icon: MessageSquare };
}

function Workflows() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
  });

  const [tab, setTab] = useState<Tab>("all");
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

  const visibleBuiltins = workflows.filter((w) => w.isSystem && !w.hidden);
  const hiddenBuiltins = workflows.filter((w) => w.isSystem && w.hidden);
  const custom = workflows.filter((w) => !w.isSystem);
  const byTab =
    tab === "builtin"
      ? visibleBuiltins
      : tab === "custom"
        ? custom
        : tab === "hidden"
          ? hiddenBuiltins
          : [...visibleBuiltins, ...custom];

  const practices = useMemo(
    () => Array.from(new Set(byTab.map((w) => w.practice).filter((p): p is string => !!p))).sort(),
    [byTab]
  );

  const q = search.toLowerCase();
  const filtered = byTab
    .filter((w) => !practiceFilter || w.practice === practiceFilter)
    .filter((w) => !typeFilter || w.type === typeFilter)
    .filter((w) => !q || w.title.toLowerCase().includes(q));

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
    <div className="flex items-center gap-3">
      {selectedIds.length > 0 && (
        <DropdownMenu>
          <DropdownMenuTrigger
            render={
              <button className="flex items-center gap-1 text-xs font-medium text-foreground transition-colors hover:text-foreground/80" />
            }
          >
            Actions
            <ChevronDown className="h-3.5 w-3.5" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {tab === "hidden" ? (
              <DropdownMenuItem onClick={() => void bulkUnhide()}>Unhide</DropdownMenuItem>
            ) : (
              <DropdownMenuItem variant="destructive" onClick={() => void bulkRemove()}>
                Delete
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className={cn(
                "flex items-center gap-1 text-xs font-medium transition-colors",
                typeFilter ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            />
          }
        >
          {typeFilter ? typeMeta(typeFilter).label : "Filter by type"}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuCheckboxItem checked={!typeFilter} onClick={() => setTypeFilter(null)}>
            All Types
          </DropdownMenuCheckboxItem>
          {(["assistant", "tabular"] as const).map((t) => (
            <DropdownMenuCheckboxItem
              key={t}
              checked={typeFilter === t}
              onClick={() => setTypeFilter(t)}
            >
              {typeMeta(t).label}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <button
              className={cn(
                "flex items-center gap-1 text-xs font-medium transition-colors",
                practiceFilter ? "text-foreground" : "text-muted-foreground hover:text-foreground"
              )}
            />
          }
        >
          {practiceFilter ?? "Filter by practice"}
          <ChevronDown className="h-3 w-3" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="max-h-64 overflow-y-auto">
          <DropdownMenuCheckboxItem
            checked={!practiceFilter}
            onClick={() => setPracticeFilter(null)}
          >
            All Practices
          </DropdownMenuCheckboxItem>
          {practices.map((p) => (
            <DropdownMenuCheckboxItem
              key={p}
              checked={practiceFilter === p}
              onClick={() => setPracticeFilter(p)}
            >
              {p}
            </DropdownMenuCheckboxItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
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
      <ToolbarTabs tabs={TABS} active={tab} onChange={setTab} actions={toolbarActions} />

      <div className="min-h-0 flex-1 overflow-auto">
        {/* Header row */}
        <div className="flex h-8 items-center border-b border-border pr-3 text-xs font-medium text-muted-foreground">
          <div className="flex w-[340px] shrink-0 items-center gap-3 pl-1">
            <Checkbox
              checked={allSelected}
              ref={(el) => {
                if (el) el.indeterminate = someSelected;
              }}
              onChange={toggleAll}
            />
            <span>Name</span>
          </div>
          <div className="ml-auto w-28 shrink-0">Type</div>
          <div className="w-40 shrink-0">Practice</div>
          <div className="w-32 shrink-0">Source</div>
          <div className="w-8 shrink-0" />
        </div>

        {filtered.length === 0 ? (
          <EmptyState tab={tab} onNew={() => setNewOpen(true)} />
        ) : (
          filtered.map((wf) => {
            const { label, Icon } = typeMeta(wf.type);
            return (
              <div
                key={wf.id}
                onClick={() => setSelected(wf)}
                className="group flex h-10 cursor-pointer items-center border-b border-border/60 pr-3 transition-colors hover:bg-muted/60"
              >
                <div className="flex w-[340px] shrink-0 items-center gap-3 pl-1">
                  <span onClick={(e) => e.stopPropagation()} className="flex">
                    <Checkbox
                      checked={selectedIds.includes(wf.id)}
                      onChange={() => toggleOne(wf.id)}
                    />
                  </span>
                  <span className="min-w-0 flex-1 truncate text-sm text-foreground">
                    {wf.title}
                  </span>
                </div>
                <div className="ml-auto w-28 shrink-0">
                  <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                    <Icon className="h-3.5 w-3.5" />
                    {label}
                  </span>
                </div>
                <div className="w-40 shrink-0">
                  {wf.practice ? (
                    <span className="text-xs font-medium text-muted-foreground">{wf.practice}</span>
                  ) : (
                    <span className="text-xs text-muted-foreground/40">—</span>
                  )}
                </div>
                <div className="w-32 shrink-0">
                  {wf.isSystem ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <Sparkles className="h-3.5 w-3.5" />
                      Built-in
                    </span>
                  ) : wf.isOwner ? (
                    <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
                      <User className="h-3.5 w-3.5" />
                      Myself
                    </span>
                  ) : (
                    <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
                      <User className="h-3.5 w-3.5 shrink-0" />
                      <span className="truncate">{wf.sharedByName ?? "Shared"}</span>
                    </span>
                  )}
                </div>
                <div className="flex w-8 shrink-0 justify-end" onClick={(e) => e.stopPropagation()}>
                  {wf.isSystem ? (
                    tab === "hidden" ? (
                      <RowActions onUnhide={() => unhideMutation.mutate(wf.id)} />
                    ) : (
                      <RowActions onHide={() => hideMutation.mutate(wf.id)} />
                    )
                  ) : wf.isOwner ? (
                    <RowActions onDelete={() => deleteMutation.mutate(wf.id)} />
                  ) : null}
                </div>
              </div>
            );
          })
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

function EmptyState({ tab, onNew }: { tab: Tab; onNew: () => void }) {
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
