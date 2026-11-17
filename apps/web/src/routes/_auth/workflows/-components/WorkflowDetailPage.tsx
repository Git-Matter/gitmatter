import { UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";
import { CollectionPanel } from "@/components/CollectionPanel";
import { FormFeedback } from "@/components/FormFeedback";
import { useCallback, useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Check, Info, Pencil, Plus, Trash2, Users, X } from "lucide-react";
import { api, type Column, type WorkflowStep } from "@/lib/data/api";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { formatIcon, formatLabel } from "./columnFormats";
import { ConfirmDialog, type ConfirmStatus } from "./ConfirmDialog";
import { HeaderActionsMenu } from "./HeaderActionsMenu";
import { WorkflowShareModal } from "./WorkflowShareModal";
import { ColumnViewModal } from "./ColumnViewModal";
import { ColumnEditModal } from "./ColumnEditModal";
import { WorkflowDetailsModal } from "./WorkflowDetailsModal";
import { WorkflowStepsEditor } from "./WorkflowStepsEditor";

type SaveStatus = "idle" | "saving" | "saved" | "error";

export function WorkflowDetailPage({ id }: { id: string }) {
  const navigate = useNavigate();
  const qc = useQueryClient();

  const detailQuery = useQuery({
    queryKey: ["workflow", id],
    queryFn: () => api.getWorkflow(id),
  });
  const { data, isLoading } = detailQuery;
  const workflow = data?.workflow ?? null;

  const readOnly = !workflow || workflow.isSystem || workflow.allowEdit === false;
  const canShare = !!workflow && !workflow.isSystem && workflow.isOwner;

  const [steps, setSteps] = useState<WorkflowStep[]>([]);
  const [columns, setColumns] = useState<Column[]>([]);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [saveError, setSaveError] = useState<unknown>(null);
  const unsaved = useRef(false);
  const deleted = useRef(false);
  const revision = useRef(0);
  const writeQueue = useRef(Promise.resolve());
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [editingColumn, setEditingColumn] = useState<Column | null>(null);
  const [addingColumn, setAddingColumn] = useState(false);
  const [viewingColumn, setViewingColumn] = useState<Column | null>(null);
  const [shareOpen, setShareOpen] = useState(false);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [deleteError, setDeleteError] = useState<unknown>(null);
  const [deleteStatus, setDeleteStatus] = useState<ConfirmStatus>("idle");

  useEffect(() => {
    if (!workflow || unsaved.current) return;
    setSteps(workflow.steps?.length ? workflow.steps : [{ promptMd: workflow.promptMd ?? "" }]);
    setColumns((workflow.columnsConfig ?? []).slice().sort((a, b) => a.index - b.index));
  }, [workflow]);

  // Rename/details and autosave share response ordering and one authoritative cache update.
  const queueWrite = useCallback(
    (patch: Parameters<typeof api.updateWorkflow>[1]) => {
      const request = writeQueue.current.then(async () => {
        const updated = await api.updateWorkflow(id, patch);
        qc.setQueryData(["workflow", id], updated);
        void qc.invalidateQueries({ queryKey: ["workflows"] });
        return updated;
      });
      writeQueue.current = request.then(
        () => undefined,
        () => undefined
      );
      return request;
    },
    [id, qc]
  );
  const persist = useCallback(
    async (patch: Parameters<typeof api.updateWorkflow>[1], version: number) => {
      try {
        await queueWrite(patch);
        if (revision.current !== version) return;
        unsaved.current = false;
        setSaveError(null);
        setSaveStatus("saved");
      } catch (error) {
        if (revision.current !== version) return;
        setSaveError(error);
        setSaveStatus("error");
      }
    },
    [queueWrite]
  );
  const save = useCallback(
    (nextSteps: WorkflowStep[]) => {
      if (readOnly) return;
      const version = ++revision.current;
      unsaved.current = true;
      setSaveError(null);
      setSaveStatus("saving");
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(
        () => void persist({ steps: nextSteps, promptMd: nextSteps[0]?.promptMd ?? "" }, version),
        800
      );
    },
    [readOnly, persist]
  );
  async function saveColumns(next: Column[]) {
    if (readOnly) return;
    const version = ++revision.current;
    unsaved.current = true;
    setSaveError(null);
    setSaveStatus("saving");
    await persist({ columnsConfig: next }, version);
  }
  function handleStepsChange(next: WorkflowStep[]) {
    setSteps(next);
    save(next);
  }

  function reindex(list: Column[]): Column[] {
    return list.map((c, i) => ({ ...c, index: i }));
  }

  function handleColumnSaved(updated: Column) {
    const exists = columns.some((c) => c.index === updated.index);
    const next = exists
      ? columns.map((c) => (c.index === updated.index ? updated : c))
      : [...columns, updated];
    const reindexed = reindex(next);
    setColumns(reindexed);
    void saveColumns(reindexed);
    setEditingColumn(null);
    setAddingColumn(false);
  }

  function handleColumnDeleted(index: number) {
    const next = reindex(columns.filter((c) => c.index !== index));
    setColumns(next);
    void saveColumns(next);
    setEditingColumn(null);
  }

  async function handleDeleteWorkflow() {
    if (readOnly || !workflow?.isOwner) return;
    setDeleteStatus("loading");
    setDeleteError(null);
    try {
      await api.deleteWorkflow(id);
      deleted.current = true;
      void qc.invalidateQueries({ queryKey: ["workflows"] });
      setDeleteStatus("complete");
      setTimeout(() => void navigate({ to: "/workflows" }), 500);
    } catch (error) {
      setDeleteError(error);
      setDeleteStatus("idle");
    }
  }

  async function handleDetailsSave(values: { title: string }) {
    if (!workflow || readOnly) return;
    await queueWrite({ title: values.title });
  }

  const headerActions: React.ReactNode[] = [];
  if (saveStatus !== "idle") {
    headerActions.push(
      <span
        key="status"
        role="status"
        className="inline-flex h-7 items-center gap-1.5 px-1 text-sm text-muted-foreground"
      >
        {saveStatus === "saved" && <Check className="h-3.5 w-3.5 text-green-600" />}
        {saveStatus === "saving" ? "Saving…" : saveStatus === "error" ? "Not saved" : "Saved"}
      </span>
    );
  }
  if (canShare) {
    headerActions.push(
      <Button
        key="share"
        variant="ghost"
        size="icon-sm"
        title="Share workflow"
        aria-label="Share workflow"
        onClick={() => setShareOpen(true)}
      >
        <Users className="h-4 w-4" />
      </Button>
    );
  }
  if (!readOnly && workflow) {
    headerActions.push(
      <HeaderActionsMenu
        key="menu"
        title="Workflow actions"
        items={[
          { label: "Rename", icon: Pencil, onSelect: () => setDetailsOpen(true) },
          { label: "Workflow Details", icon: Info, onSelect: () => setDetailsOpen(true) },
          {
            label: "Delete",
            icon: Trash2,
            variant: "danger",
            disabled: !workflow.isOwner || saveStatus === "saving",
            onSelect: () => {
              setDeleteStatus("idle");
              setDeleteOpen(true);
            },
          },
        ]}
      />
    );
  }

  const exitGuard = (
    <UnsavedNavigationGuard
      isDirty={() => !deleted.current && unsaved.current}
      saving={saveStatus === "saving"}
      onDiscard={() => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
        unsaved.current = false;
        setSaveError(null);
        setSaveStatus("idle");
        if (workflow) {
          setSteps(
            workflow.steps?.length ? workflow.steps : [{ promptMd: workflow.promptMd ?? "" }]
          );
          setColumns(workflow.columnsConfig ?? []);
        }
        void qc.invalidateQueries({ queryKey: ["workflow", id] });
      }}
    />
  );
  if (detailQuery.isPending || detailQuery.isError)
    return (
      <>
        {exitGuard}
        <CollectionPanel query={detailQuery} label="Workflow">
          <Button onClick={() => void navigate({ to: "/workflows" })}>Back to workflows</Button>
        </CollectionPanel>
      </>
    );
  return (
    <PageShell
      mode="fill"
      header={
        <PageHeader
          breadcrumbs={[
            { label: "Workflows", to: "/workflows" },
            { label: workflow?.title ?? (isLoading ? "…" : "Workflow") },
          ]}
          actions={headerActions.length ? headerActions : undefined}
        />
      }
    >
      {exitGuard}
      <FormFeedback error={saveError} title="Workflow changes were not saved" />
      {!!saveError && (
        <Button
          variant="outline"
          className="self-start"
          onClick={() => (workflow?.type === "assistant" ? save(steps) : void saveColumns(columns))}
        >
          Retry workflow save
        </Button>
      )}
      {!workflow ? (
        <p className="py-24 text-center text-sm text-muted-foreground">
          {isLoading ? "Loading…" : "Workflow not found."}
        </p>
      ) : workflow.type === "assistant" ? (
        <WorkflowStepsEditor
          value={steps}
          onChange={readOnly ? undefined : handleStepsChange}
          readOnly={readOnly}
        />
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3">
          <div className="flex h-8 shrink-0 items-center justify-between">
            {!readOnly ? (
              <button
                onClick={() => setAddingColumn(true)}
                className="flex items-center gap-1.5 text-xs text-muted-foreground transition-colors hover:text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                Add Column
              </button>
            ) : (
              <span className="text-xs font-medium text-muted-foreground">Read-only</span>
            )}
          </div>

          <div className="min-h-0 flex-1 overflow-y-auto rounded-md border border-border">
            <div className="flex h-8 items-center border-b border-border px-3 text-xs font-medium text-muted-foreground">
              <span className="w-[40%]">Column Title</span>
              <span className="w-36">Format</span>
              <span className="flex-1">Prompt</span>
              {!readOnly && <span className="w-8" />}
            </div>
            {columns.length === 0 ? (
              <div className="flex flex-col items-center gap-2 py-16">
                <Plus className="h-7 w-7 text-muted-foreground/40" />
                <p className="font-serif text-lg">Columns</p>
                <p className="max-w-xs text-center text-xs text-muted-foreground">
                  Add columns to define what this tabular review workflow extracts from each
                  document.
                </p>
              </div>
            ) : (
              columns.map((col) => {
                const FormatIcon = formatIcon(col.format ?? "text");
                return (
                  <div
                    key={col.index}
                    onClick={() => (readOnly ? setViewingColumn(col) : setEditingColumn(col))}
                    className="group flex h-10 cursor-pointer items-center border-b border-border px-3 transition-colors last:border-b-0 hover:bg-muted/60"
                  >
                    <Button
                      variant="link"
                      className="h-auto min-h-6 w-[40%] justify-start p-0"
                      onClick={(event) => {
                        event.stopPropagation();
                        if (readOnly) setViewingColumn(col);
                        else setEditingColumn(col);
                      }}
                    >
                      {col.name}
                    </Button>
                    <span className="flex w-36 items-center gap-1.5 text-xs text-muted-foreground">
                      <FormatIcon className="h-3.5 w-3.5" />
                      {formatLabel(col.format ?? "text")}
                    </span>
                    <span className="flex-1 truncate pr-2 text-xs text-muted-foreground">
                      {col.prompt}
                    </span>
                    {!readOnly && (
                      <span className="flex w-8 justify-end">
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            handleColumnDeleted(col.index);
                          }}
                          aria-label={`Remove question ${col.name}`}
                          className="p-1 text-muted-foreground/50 transition-colors hover:text-destructive"
                        >
                          <X className="h-3.5 w-3.5" />
                        </button>
                      </span>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
      )}

      {workflow && (
        <WorkflowDetailsModal
          open={detailsOpen}
          workflow={workflow}
          canEdit={!readOnly}
          canShare={canShare}
          onClose={() => setDetailsOpen(false)}
          onSave={handleDetailsSave}
          onShareWorkflow={() => {
            setDetailsOpen(false);
            setShareOpen(true);
          }}
        />
      )}
      {shareOpen && workflow && (
        <WorkflowShareModal
          workflowId={id}
          workflowName={workflow.title}
          onClose={() => setShareOpen(false)}
        />
      )}
      <ConfirmDialog
        open={deleteOpen}
        title="Delete workflow?"
        message="This workflow will be permanently deleted."
        confirmLabel="Delete"
        confirmStatus={deleteStatus}
        onConfirm={handleDeleteWorkflow}
        error={deleteError}
        onCancel={() => {
          if (deleteStatus === "loading") return;
          setDeleteOpen(false);
          setDeleteStatus("idle");
        }}
      />
      {viewingColumn && (
        <ColumnViewModal column={viewingColumn} onClose={() => setViewingColumn(null)} />
      )}
      {addingColumn && (
        <ColumnEditModal
          column={{ index: columns.length, name: "", prompt: "", format: "text" }}
          onClose={() => setAddingColumn(false)}
          onSave={handleColumnSaved}
          onDelete={() => setAddingColumn(false)}
        />
      )}
      {editingColumn && (
        <ColumnEditModal
          column={editingColumn}
          onClose={() => setEditingColumn(null)}
          onSave={handleColumnSaved}
          onDelete={() => handleColumnDeleted(editingColumn.index)}
        />
      )}
    </PageShell>
  );
}
