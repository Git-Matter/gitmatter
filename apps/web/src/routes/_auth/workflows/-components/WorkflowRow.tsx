import { Sparkles, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { WorkflowListItem } from "@/lib/api";
import { RowActions } from "./RowActions";
import type { WorkflowTab } from "./workflowList";
import { workflowTypeMeta } from "./workflowList";

export function WorkflowRow({
  workflow,
  tab,
  selected,
  onOpen,
  onToggle,
  onHide,
  onUnhide,
  onDelete,
}: {
  workflow: WorkflowListItem;
  tab: WorkflowTab;
  selected: boolean;
  onOpen: () => void;
  onToggle: () => void;
  onHide: () => void;
  onUnhide: () => void;
  onDelete: () => void;
}) {
  const { label, Icon } = workflowTypeMeta(workflow.type);

  return (
    <div
      onClick={onOpen}
      className="group flex h-10 cursor-pointer items-center border-b border-border/60 pr-3 transition-colors hover:bg-muted/60"
    >
      <div className="flex w-[340px] shrink-0 items-center gap-3 pl-1">
        <span onClick={(e) => e.stopPropagation()} className="flex">
          <Checkbox checked={selected} onChange={onToggle} />
        </span>
        <span className="min-w-0 flex-1 truncate text-sm text-foreground">{workflow.title}</span>
      </div>
      <div className="ml-auto w-28 shrink-0">
        <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
          <Icon className="h-3.5 w-3.5" />
          {label}
        </span>
      </div>
      <div className="w-40 shrink-0">
        {workflow.practice ? (
          <span className="text-xs font-medium text-muted-foreground">{workflow.practice}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        )}
      </div>
      <div className="w-32 shrink-0">
        {workflow.isSystem ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Sparkles className="h-3.5 w-3.5" />
            Built-in
          </span>
        ) : workflow.isOwner ? (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <User className="h-3.5 w-3.5" />
            Myself
          </span>
        ) : (
          <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{workflow.sharedByName ?? "Shared"}</span>
          </span>
        )}
      </div>
      <div className="flex w-8 shrink-0 justify-end" onClick={(e) => e.stopPropagation()}>
        {workflow.isSystem ? (
          tab === "hidden" ? (
            <RowActions onUnhide={onUnhide} />
          ) : (
            <RowActions onHide={onHide} />
          )
        ) : workflow.isOwner ? (
          <RowActions onDelete={onDelete} />
        ) : null}
      </div>
    </div>
  );
}
