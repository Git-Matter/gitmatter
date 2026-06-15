import { type ReactNode, useEffect, useMemo, useState } from "react";
import { Users } from "lucide-react";
import { api, type WorkflowDetail } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
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
  const [titleDraft, setTitleDraft] = useState("");
  const [shareCount, setShareCount] = useState<number | null>(null);
  const [sharesLoading, setSharesLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open || !workflow) return;
    setTitleDraft(workflow.title);
    setShareCount(null);
    setSaved(false);
    setError(null);
  }, [open, workflow]);

  useEffect(() => {
    if (!open || !workflow || !canShare) {
      setSharesLoading(false);
      return;
    }
    let cancelled = false;
    setSharesLoading(true);
    api
      .listWorkflowShares(workflow.id)
      .then((shares) => !cancelled && setShareCount(shares.length))
      .catch(() => !cancelled && setShareCount(null))
      .finally(() => !cancelled && setSharesLoading(false));
    return () => {
      cancelled = true;
    };
  }, [canShare, open, workflow]);

  const trimmedTitle = titleDraft.trim();
  const hasChanges = useMemo(
    () => (workflow ? trimmedTitle !== workflow.title : false),
    [trimmedTitle, workflow]
  );

  if (!workflow) return null;

  const typeLabel = workflow.type === "tabular" ? "Tabular" : "Assistant";
  const ownershipLabel = workflow.isSystem
    ? "Built-in"
    : workflow.isOwner === false
      ? "Shared with you"
      : shareCount && shareCount > 0
        ? "Shared"
        : "Private";
  const ownerLabel =
    workflow.isOwner === false
      ? workflow.sharedByName?.trim() || "Unknown"
      : session?.user.name?.trim() || session?.user.email?.trim() || "You";

  async function handleSave() {
    if (!canEdit || saving || !hasChanges || !trimmedTitle) return;
    setSaving(true);
    setSaved(false);
    setError(null);
    try {
      await onSave({ title: trimmedTitle });
      setSaved(true);
    } catch {
      setError("Could not update workflow details.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkflowModal
      open={open}
      onClose={onClose}
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
        error ? (
          <span className="text-sm text-destructive">{error}</span>
        ) : saved ? (
          <span className="text-sm text-muted-foreground">Updated</span>
        ) : null
      }
      primaryAction={
        canEdit
          ? {
              label: saving ? "Updating..." : "Update",
              onClick: () => void handleSave(),
              disabled: saving || !hasChanges || !trimmedTitle,
            }
          : undefined
      }
      cancelAction={canEdit ? undefined : false}
    >
      <div className="flex flex-col gap-5 py-1">
        <div className="flex flex-col gap-3">
          <label
            htmlFor="workflow-details-title"
            className="text-xs font-medium text-muted-foreground"
          >
            Workflow Name
          </label>
          <input
            id="workflow-details-title"
            value={titleDraft}
            onChange={(e) => {
              setTitleDraft(e.target.value);
              setSaved(false);
              setError(null);
            }}
            disabled={!canEdit || saving}
            className="h-9 w-full rounded-md border border-input bg-background px-3 text-sm text-foreground transition-colors outline-none focus:border-ring disabled:cursor-not-allowed disabled:text-muted-foreground"
          />
        </div>

        <div className="divide-y divide-border text-sm">
          <DetailRow label="Type" value={typeLabel} />
          <DetailRow
            label="Ownership"
            value={
              sharesLoading ? (
                <span className="inline-block h-4 w-14 animate-pulse rounded bg-muted" />
              ) : (
                ownershipLabel
              )
            }
          />
          <DetailRow label="Owner" value={ownerLabel} />
        </div>
      </div>
    </WorkflowModal>
  );
}

function DetailRow({ label, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-4 py-3">
      <span className="text-muted-foreground">{label}</span>
      <span className="min-w-0 truncate text-right text-foreground">{value}</span>
    </div>
  );
}
