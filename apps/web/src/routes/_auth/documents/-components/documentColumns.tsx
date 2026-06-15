import { createColumnHelper } from "@tanstack/react-table";
import { RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fileTypeLabel } from "@/lib/documentLabels";
import { formatShortDate } from "@/lib/format";
import type { Doc } from "@/lib/api";
import { DocumentStatusBadge } from "./DocumentStatusBadge";

const columnHelper = createColumnHelper<Doc>();

export function documentColumns(onRetry: (id: string) => void) {
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
      cell: (c) =>
        c.row.original.status === "failed" || c.row.original.status === "processing" ? (
          <Button
            variant="ghost"
            size="icon"
            className="size-7"
            title={
              c.row.original.extractionError ? `Retry - ${c.row.original.extractionError}` : "Retry"
            }
            aria-label="Retry extraction"
            onClick={(e) => {
              e.stopPropagation();
              onRetry(c.row.original.id);
            }}
          >
            <RotateCcw className="size-4" />
          </Button>
        ) : null,
    }),
  ];
}
