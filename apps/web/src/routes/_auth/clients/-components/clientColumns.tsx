import { createColumnHelper } from "@tanstack/react-table";
import { Pencil } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { StateCue } from "@/components/StateCue";
import { SharedWithCell } from "@/components/SharedWithCell";
import type { ClientListItem } from "@/lib/data/api";

const columnHelper = createColumnHelper<ClientListItem>();

export function clientColumns(
  onEdit: (client: ClientListItem) => void,
  onManagePeople: (client: ClientListItem) => void
) {
  return [
    columnHelper.display({
      id: "select",
      size: 44,
      enableResizing: false,
      header: ({ table }) => (
        <Checkbox
          checked={table.getIsAllRowsSelected()}
          indeterminate={table.getIsSomeRowsSelected() && !table.getIsAllRowsSelected()}
          onCheckedChange={(checked) => table.toggleAllRowsSelected(checked)}
          aria-label="Select all rows on this page"
        />
      ),
      cell: ({ row }) => (
        <Checkbox
          checked={row.getIsSelected()}
          onCheckedChange={(checked) => row.toggleSelected(checked)}
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
      id: "shared",
      header: "Shared with",
      size: 150,
      meta: { noTruncate: true },
      // A client is private unless shared; the avatar stack opens the manage dialog.
      cell: (c) => {
        const client = c.row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <SharedWithCell
              count={client.memberCount}
              names={client.ownerName ? [client.ownerName] : []}
              onClick={() => onManagePeople(client)}
            />
          </div>
        );
      },
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 64,
      enableResizing: false,
      meta: { noTruncate: true },
      cell: (c) => (
        <Button
          variant="ghost"
          size="icon"
          className="size-7"
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
