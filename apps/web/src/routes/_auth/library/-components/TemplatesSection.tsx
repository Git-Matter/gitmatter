import { useEffect, useRef, useState } from "react";
import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import type { TemplateView } from "@workspace/contracts";
import { ClipboardCheck, FileText, Plus } from "lucide-react";
import { api } from "@/lib/data/api";
import { canRetainSnapshotAfterError } from "@/lib/data/snapshot-refresh";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Spinner } from "@/components/ui/spinner";
import { useDebouncedValue } from "@/lib/hooks/state/useDebouncedValue";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { TemplateDetail } from "./TemplateDetail";
import { TemplateEditor } from "./TemplateEditor";
import { TemplateDownload, templateQueryKey, templateStatus } from "./template-ui";

type TemplateFilter = "all" | "review" | "returned" | "archived";

export function TemplatesSection({
  templateId,
  initialView = "all",
  onTemplateChange,
  onViewChange,
}: {
  templateId?: string | null;
  initialView?: TemplateFilter;
  onTemplateChange?: (id: string | undefined) => void;
  onViewChange?: (view: TemplateFilter) => void;
} = {}) {
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<TemplateFilter>(initialView);
  const [editing, setEditing] = useState<TemplateView | "new" | null>(null);
  const [selected, setSelected] = useState<string | null>(null);
  const [openedTemplate, setOpenedTemplate] = useState<string | null>(null);
  const [opening, setOpening] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const openerId = useRef<string | null>(null);
  function returnFocus() {
    if (openerRef.current?.isConnected) return openerRef.current;
    // A refreshed list can replace the original button while its detail stays open.
    return (
      (openerId.current &&
        listRef.current?.querySelector<HTMLElement>(
          `[data-template-opener="${CSS.escape(openerId.current)}"]`
        )) ||
      searchRef.current
    );
  }
  const debouncedSearch = useDebouncedValue(search.trim(), 300);
  const query = useInfiniteQuery({
    queryKey: [...templateQueryKey, filter, debouncedSearch],
    queryFn: ({ pageParam }) =>
      api.listTemplates({
        cursor: pageParam ?? undefined,
        view: filter,
        q: debouncedSearch || undefined,
      }),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.nextCursor ?? undefined,
  });
  const rows = query.data?.pages.flatMap((page) => page.items) ?? [];
  // A controlled null closes the detail; undefined permits standalone local selection.
  const selectedId = templateId === undefined ? selected : templateId;
  const selectedSummary = rows.find((row) => row.id === selectedId);
  const detail = useQuery({
    queryKey: ["template-detail", selectedId, selectedSummary?.headCommitId, opening],
    queryFn: () => api.getTemplate(selectedId!),
    enabled: !!selectedId,
    // Keep the mounted review and its frozen snapshot while a new head loads.
    placeholderData: (previous) => (previous?.id === selectedId ? previous : undefined),
  });
  const initialDetailReady =
    detail.data?.id === selectedId &&
    !detail.isPlaceholderData &&
    !detail.isFetching &&
    (!selectedSummary || detail.data.headCommitId === selectedSummary.headCommitId);
  const active =
    (!detail.error || canRetainSnapshotAfterError(detail.error)) &&
    detail.data?.id === selectedId &&
    (openedTemplate === selectedId || initialDetailReady)
      ? detail.data
      : undefined;
  useEffect(() => {
    if (!selectedId) setOpenedTemplate(null);
    else if (initialDetailReady) setOpenedTemplate(selectedId);
  }, [selectedId, initialDetailReady]);
  const refetchList = query.refetch;
  useEffect(() => {
    // A new open fetches the exact detail afresh. If the summary was already
    // outdated, refresh it before choosing the first frozen review snapshot.
    if (
      selectedId &&
      openedTemplate !== selectedId &&
      detail.data?.id === selectedId &&
      !detail.isPlaceholderData &&
      !detail.isFetching &&
      selectedSummary &&
      detail.data.headCommitId !== selectedSummary.headCommitId
    )
      void refetchList();
  }, [
    selectedId,
    openedTemplate,
    detail.data,
    detail.isPlaceholderData,
    detail.isFetching,
    selectedSummary,
    refetchList,
  ]);
  function selectTemplate(id: string | null) {
    setOpenedTemplate(null);
    if (id) setOpening((previous) => previous + 1);
    setSelected(id);
    onTemplateChange?.(id ?? undefined);
  }
  const emptyTitle = search
    ? "No matching templates"
    : filter === "review"
      ? "No templates are awaiting review"
      : filter === "returned"
        ? "No revisions need changes"
        : filter === "archived"
          ? "No archived templates"
          : "A home for your approved starting points";
  const emptyDescription = search
    ? "Try another template name, category, owner, or reviewer."
    : filter === "review"
      ? "Templates awaiting a named reviewer appear here. Your actionable revisions have a Review button."
      : filter === "returned"
        ? "Reviewer feedback stays with the working revision until it is sent for review again."
        : filter === "archived"
          ? "Withdrawn templates stay available to their team, together with their history."
          : "Upload your existing Word document, name its owner, and send the exact revision for approval.";

  return (
    <div ref={listRef} className="flex min-h-0 flex-1 flex-col gap-6 overflow-auto pb-8">
      <div className="flex flex-wrap items-start justify-between gap-4 pt-3">
        <div className="flex max-w-xl flex-col gap-2">
          <h2 className="font-heading text-2xl">The right starting point. Every time.</h2>
          <p className="text-sm text-muted-foreground">
            Legal maintains the working revision. Your team downloads the approved file, with its
            formatting intact.
          </p>
        </div>
        <Button
          onClick={(event) => {
            openerRef.current = event.currentTarget;
            openerId.current = null;
            setEditing("new");
          }}
        >
          <Plus data-icon="inline-start" />
          New template
        </Button>
      </div>
      <Tabs
        value={filter}
        onValueChange={(value) => {
          setFilter(value as TemplateFilter);
          onViewChange?.(value as TemplateFilter);
        }}
        className="gap-5"
      >
        <div className="flex flex-wrap items-center justify-between gap-4">
          <TabsList variant="line" className="max-w-full overflow-x-auto">
            <TabsTrigger value="all">All templates</TabsTrigger>
            <TabsTrigger value="review">Needs review</TabsTrigger>
            <TabsTrigger value="returned">Changes requested</TabsTrigger>
            <TabsTrigger value="archived">Archived</TabsTrigger>
          </TabsList>
          <Input
            ref={searchRef}
            aria-label="Search templates"
            placeholder="Search name, category, or person…"
            className="w-full sm:max-w-xs"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>
        <TabsContent value={filter}>
          {query.isPending ? (
            <div className="flex flex-col gap-3">
              <Skeleton className="h-24 w-full" />
              <Skeleton className="h-24 w-full" />
            </div>
          ) : query.isError ? (
            <Alert variant="destructive">
              <AlertTitle>Could not load templates</AlertTitle>
              <AlertDescription>
                {query.error.message}
                <Button variant="ghost" className="mt-2 w-fit" onClick={() => void query.refetch()}>
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          ) : rows.length === 0 ? (
            <Alert>
              {filter === "review" ? (
                <ClipboardCheck aria-hidden="true" />
              ) : (
                <FileText aria-hidden="true" />
              )}
              <AlertTitle>{emptyTitle}</AlertTitle>
              <AlertDescription>{emptyDescription}</AlertDescription>
            </Alert>
          ) : (
            <div className="flex flex-col divide-y divide-border rounded-xl bg-card px-5">
              {rows.map((row) => {
                const content = row.draft ?? row.current!;
                return (
                  <div
                    key={row.id}
                    className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 py-5 sm:grid-cols-[auto_minmax(0,1fr)_auto] sm:items-center"
                  >
                    <FileText
                      aria-hidden="true"
                      className="mt-0.5 size-6 shrink-0 text-muted-foreground"
                    />
                    <button
                      data-template-opener={row.id}
                      className="flex min-w-0 flex-col items-start gap-1.5 rounded-sm text-left outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                      onClick={(event) => {
                        openerRef.current = event.currentTarget;
                        openerId.current = row.id;
                        selectTemplate(row.id);
                      }}
                    >
                      <span className="font-medium break-words">{content.title}</span>
                      <span className="text-xs text-muted-foreground">
                        {content.category} · {row.ownerName ?? "Owner needed"} ·{" "}
                        {row.current ? `Approved v${row.current.version}` : "Not published"}
                        {row.draft && row.draft.id !== row.current?.id
                          ? ` · Working v${row.draft.version}`
                          : ""}
                      </span>
                      {row.status === "review" && (
                        <span className="text-xs text-muted-foreground">
                          With {row.reviewerName ?? "the assigned reviewer"} for review
                        </span>
                      )}
                      {row.status === "changes_requested" && row.reviewNote && (
                        <span className="line-clamp-2 text-xs text-muted-foreground">
                          Reviewer note: {row.reviewNote}
                        </span>
                      )}
                    </button>
                    <div className="col-span-2 flex flex-wrap items-center gap-3 sm:col-span-1 sm:justify-end">
                      <Badge variant={row.status === "published" ? "default" : "secondary"}>
                        {templateStatus(row)}
                      </Badge>
                      {row.status === "review" && row.canReview && (
                        <Button
                          variant="outline"
                          onClick={(event) => {
                            openerRef.current = event.currentTarget;
                            openerId.current = row.id;
                            selectTemplate(row.id);
                          }}
                        >
                          Review v{row.draft?.version}
                        </Button>
                      )}
                      {row.current && row.status !== "archived" && (
                        <TemplateDownload
                          id={row.id}
                          revisionId={row.current.id}
                          version={row.current.version}
                        />
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
          {query.hasNextPage && (
            <div className="mt-5 flex justify-center">
              <Button
                variant="outline"
                disabled={query.isFetchingNextPage}
                onClick={() => void query.fetchNextPage()}
              >
                {query.isFetchingNextPage && <Spinner data-icon="inline-start" />}
                {query.isFetchingNextPage ? "Loading…" : "Load more templates"}
              </Button>
            </div>
          )}
          {query.isFetchNextPageError && (
            <p role="alert" className="mt-3 text-sm text-destructive">
              More templates could not be loaded. Try Load more templates again.
            </p>
          )}
        </TabsContent>
      </Tabs>
      <p className="text-xs text-muted-foreground">
        Original Word files are retained per revision. Working changes stay private until approved.
        Previously downloaded copies cannot be recalled.
      </p>
      {editing && (
        <TemplateEditor item={editing} returnFocus={returnFocus} onClose={() => setEditing(null)} />
      )}
      {selectedId && !active && (
        <Dialog
          open
          onOpenChange={(open) => {
            if (!open) selectTemplate(null);
          }}
        >
          <DialogContent finalFocus={returnFocus} className="sm:max-w-md md:max-w-md lg:max-w-md">
            <DialogHeader>
              <DialogTitle>
                {detail.isError ? "Template unavailable" : "Opening template…"}
              </DialogTitle>
              <DialogDescription>
                {detail.isError
                  ? detail.error.message
                  : "Loading the exact revision and its access information."}
              </DialogDescription>
            </DialogHeader>
            {detail.isError ? (
              <Button variant="outline" onClick={() => void detail.refetch()}>
                Retry
              </Button>
            ) : (
              <Skeleton className="h-32 w-full" />
            )}
          </DialogContent>
        </Dialog>
      )}
      {active && (
        <TemplateDetail
          returnFocus={returnFocus}
          refreshCurrent={!detail.error}
          onRetryRefresh={() => void detail.refetch()}
          item={active}
          latestHead={selectedSummary?.headCommitId}
          latestAccess={selectedSummary}
          onClose={() => selectTemplate(null)}
          onEdit={(snapshot) => {
            selectTemplate(null);
            setEditing(snapshot);
          }}
        />
      )}
    </div>
  );
}
