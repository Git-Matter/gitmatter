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
import { SharedWithCell } from "@/components/SharedWithCell";
import { StateCue } from "@/components/StateCue";
import { formatShortDate } from "@/lib/format/format";
import type { MatterListItem } from "@/lib/data/api";

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
      size: 140,
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
      size: 140,
      cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span>,
    }),
    columnHelper.accessor((m) => (m.role === "owner" ? "Me" : (m.ownerName ?? "—")), {
      id: "owner",
      header: "Owner",
      size: 100,
      cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span>,
    }),
    columnHelper.accessor((m) => m.memberCount, {
      id: "shared",
      header: "Shared with",
      size: 80,
      meta: { noTruncate: true },
      cell: (c) => {
        const m = c.row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <SharedWithCell
              count={m.memberCount}
              names={m.ownerName ? [m.ownerName] : []}
              onClick={() => handlers.onManagePeople(m)}
            />
          </div>
        );
      },
    }),
    columnHelper.accessor((m) => m.matter.updatedAt, {
      id: "updatedAt",
      header: "Recent activity",
      size: 100,
      cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
    }),
    columnHelper.accessor((m) => m.matter.createdAt, {
      id: "createdAt",
      header: "Created",
      size: 100,
      cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
    }),
    columnHelper.display({
      id: "actions",
      header: "",
      size: 64,
      enableResizing: false,
      meta: { noTruncate: true },
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
                    className="size-7 text-muted-foreground"
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
