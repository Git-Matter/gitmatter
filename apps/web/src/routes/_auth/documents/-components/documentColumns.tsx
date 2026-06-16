import { createColumnHelper } from "@tanstack/react-table";
import { MoreHorizontal } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { fileTypeLabel } from "@/lib/documentLabels";
import { formatShortDate } from "@/lib/format";
import type { Doc } from "@/lib/api";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

const columnHelper = createColumnHelper<Doc>();

export function documentColumns(handlers: {
  onRetry: (id: string) => void;
  onDownload: (id: string) => void;
  onDelete: (doc: Doc) => void;
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
      header: "Title",
      size: 360,
      cell: (c) => <span className="block truncate font-medium">{c.getValue()}</span>,
    }),
    columnHelper.accessor("fileType", {
      header: "Type",
      size: 90,
      cell: (c) => (
        <span className="text-muted-foreground uppercase">{fileTypeLabel(c.getValue())}</span>
      ),
    }),
    columnHelper.accessor("matterName", {
      header: "Matter",
      size: 180,
      enableSorting: false,
      cell: (c) => (
        <span className="block truncate text-muted-foreground">{c.getValue() ?? "—"}</span>
      ),
    }),
    columnHelper.accessor("versionNumber", {
      header: "Version",
      size: 80,
      enableSorting: false,
      cell: (c) => {
        const v = c.getValue();
        return <span className="text-muted-foreground">{v != null ? `v${v}` : "—"}</span>;
      },
    }),
    columnHelper.accessor("status", {
      header: "Status",
      size: 110,
      cell: (c) => <DocumentStatusBadge status={c.getValue()} />,
    }),
    columnHelper.accessor("createdAt", {
      header: "Added",
      size: 130,
      cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 64,
      enableResizing: false,
      cell: (c) => {
        const doc = c.row.original;
        const canRetry = doc.status === "failed" || doc.status === "processing";
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <DropdownMenu>
              <DropdownMenuTrigger
                render={
                  <Button
                    variant="ghost"
                    size="icon"
                    className="size-7 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100 aria-expanded:opacity-100"
                    title="Actions"
                    aria-label="Row actions"
                  />
                }
              >
                <MoreHorizontal className="size-4" />
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => handlers.onDownload(doc.id)}>
                  Download
                </DropdownMenuItem>
                {canRetry && (
                  <DropdownMenuItem onClick={() => handlers.onRetry(doc.id)}>
                    Retry
                  </DropdownMenuItem>
                )}
                <DropdownMenuItem variant="destructive" onClick={() => handlers.onDelete(doc)}>
                  Delete
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ];
}
