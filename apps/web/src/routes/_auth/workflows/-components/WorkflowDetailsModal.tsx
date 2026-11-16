import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { FieldDescription } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { type ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { Users } from "lucide-react";
import { type WorkflowDetail } from "@/lib/data/api";
import { useSession } from "@/lib/auth/auth-client";
import { WorkflowModal } from "./WorkflowModal";

type DetailWorkflow = WorkflowDetail["workflow"];

interface WorkflowDetailsModalProps {
  open: boolean;
  workflow: DetailWorkflow | null;
  canEdit: boolean;
  canShare: boolean;
  onClose: () => void;
  onSave: (values: { title: string }) => Promise<void>;
  onShareWorkflow: () => void;
}

export function WorkflowDetailsModal({
  open,
  workflow,
  canEdit,
  canShare,
  onClose,
  onSave,
  onShareWorkflow,
}: WorkflowDetailsModalProps) {
  const { data: session } = useSession();
  const titleForm = useWorkflowTitleForm({ open, workflow, canEdit, onSave });

  if (!workflow) return null;

  const labels = getWorkflowLabels(workflow, {
    currentUserName: session?.user.name,
    currentUserEmail: session?.user.email,
  });

  return (
    <WorkflowModal
      open={open}
      onClose={onClose}
      dirty={canEdit && !titleForm.saved && titleForm.titleDraft !== workflow.title}
      saving={titleForm.saving}
      size="lg"
      breadcrumbs={["Workflows", workflow.title, "Details"]}
      secondaryAction={
        canShare
          ? {
              label: "Share Workflow",
              icon: <Users className="h-4 w-4" />,
              onClick: onShareWorkflow,
            }
          : undefined
      }
      footerStatus={
        titleForm.error ? (
          <span className="text-sm text-destructive">{titleForm.error}</span>
        ) : titleForm.saved ? (
          <span className="text-sm text-muted-foreground">Updated</span>
        ) : null
      }
      primaryAction={
        canEdit
          ? {
              label: titleForm.saving ? "Updating..." : "Update",
              onClick: () => void titleForm.save(),
              disabled: titleForm.saveDisabled,
            }
          : undefined
      }
      cancelAction={canEdit ? undefined : false}
    >
      <div className="flex flex-col gap-5 py-1">
        {canEdit && (
          <FieldDescription id="workflow-details-hint">
            Change the workflow name to enable Update. The name cannot be empty.
          </FieldDescription>
        )}
        <div className="flex flex-col gap-3">
          <label
            htmlFor="workflow-details-title"
            className="text-xs font-medium text-muted-foreground"
          >
            Workflow Name
          </label>
          <Input
            id="workflow-details-title"
            aria-describedby={canEdit ? "workflow-details-hint" : undefined}
            value={titleForm.titleDraft}
            onChange={(event) => titleForm.setTitle(event.target.value)}
            disabled={!canEdit || titleForm.saving}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none focus:border-ring disabled:cursor-not-allowed disabled:text-muted-foreground"
          />
        </div>

        <div className="divide-y divide-border text-sm">
          <DetailRow label="Type" value={labels.type} />
          <DetailRow label="Ownership" value={labels.ownership} />
          <DetailRow label="Owner" value={labels.owner} />
        </div>
      </div>
    </WorkflowModal>
  );
}

interface UseWorkflowTitleFormArgs {
  open: boolean;
  workflow: DetailWorkflow | null;
  canEdit: boolean;
  onSave: (values: { title: string }) => Promise<void>;
}

function useWorkflowTitleForm({ open, workflow, canEdit, onSave }: UseWorkflowTitleFormArgs) {
  const [titleDraft, setTitleDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const seeded = useRef<string | null>(null);
  useEffect(() => {
    if (!open) {
      seeded.current = null;
      return;
    }
    if (!workflow || seeded.current === workflow.id) return;
    seeded.current = workflow.id;
    setTitleDraft(workflow.title);
    setSaved(false);
    setError(null);
  }, [open, workflow]);

  const trimmedTitle = titleDraft.trim();
  const hasChanges = useMemo(
    () => (workflow ? trimmedTitle !== workflow.title : false),
    [trimmedTitle, workflow]
  );
  const saveDisabled = saving || !canEdit || !hasChanges || !trimmedTitle;

  function setTitle(value: string) {
    setTitleDraft(value);
    setSaved(false);
    setError(null);
  }

  async function save() {
    if (saveDisabled) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      const actionOrigin = captureActionOrigin();
      await onSave({ title: trimmedTitle });
      setSaved(true);
      notifySuccess("Workflow details updated", actionOrigin);
    } catch {
      setError("Could not update workflow details.");
    } finally {
      setSaving(false);
    }
  }

  return {
    titleDraft,
    setTitle,
    saving,
    saved,
    error,
    save,
    saveDisabled,
  };
}

function getWorkflowLabels(
  workflow: DetailWorkflow,
  user: { currentUserName?: string | null; currentUserEmail?: string | null }
) {
  const ownerName = user.currentUserName?.trim();
  const ownerEmail = user.currentUserEmail?.trim();

  return {
    type: workflow.type === "tabular" ? "Tabular" : "Assistant",
    ownership: getOwnershipLabel(workflow),
    owner:
      workflow.isOwner === false
        ? workflow.sharedByName?.trim() || "Unknown"
        : ownerName || ownerEmail || "You",
  };
}

function getOwnershipLabel(workflow: DetailWorkflow): string {
  if (workflow.isSystem) return "Built-in";
  if (workflow.isOwner === false) return "Shared with you";
  if (workflow.shareCount > 0) return "Shared";
  return "Private";
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{value}</span>
    </div>
  );
}
