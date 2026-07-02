import { useEffect, useState } from "react";
import { MessageSquare, Table2 } from "lucide-react";
import { api, type WorkflowListItem } from "@/lib/data/api";
import { cn } from "@/lib/util/utils";
import { PracticeAreaPicker } from "@/components/PracticeAreaPicker";
import { WorkflowModal } from "./WorkflowModal";

interface Props {
  open: boolean;
  onClose: () => void;
  onCreated: (workflow: { id: string; type: "assistant" | "tabular" }) => void;
  editWorkflow?: WorkflowListItem;
  onUpdated?: (workflow: WorkflowListItem) => void;
}

export function WorkflowFormModal(props: Props) {
  const form = useWorkflowForm(props);
  const formId = "workflow-modal-form";

  return (
    <WorkflowModal
      open={props.open}
      onClose={props.onClose}
      size="lg"
      breadcrumbs={["Workflows", form.isEditing ? "Edit workflow" : "New workflow"]}
      primaryAction={{
        label: getPrimaryLabel(form.loading, form.isEditing),
        type: "submit",
        form: formId,
        disabled: form.saveDisabled,
      }}
    >
      <form id={formId} onSubmit={form.submit} className="flex min-h-0 flex-1 flex-col py-1">
        <WorkflowNameField title={form.title} onChange={form.setTitle} />

        {!form.isEditing ? <WorkflowTypeField type={form.type} onChange={form.setType} /> : null}

        <PracticeField value={form.practice} onChange={form.setPractice} />

        {form.error ? <p className="mt-4 text-sm text-destructive">{form.error}</p> : null}
      </form>
    </WorkflowModal>
  );
}

function useWorkflowForm({ open, onClose, onCreated, editWorkflow, onUpdated }: Props) {
  const [title, setTitle] = useState("");
  const [type, setType] = useState<"assistant" | "tabular">("assistant");
  const [practice, setPractice] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!editWorkflow;
  const saveDisabled = loading || !title.trim();

  useEffect(() => {
    if (!open) return;
    if (editWorkflow) {
      setTitle(editWorkflow.title);
      setType(editWorkflow.type === "playbook" ? "assistant" : editWorkflow.type);
      setPractice(editWorkflow.practice ?? null);
    } else {
      setTitle("");
      setType("assistant");
      setPractice(null);
    }
    setError("");
  }, [open, editWorkflow]);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!title.trim()) return;

    setLoading(true);
    setError("");
    try {
      if (isEditing && editWorkflow) {
        const updated = await api.updateWorkflow(editWorkflow.id, {
          title: title.trim(),
          practice,
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
          practice,
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

  return {
    error,
    isEditing,
    loading,
    practice,
    saveDisabled,
    setPractice,
    setTitle,
    setType,
    submit,
    title,
    type,
  };
}

function getPrimaryLabel(loading: boolean, isEditing: boolean) {
  if (loading) return isEditing ? "Saving..." : "Creating...";
  return isEditing ? "Save changes" : "Create workflow";
}

function WorkflowNameField({
  title,
  onChange,
}: {
  title: string;
  onChange: (title: string) => void;
}) {
  return (
    <input
      type="text"
      value={title}
      onChange={(event) => onChange(event.target.value)}
      placeholder="Workflow name"
      className="w-full bg-transparent font-serif text-2xl text-foreground placeholder:text-muted-foreground/50 focus:outline-none"
      autoFocus
    />
  );
}

function WorkflowTypeField({
  type,
  onChange,
}: {
  type: "assistant" | "tabular";
  onChange: (type: "assistant" | "tabular") => void;
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-sm font-medium text-muted-foreground">Type</p>
      <div className="flex items-center gap-2">
        <TypeChip active={type === "assistant"} onClick={() => onChange("assistant")}>
          <MessageSquare className="h-3 w-3" />
          Assistant
        </TypeChip>
        <TypeChip active={type === "tabular"} onClick={() => onChange("tabular")}>
          <Table2 className="h-3 w-3" />
          Tabular
        </TypeChip>
      </div>
    </div>
  );
}

function PracticeField({
  value,
  onChange,
}: {
  value: string | null;
  onChange: (practice: string | null) => void;
}) {
  return (
    <div className="mt-5">
      <p className="mb-2 text-sm font-medium text-muted-foreground">Practice Area</p>
      <PracticeAreaPicker value={value} onChange={onChange} />
    </div>
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
