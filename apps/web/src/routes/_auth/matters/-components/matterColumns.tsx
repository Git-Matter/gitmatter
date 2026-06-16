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
import { StateCue } from "@/components/StateCue";
import { formatShortDate } from "@/lib/format";
import type { MatterListItem } from "@/lib/api";

const columnHelper = createColumnHelper<MatterListItem>();

export function matterColumns(handlers: {
  onEdit: (m: MatterListItem) => void;
  onManagePeople: (m: MatterListItem) => void;
  onToggleClose: (m: MatterListItem) => void;
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
    columnHelper.accessor((m) => m.matter.name, {
      id: "name",
      header: "Name",
      size: 260,
      cell: (c) => (
        <span className="block truncate font-medium">
          {c.getValue()}
          {c.row.original.matter.status === "closed" && (
            <StateCue tone="muted">
              <span className="ml-2">Closed</span>
            </StateCue>
          )}
        </span>
      ),
    }),
    columnHelper.accessor((m) => m.client.name, {
      id: "client",
      header: "Client",
      size: 180,
      cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span>,
    }),
    columnHelper.accessor((m) => (m.role === "owner" ? "Me" : (m.ownerName ?? "—")), {
      id: "owner",
      header: "Owner",
      size: 140,
      cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span>,
    }),
    columnHelper.accessor((m) => m.memberCount, {
      id: "shared",
      header: "Shared with",
      size: 130,
      cell: (c) => (
        <span className="text-muted-foreground">
          {c.getValue() > 1 ? `${c.getValue()} people` : "Private"}
        </span>
      ),
    }),
    columnHelper.accessor((m) => m.matter.updatedAt, {
      id: "updatedAt",
      header: "Recent activity",
      size: 140,
      cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
    }),
    columnHelper.accessor((m) => m.matter.createdAt, {
      id: "createdAt",
      header: "Created",
      size: 140,
      cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 64,
      enableResizing: false,
      cell: (c) => {
        const m = c.row.original;
        const isOwner = m.role === "owner";
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
                <DropdownMenuItem onClick={() => handlers.onEdit(m)}>Edit</DropdownMenuItem>
                {isOwner && (
                  <DropdownMenuItem onClick={() => handlers.onManagePeople(m)}>
                    Manage people
                  </DropdownMenuItem>
                )}
                {isOwner && (
                  <DropdownMenuItem onClick={() => handlers.onToggleClose(m)}>
                    {m.matter.status === "closed" ? "Reopen" : "Close"}
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        );
      },
    }),
  ];
}
