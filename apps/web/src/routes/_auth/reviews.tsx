import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper, type PaginationState, type SortingState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { CreateReviewDialog } from "./reviews/-components/CreateReviewDialog";
import { api } from "../../lib/api";
import { queryKeys } from "../../lib/queries";
import { useDataTable } from "../../lib/useDataTable";
import { formatShortDate } from "../../lib/format";
import { useTablePageParams } from "../../lib/useTablePageParams";

export const Route = createFileRoute("/_auth/reviews")({ component: Reviews });

type ReviewRow = { id: string; title: string; documentIds: string[]; createdAt: string };

const columnHelper = createColumnHelper<ReviewRow>();
const columns = [
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
    size: 360,
    cell: (c) => <span className="block truncate font-medium">{c.getValue()}</span>,
  }),
  columnHelper.accessor((r) => r.documentIds.length, {
    id: "documents",
    header: "Documents",
    size: 120,
    enableSorting: false,
    cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span>,
  }),
  columnHelper.accessor("createdAt", {
    header: "Created",
    size: 140,
    cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
  }),
];

function Reviews() {
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "createdAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const pageParams = useTablePageParams({ query, sorting, pagination, setPagination });

  const { data } = useQuery({
    queryKey: queryKeys.reviewsPage(pageParams),
    queryFn: () => api.listReviewsPage(pageParams),
    placeholderData: keepPreviousData,
  });
  const reviews = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;

  const { table } = useDataTable({
    columns,
    data: reviews,
    sizingKey: "reviews",
    getRowId: (row) => row.id,
    rowCount,
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  });

  return (
    <PageShell
      mode="fill"
      bodyClassName="gap-stack"
      header={
        <PageHeader
          title="Tabular reviews"
          action={
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-full"
              tooltip="New review"
              onClick={() => setCreating(true)}
            >
              <Plus className="size-4" />
            </Button>
          }
        />
      }
    >
      <CreateReviewDialog
        open={creating}
        onOpenChange={setCreating}
        onCreated={(id) => router.navigate({ to: "/reviews/$id", params: { id } })}
      />

      <div className="flex h-10 shrink-0 items-center justify-end border-b border-border">
        <TableSearch value={query} onChange={setQuery} placeholder="Search reviews…" />
      </div>

      <DataTable
        table={table}
        empty="No reviews yet. Start one from a contract or ask the assistant."
        onRowClick={(r) => router.navigate({ to: "/reviews/$id", params: { id: r.id } })}
      />
      <TablePager table={table} />
    </PageShell>
  );
}
