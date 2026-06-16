import { createColumnHelper } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StateCue } from "@/components/StateCue";
import type { Client } from "@/lib/api";

const columnHelper = createColumnHelper<Client>();

export function clientColumns(onEdit: (client: Client) => void) {
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
    columnHelper.accessor("name", {
      header: "Name",
      size: 280,
      minSize: 160,
      cell: (c) => <span className="block truncate font-medium">{c.getValue()}</span>,
    }),
    columnHelper.accessor("type", {
      header: "Type",
      size: 120,
      cell: (c) => <span className="text-muted-foreground capitalize">{c.getValue()}</span>,
    }),
    columnHelper.accessor("clientNumber", {
      header: "Client no.",
      size: 140,
      cell: (c) => <span className="text-muted-foreground">{c.getValue() ?? "—"}</span>,
    }),
    columnHelper.accessor("status", {
      header: "Status",
      size: 120,
      cell: (c) =>
        c.getValue() === "inactive" ? (
          <StateCue tone="muted">Inactive</StateCue>
        ) : (
          <StateCue tone="bronze">Active</StateCue>
        ),
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 64,
      enableResizing: false,
      cell: (c) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-7 opacity-0 transition-opacity group-hover:opacity-100 focus-visible:opacity-100"
          title="Edit client"
          aria-label="Edit client"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(c.row.original);
          }}
        >
          <Pencil className="size-4" />
        </Button>
      ),
    }),
  ];
}
