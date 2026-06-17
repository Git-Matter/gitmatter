import { createColumnHelper } from "@tanstack/react-table";
import { Sparkles, User } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import type { WorkflowListItem } from "@/lib/data/api";
import { RowActions } from "./RowActions";
import type { WorkflowTab } from "./workflowList";
import { workflowTypeMeta } from "./workflowList";

const columnHelper = createColumnHelper<WorkflowListItem>();

export function workflowColumns(handlers: {
  tab: WorkflowTab;
  onHide: (w: WorkflowListItem) => void;
  onUnhide: (w: WorkflowListItem) => void;
  onDelete: (w: WorkflowListItem) => void;
}) {
  return [
    columnHelper.display({
      id: "select",
      size: 44,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          onChange={table.getToggleAllRowsSelectedHandler()}
          aria-label="Select all"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onChange={row.getToggleSelectedHandler()}
          onClick={(e) => e.stopPropagation()}
          aria-label="Select row"
        />
      ),
    }),
    columnHelper.accessor("title", {
      header: "Name",
      size: 320,
      cell: (c) => <span className="block truncate text-sm text-foreground">{c.getValue()}</span>,
    }),
    columnHelper.accessor("type", {
      header: "Type",
      size: 120,
      cell: (c) => {
        const { label, Icon } = workflowTypeMeta(c.getValue());
        return (
          <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
            <Icon className="h-3.5 w-3.5" />
            {label}
          </span>
        );
      },
    }),
    columnHelper.accessor("practice", {
      header: "Practice",
      size: 160,
      cell: (c) =>
        c.getValue() ? (
          <span className="text-xs font-medium text-muted-foreground">{c.getValue()}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        ),
    }),
    columnHelper.display({
      id: "source",
      header: "Source",
      size: 140,
      meta: { noTruncate: true },
      cell: (c) => {
        const w = c.row.original;
        if (w.isSystem) {
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <Sparkles className="h-3.5 w-3.5" />
              Built-in
            </span>
          );
        }
        if (w.isOwner) {
          return (
            <span className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground">
              <User className="h-3.5 w-3.5" />
              Myself
            </span>
          );
        }
        return (
          <span className="inline-flex max-w-full items-center gap-1.5 truncate text-xs font-medium text-muted-foreground">
            <User className="h-3.5 w-3.5 shrink-0" />
            <span className="truncate">{w.sharedByName ?? "Shared"}</span>
          </span>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 64,
      enableResizing: false,
      meta: { noTruncate: true },
      cell: (c) => {
        const w = c.row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            {w.isSystem ? (
              handlers.tab === "hidden" ? (
                <RowActions onUnhide={() => handlers.onUnhide(w)} />
              ) : (
                <RowActions onHide={() => handlers.onHide(w)} />
              )
            ) : w.isOwner ? (
              <RowActions onDelete={() => handlers.onDelete(w)} />
            ) : null}
          </div>
        );
      },
    }),
  ];
}
