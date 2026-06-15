import { useEffect, useRef, useState } from "react";
import { MessageSquare, Table2 } from "lucide-react";
import { api, type WorkflowListItem } from "@/lib/api";
import { cn } from "@/lib/utils";
import { PRACTICE_OPTIONS } from "./practices";
import { WorkflowModal } from "./WorkflowModal";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (workflow: { id: string; type: "assistant" | "tabular" }) => void;
  editWorkflow?: WorkflowListItem;
  onUpdated?: (workflow: WorkflowListItem) => void;
}

export function NewWorkflowModal({ open, onClose, onCreated, editWorkflow, onUpdated }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"assistant" | "tabular">("assistant");
  const [practice, setPractice] = useState<string>("");
  const [customPractice, setCustomPractice] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const customInputRef = useRef<HTMLInputElement>(null);

  const isEditing = !!editWorkflow;
  const isOthers = practice === "Others";
  const effectivePractice = isOthers ? customPractice.trim() || null : practice || null;
  const formId = "workflow-modal-form";

  useEffect(() => {
    if (!open) return;
    if (editWorkflow) {
      setTitle(editWorkflow.title);
      setType(editWorkflow.type);
      const saved = editWorkflow.practice ?? "";
      const isKnown = (PRACTICE_OPTIONS as readonly string[]).includes(saved);
      if (!isKnown && saved) {
        setPractice("Others");
        setCustomPractice(saved);
      } else {
        setPractice(saved);
        setCustomPractice("");
      }
    } else {
      setTitle("");
      setType("assistant");
      setPractice("");
      setCustomPractice("");
    }
    setError("");
  }, [open, editWorkflow]);

  useEffect(() => {
    if (isOthers) customInputRef.current?.focus();
  }, [isOthers]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!title.trim()) return;
    setLoading(true);
    setError("");
    try {
      if (isEditing && editWorkflow) {
        const updated = await api.updateWorkflow(editWorkflow.id, {
          title: title.trim(),
          practice: effectivePractice,
        });
        onUpdated?.({
          ...editWorkflow,
          title: updated.workflow.title,
          practice: updated.workflow.practice,
        });
      } else {
        const created = await api.createWorkflow({
          title: title.trim(),
          type,
          practice: effectivePractice,
        });
        onCreated({ id: created.workflow.id, type: created.workflow.type });
      }
      onClose();
    } catch (err) {
      setError((err as Error).message || `Failed to ${isEditing ? "update" : "create"} workflow`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <WorkflowModal
      open={open}
      onClose={onClose}
      size="lg"
      breadcrumbs={["Workflows", isEditing ? "Edit workflow" : "New workflow"]}
      primaryAction={{
        label: loading
          ? isEditing
            ? "Saving…"
            : "Creating…"
          : isEditing
            ? "Save changes"
            : "Create workflow",
        type: "submit",
        form: formId,
        disabled: !title.trim() || loading,
      }}
    >
      <form id={formId} onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col py-1">
        <input
          type="text"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Workflow name"
          className="w-full bg-transparent font-serif text-2xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
          autoFocus
        />

        {!isEditing && (
          <div className="mt-5">
            <p className="mb-2 text-sm font-medium text-muted-foreground">Type</p>
            <div className="flex items-center gap-2">
              <TypeChip active={type === "assistant"} onClick={() => setType("assistant")}>
                <MessageSquare className="h-3 w-3" />
                Assistant
              </TypeChip>
              <TypeChip active={type === "tabular"} onClick={() => setType("tabular")}>
                <Table2 className="h-3 w-3" />
                Tabular
              </TypeChip>
            </div>
          </div>
        )}

        <div className="mt-5">
          <p className="mb-2 text-sm font-medium text-muted-foreground">Practice Area</p>
          <div className="flex flex-wrap gap-2">
            {PRACTICE_OPTIONS.map((p) => (
              <TypeChip
                key={p}
                active={practice === p}
                onClick={() => setPractice(practice === p ? "" : p)}
              >
                {p}
              </TypeChip>
            ))}
          </div>
          {isOthers && (
            <input
              ref={customInputRef}
              type="text"
              value={customPractice}
              onChange={(e) => setCustomPractice(e.target.value)}
              placeholder="Enter practice area…"
              className="mt-3 w-full rounded-md border border-input bg-background px-3 py-1.5 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none"
            />
          )}
        </div>

        {error && <p className="mt-4 text-sm text-destructive">{error}</p>}
      </form>
    </WorkflowModal>
  );
}

function TypeChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1 text-xs transition-colors",
        active
          ? "border-foreground bg-foreground text-background"
          : "border-input text-muted-foreground hover:bg-muted"
      )}
    >
      {children}
    </button>
  );
}
