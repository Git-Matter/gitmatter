import { CollectionPanel, collectionBlocked } from "@/components/CollectionPanel";
import { useWorkspaceViewState } from "@/lib/hooks/state/useWorkspaceViewState";
import { createFileRoute, useRouter } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { createColumnHelper } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { DataTable } from "@/components/DataTable";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { CreateReviewDialog } from "./-components/CreateReviewDialog";
import { SharedWithCell } from "@/components/SharedWithCell";
import { SharePeopleDialog, reviewShareSource } from "@/components/SharePeopleDialog";
import { api, type ReviewListItem } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";
import { useDataTable } from "@/lib/hooks/table/useDataTable";
import { formatShortDate } from "@/lib/format/format";
import { useTablePageParams } from "@/lib/hooks/table/useTablePageParams";
import { useTableState } from "@/lib/hooks/table/useTableState";

export const Route = createFileRoute("/_auth/reviews/")({ component: Reviews });

const columnHelper = createColumnHelper<ReviewListItem>();

function reviewColumns(onManagePeople: (r: ReviewListItem) => void) {
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
    columnHelper.accessor("title", {
      header: "Name",
      size: 360,
      cell: (c) => <span className="block truncate font-medium">{c.getValue()}</span>,
    }),
    columnHelper.accessor("matterName", {
      id: "matter",
      header: "Matter",
      size: 200,
      cell: (c) => (
        <span className="block truncate text-muted-foreground">{c.getValue() ?? "—"}</span>
      ),
    }),
    columnHelper.accessor((r) => r.documentIds.length, {
      id: "documents",
      header: "Documents",
      size: 120,
      cell: (c) => <span className="text-muted-foreground">{c.getValue()}</span>,
    }),
    columnHelper.accessor("createdAt", {
      header: "Created",
      size: 140,
      cell: (c) => <span className="text-muted-foreground">{formatShortDate(c.getValue())}</span>,
    }),
    columnHelper.display({
      id: "shared",
      header: "Shared with",
      size: 130,
      cell: (c) => {
        const r = c.row.original;
        return (
          <div onClick={(e) => e.stopPropagation()}>
            <SharedWithCell
              count={r.shareCount}
              names={r.sharedNames}
              onClick={() => onManagePeople(r)}
            />
          </div>
        );
      },
    }),
  ];
}

function Reviews() {
  // See Matters: React Compiler can't track the stable TanStack table's in-place
  // data changes, so it skips the re-render that fills the table. Opt out.
  "use no memo";
  const router = useRouter();
  const [creating, setCreating] = useState(false);
  const [query, setQuery] = useWorkspaceViewState("reviews:query", "");
  const { sorting, setSorting, pagination, setPagination, ready } = useTableState("reviews", {
    defaultSorting: [{ id: "createdAt", desc: true }],
  });
  const [rowSelection, setRowSelection] = useState({});
  const [shareFor, setShareFor] = useState<ReviewListItem | null>(null);
  const [scope, setScope] = useWorkspaceViewState<"all" | "mine" | "shared">(
    "reviews:scope",
    "all"
  );
  const pageParams = useTablePageParams({
    query,
    sorting,
    pagination,
    setPagination,
    extraDeps: [scope],
    extraParams: { scope },
  });

  const listQuery = useQuery({
    queryKey: queryKeys.reviewsPage(pageParams),
    queryFn: () => api.listReviewsPage(pageParams),
    placeholderData: keepPreviousData,
    enabled: ready,
  });
  const { data } = listQuery;
  const inputPending = query.trim() !== pageParams.q;
  const viewQuery = {
    ...listQuery,
    isFetching: listQuery.isFetching || inputPending,
    isPlaceholderData: listQuery.isPlaceholderData || inputPending,
  };
  const blocked = collectionBlocked(viewQuery);
  const reviews = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;
  const columns = useMemo(() => reviewColumns(setShareFor), []);

  const { table } = useDataTable({
    columns,
    data: reviews,
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
          title="Reviews"
          action={
            <Button
              variant="outline"
              size="sm"
              disabled={blocked}
              tooltip="New review"
              onClick={() => setCreating(true)}
            >
              <Plus data-icon="inline-start" />
              New review
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

      <ToolbarTabs
        tabs={[
          { id: "all" as const, label: "All" },
          { id: "mine" as const, label: "Mine" },
          { id: "shared" as const, label: "Shared with me" },
        ]}
        active={scope}
        onChange={setScope}
        actions={<TableSearch value={query} onChange={setQuery} placeholder="Search reviews…" />}
      />

      <CollectionPanel query={viewQuery} label="Reviews">
        <DataTable
          rowActionColumn="title"
          getRowHref={(row) => `/reviews/${row.id}`}
          scrollKey={`reviews:${JSON.stringify(pageParams)}`}
          table={table}
          empty="No reviews yet. Start one from a contract or ask the assistant."
          onRowClick={(r) => router.navigate({ to: "/reviews/$id", params: { id: r.id } })}
        />
        <TablePager table={table} />
      </CollectionPanel>

      {shareFor && (
        <SharePeopleDialog
          source={reviewShareSource(shareFor.id, shareFor.title, shareFor.isOwner)}
          open
          onOpenChange={(open) => !open && setShareFor(null)}
        />
      )}
    </PageShell>
  );
}
