import { type ReactNode, useEffect, useState } from "react";
import { api, type WorkflowListItem } from "@/lib/api";
import { WorkflowModal } from "./WorkflowModal";
import { WorkflowPickerContent } from "./WorkflowPickerContent";

interface WorkflowPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (workflow: WorkflowListItem) => Promise<void> | void;
  workflowType: WorkflowListItem["type"];
  breadcrumbs: ReactNode[];
  primaryLabel?: string;
  selectingLabel?: string;
  selecting?: boolean;
  closeOnSelect?: boolean;
  initialWorkflowId?: string;
  disabledWorkflow?: (workflow: WorkflowListItem) => boolean;
}

export function WorkflowPickerModal({
  open,
  onClose,
  onSelect,
  workflowType,
  breadcrumbs,
  primaryLabel = "Use",
  selectingLabel,
  selecting = false,
  closeOnSelect = true,
  initialWorkflowId,
  disabledWorkflow,
}: WorkflowPickerModalProps) {
  const [workflows, setWorkflows] = useState<WorkflowListItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState<WorkflowListItem | null>(null);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setLoading(true);
    setSelected(null);
    setSearch("");
    api
      .listWorkflows()
      .then((all) => {
        if (cancelled) return;
        const ofType = all.filter((w) => w.type === workflowType && !w.hidden);
        setWorkflows(ofType);
        if (initialWorkflowId) {
          setSelected(ofType.find((w) => w.id === initialWorkflowId) ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setWorkflows([]);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [initialWorkflowId, open, workflowType]);

  const selectionDisabled =
    !selected || selecting || (selected ? (disabledWorkflow?.(selected) ?? false) : true);
  const resolvedPrimaryLabel = selecting && selectingLabel ? selectingLabel : primaryLabel;

  function handleClose() {
    setSelected(null);
    setSearch("");
    onClose();
  }

  async function handleSelect() {
    if (!selected || selectionDisabled) return;
    await onSelect(selected);
    if (closeOnSelect) handleClose();
  }

  return (
    <WorkflowModal
      open={open}
      onClose={handleClose}
      size={selected ? "xl" : "lg"}
      breadcrumbs={breadcrumbs}
      primaryAction={{
        label: resolvedPrimaryLabel,
        onClick: () => void handleSelect(),
        disabled: selectionDisabled,
      }}
    >
      <WorkflowPickerContent
        workflows={workflows}
        selected={selected}
        onSelect={setSelected}
        search={search}
        onSearchChange={setSearch}
        loading={loading}
        workflowType={workflowType}
        previewMode={workflowType === "tabular" ? "columns" : "prompt"}
        disabledWorkflow={disabledWorkflow}
      />
    </WorkflowModal>
  );
}
