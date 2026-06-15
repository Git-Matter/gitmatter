import { createColumnHelper } from "@tanstack/react-table";
import { Checkbox } from "@/components/ui/checkbox";
import { StateCue } from "@/components/StateCue";
import type { Client } from "@/lib/api";

const columnHelper = createColumnHelper<Client>();

export const clientColumns = [
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
];
