import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { createColumnHelper } from "@tanstack/react-table";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookMarked, ClipboardCheck, Play, Plus, Trash2, User } from "lucide-react";
import {
  api,
  type Clause,
  type ClauseInput,
  type PlaybookRule,
  type WorkflowListItem,
} from "@/lib/data/api";
import { DataTable } from "@/components/DataTable";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { PageHeader } from "@/components/PageHeader";
import { PageShell } from "@/components/PageShell";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { useSession } from "@/lib/auth/auth-client";
import { queryKeys } from "@/lib/data/queries";
import { useDataTable } from "@/lib/hooks/table/useDataTable";

export const Route = createFileRoute("/_auth/library/")({ component: LibraryPage });

// The firm's library: curated, admin-approved knowledge in two sections that
// share one lifecycle (draft -> approved -> deprecated) and live on the commit
// spine. Clauses = what language we use; Playbooks = how we review against it.

const RISK_LABEL = { acceptable: "Acceptable", negotiable: "Negotiable", escalate: "Escalate" };
const STATUS_VARIANT = { approved: "default", draft: "secondary", deprecated: "outline" } as const;

type LibraryTab = "clauses" | "playbooks";
const LIBRARY_TABS = [
  { id: "clauses" as const, label: "Clauses" },
  { id: "playbooks" as const, label: "Playbooks" },
];
const clauseColumn = createColumnHelper<Clause>();
const playbookColumn = createColumnHelper<WorkflowListItem>();

function LibraryPage() {
  // DataTable receives a stable TanStack table whose rows mutate in place.
  "use no memo";
  const [tab, setTab] = useState<LibraryTab>("clauses");
  const [clauseSearch, setClauseSearch] = useState("");
  const [playbookSearch, setPlaybookSearch] = useState("");
  const [creatingClause, setCreatingClause] = useState(false);
  const [creatingPlaybook, setCreatingPlaybook] = useState(false);
  const { data: session } = useSession();
  const isAdmin =
    session?.user && "tenantRole" in session.user
      ? (session.user as { tenantRole?: string }).tenantRole === "admin"
      : false;
  const search = tab === "clauses" ? clauseSearch : playbookSearch;
  const setSearch = tab === "clauses" ? setClauseSearch : setPlaybookSearch;

  return (
    <PageShell
      mode="fill"
      bodyClassName="gap-stack"
      header={
        <PageHeader
          title="Library"
          action={
            <Button
              variant="outline"
              size="icon-sm"
              className="rounded-full"
              tooltip={tab === "clauses" ? "New clause" : "New playbook"}
              onClick={() =>
                tab === "clauses" ? setCreatingClause(true) : setCreatingPlaybook(true)
              }
            >
              <Plus className="size-4" />
            </Button>
          }
        />
      }
    >
      <ToolbarTabs
        tabs={LIBRARY_TABS}
        active={tab}
        onChange={setTab}
        actions={
          <TableSearch
            value={search}
            onChange={setSearch}
            placeholder={tab === "clauses" ? "Search clauses…" : "Search playbooks…"}
          />
        }
      />
      {tab === "clauses" && (
        <ClausesSection
          isAdmin={isAdmin}
          search={clauseSearch}
          creating={creatingClause}
          onCreatingChange={setCreatingClause}
        />
      )}
      {tab === "playbooks" && (
        <PlaybooksSection
          isAdmin={isAdmin}
          search={playbookSearch}
          creating={creatingPlaybook}
          onCreatingChange={setCreatingPlaybook}
        />
      )}
    </PageShell>
  );
}

function ClausesSection({
  isAdmin,
  search,
  creating,
  onCreatingChange,
}: {
  isAdmin: boolean;
  search: string;
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Clause | null>(null);
  const [creatingParent, setCreatingParent] = useState<Clause | null>(null);

  const { data: clausesList = [] } = useQuery({
    queryKey: ["clauses"],
    queryFn: () => api.listClauses(),
  });
  const { data: detail } = useQuery({
    queryKey: ["clause", selectedId],
    queryFn: () => api.getClause(selectedId!),
    enabled: !!selectedId,
  });

  const invalidate = () => {
    void qc.invalidateQueries({ queryKey: ["clauses"] });
    void qc.invalidateQueries({ queryKey: ["clause"] });
  };

  const approveMutation = useMutation({
    mutationFn: (id: string) => api.updateClause(id, { status: "approved" }),
    onSuccess: () => {
      toast.success("Clause approved");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const deprecateMutation = useMutation({
    mutationFn: (id: string) => api.updateClause(id, { status: "deprecated" }),
    onSuccess: () => {
      toast.success("Clause deprecated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const filtered = useMemo(
    () => clausesList.filter((cl) => clauseMatches(cl, search)),
    [clausesList, search]
  );
  const columns = useMemo(
    () =>
      clauseColumns({
        isAdmin,
        onOpen: (cl) => setSelectedId(cl.id),
        onEdit: setEditing,
        onApprove: (id) => approveMutation.mutate(id),
        onDeprecate: (id) => deprecateMutation.mutate(id),
      }),
    [isAdmin, approveMutation, deprecateMutation]
  );
  const { table } = useDataTable({
    mode: "client",
    columns,
    data: filtered,
    getRowId: (cl) => cl.id,
    defaultSorting: [{ id: "category", desc: false }],
  });

  return (
    <>
      <DataTable
        table={table}
        onRowClick={(cl) => setSelectedId(cl.id)}
        empty={
          search.trim()
            ? `No clauses match "${search}".`
            : "No clauses yet. Add your firm's standard language to get started."
        }
      />
      {filtered.length > 0 && <TablePager table={table} />}

      {selectedId && detail && (
        <ClauseDetailDialog
          detail={detail}
          isAdmin={isAdmin}
          onClose={() => setSelectedId(null)}
          onEdit={(cl) => {
            setSelectedId(null);
            setEditing(cl);
          }}
          onAddFallback={(parent) => {
            setSelectedId(null);
            setCreatingParent(parent);
          }}
          onApprove={(id) => approveMutation.mutate(id)}
          onDeprecate={(id) => deprecateMutation.mutate(id)}
        />
      )}

      {(creating || creatingParent || editing) && (
        <ClauseFormDialog
          clause={editing}
          parent={creatingParent ?? undefined}
          onClose={() => {
            onCreatingChange(false);
            setCreatingParent(null);
            setEditing(null);
          }}
          onSaved={invalidate}
        />
      )}
    </>
  );
}

function ClauseDetailDialog({
  detail,
  isAdmin,
  onClose,
  onEdit,
  onAddFallback,
  onApprove,
  onDeprecate,
}: {
  detail: { clause: Clause; ladder: Clause[] };
  isAdmin: boolean;
  onClose: () => void;
  onEdit: (cl: Clause) => void;
  onAddFallback: (parent: Clause) => void;
  onApprove: (id: string) => void;
  onDeprecate: (id: string) => void;
}) {
  const { ladder } = detail;
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{detail.clause.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {ladder.map((cl, i) => (
            <div key={cl.id} className={i > 0 ? "border-t pt-3" : ""}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">
                  {i === 0 ? "Standard position" : `Fallback ${cl.fallbackRank ?? i}`}
                  {cl.status !== "approved" && (
                    <span className="ml-2 text-xs text-muted-foreground">({cl.status})</span>
                  )}
                </p>
                <div className="flex items-center gap-1.5">
                  {isAdmin && cl.status === "draft" && (
                    <Button size="xs" variant="outline" onClick={() => onApprove(cl.id)}>
                      Approve
                    </Button>
                  )}
                  {isAdmin && cl.status !== "deprecated" && (
                    <Button size="xs" variant="ghost" onClick={() => onDeprecate(cl.id)}>
                      Deprecate
                    </Button>
                  )}
                  <Button size="xs" variant="ghost" onClick={() => onEdit(cl)}>
                    Edit
                  </Button>
                </div>
              </div>
              <p className="mt-1 text-sm whitespace-pre-wrap">{cl.body}</p>
              {cl.guidance && (
                <p className="mt-1.5 text-xs whitespace-pre-wrap text-muted-foreground">
                  {cl.guidance}
                </p>
              )}
            </div>
          ))}
          <div className="border-t pt-3">
            <Button size="xs" variant="outline" onClick={() => onAddFallback(ladder[0]!)}>
              <Plus className="size-3.5" /> Add fallback position
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function clauseMatches(clause: Clause, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    clause.title,
    clause.category,
    clause.jurisdiction,
    clause.body,
    clause.guidance,
    RISK_LABEL[clause.riskRating],
    clause.status,
  ].some((value) => value?.toLowerCase().includes(query));
}

function clauseColumns({
  isAdmin,
  onOpen,
  onEdit,
  onApprove,
  onDeprecate,
}: {
  isAdmin: boolean;
  onOpen: (clause: Clause) => void;
  onEdit: (clause: Clause) => void;
  onApprove: (id: string) => void;
  onDeprecate: (id: string) => void;
}) {
  return [
    clauseColumn.accessor("title", {
      header: "Clause",
      size: 320,
      cell: (c) => (
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground">
          <BookMarked className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{c.getValue()}</span>
        </span>
      ),
    }),
    clauseColumn.accessor("category", {
      header: "Category",
      size: 180,
      cell: (c) => (
        <span className="text-xs font-medium text-muted-foreground">{c.getValue()}</span>
      ),
    }),
    clauseColumn.accessor("jurisdiction", {
      header: "Jurisdiction",
      size: 120,
      cell: (c) =>
        c.getValue() ? (
          <span className="text-xs font-medium text-muted-foreground">{c.getValue()}</span>
        ) : (
          <span className="text-xs text-muted-foreground/40">—</span>
        ),
    }),
    clauseColumn.accessor("riskRating", {
      header: "Risk",
      size: 140,
      cell: (c) => (
        <span className="text-xs text-muted-foreground">{RISK_LABEL[c.getValue()]}</span>
      ),
    }),
    clauseColumn.accessor("status", {
      header: "Status",
      size: 120,
      meta: { noTruncate: true },
      cell: (c) => <Badge variant={STATUS_VARIANT[c.getValue()]}>{c.getValue()}</Badge>,
    }),
    clauseColumn.display({
      id: "actions",
      header: "",
      size: 144,
      enableResizing: false,
      meta: { noTruncate: true },
      cell: (c) => {
        const clause = c.row.original;
        return (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isAdmin && clause.status === "draft" && (
              <Button size="xs" variant="outline" onClick={() => onApprove(clause.id)}>
                Approve
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => onOpen(clause)}>
              View
            </Button>
            <Button size="xs" variant="ghost" onClick={() => onEdit(clause)}>
              Edit
            </Button>
            {isAdmin && clause.status !== "deprecated" && (
              <Button size="xs" variant="ghost" onClick={() => onDeprecate(clause.id)}>
                Deprecate
              </Button>
            )}
          </div>
        );
      },
    }),
  ];
}

function ClauseFormDialog({
  clause,
  parent,
  onClose,
  onSaved,
}: {
  clause: Clause | null;
  parent?: Clause;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(clause?.title ?? (parent ? `${parent.title} — fallback` : ""));
  const [category, setCategory] = useState(clause?.category ?? parent?.category ?? "");
  const [body, setBody] = useState(clause?.body ?? "");
  const [guidance, setGuidance] = useState(clause?.guidance ?? "");
  const [jurisdiction, setJurisdiction] = useState(clause?.jurisdiction ?? "");
  const [riskRating, setRiskRating] = useState<Clause["riskRating"]>(
    clause?.riskRating ?? (parent ? "negotiable" : "acceptable")
  );

  const saveMutation = useMutation({
    mutationFn: async () => {
      const input: ClauseInput = {
        title,
        category,
        body,
        guidance: guidance || null,
        jurisdiction: jurisdiction || null,
        riskRating,
        ...(parent ? { parentClauseId: parent.id } : {}),
      };
      if (clause) await api.updateClause(clause.id, input);
      else await api.createClause(input);
    },
    onSuccess: () => {
      toast.success(clause ? "Clause updated" : "Clause created (draft)");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>
            {clause ? "Edit clause" : parent ? "Add fallback position" : "New clause"}
          </DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cl-title">Title</Label>
              <Input id="cl-title" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cl-category">Category</Label>
              <Input
                id="cl-category"
                placeholder="limitation-of-liability"
                value={category}
                disabled={!!parent}
                onChange={(e) => setCategory(e.target.value)}
              />
            </div>
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cl-body">Clause language</Label>
            <Textarea
              id="cl-body"
              rows={6}
              value={body}
              onChange={(e) => setBody(e.target.value)}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="cl-guidance">Guidance (why this position, when to escalate)</Label>
            <Textarea
              id="cl-guidance"
              rows={2}
              value={guidance}
              onChange={(e) => setGuidance(e.target.value)}
            />
          </div>
          <div className="flex gap-2">
            <div className="flex flex-1 flex-col gap-1.5">
              <Label htmlFor="cl-jurisdiction">Jurisdiction (optional)</Label>
              <Input
                id="cl-jurisdiction"
                placeholder="US, US-NY, EU, AU…"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
              />
            </div>
            <div className="flex flex-1 flex-col gap-1.5">
              <Label>Risk rating</Label>
              <Select
                value={riskRating}
                onValueChange={(v) => setRiskRating(v as Clause["riskRating"])}
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="acceptable">Acceptable</SelectItem>
                  <SelectItem value="negotiable">Negotiable</SelectItem>
                  <SelectItem value="escalate">Escalate</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => saveMutation.mutate()}
            disabled={saveMutation.isPending || !title.trim() || !body.trim() || !category.trim()}
          >
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ---- Playbooks section ----------------------------------------------------

function PlaybooksSection({
  isAdmin,
  search,
  creating,
  onCreatingChange,
}: {
  isAdmin: boolean;
  search: string;
  creating: boolean;
  onCreatingChange: (open: boolean) => void;
}) {
  const qc = useQueryClient();
  const [selected, setSelected] = useState<WorkflowListItem | null>(null);
  const [editing, setEditing] = useState<WorkflowListItem | null>(null);
  const [running, setRunning] = useState<WorkflowListItem | null>(null);

  const { data: allWorkflows = [] } = useQuery({
    queryKey: queryKeys.workflows,
    queryFn: () => api.listWorkflows(),
  });
  const playbooks = useMemo(
    () => allWorkflows.filter((w) => w.type === "playbook" && playbookMatches(w, search)),
    [allWorkflows, search]
  );

  const invalidate = () => void qc.invalidateQueries({ queryKey: queryKeys.workflows });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "deprecated" }) =>
      api.updateWorkflow(v.id, { status: v.status }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });
  const columns = useMemo(
    () =>
      playbookColumns({
        isAdmin,
        onOpen: setSelected,
        onRun: setRunning,
        onEdit: setEditing,
        onApprove: (id) => statusMutation.mutate({ id, status: "approved" }),
        onDeprecate: (id) => statusMutation.mutate({ id, status: "deprecated" }),
      }),
    [isAdmin, statusMutation]
  );
  const { table } = useDataTable({
    mode: "client",
    columns,
    data: playbooks,
    getRowId: (pb) => pb.id,
    defaultSorting: [{ id: "title", desc: false }],
  });

  return (
    <>
      <DataTable
        table={table}
        onRowClick={setSelected}
        empty={
          search.trim()
            ? `No playbooks match "${search}".`
            : "No playbooks yet. Create one, or ask your assistant to draft one from your standard template."
        }
      />
      {playbooks.length > 0 && <TablePager table={table} />}

      {selected && (
        <PlaybookDetailDialog
          playbook={selected}
          isAdmin={isAdmin}
          onClose={() => setSelected(null)}
          onRun={setRunning}
          onEdit={(playbook) => {
            setSelected(null);
            setEditing(playbook);
          }}
          onApprove={(id) => statusMutation.mutate({ id, status: "approved" })}
          onDeprecate={(id) => statusMutation.mutate({ id, status: "deprecated" })}
        />
      )}

      {(creating || editing) && (
        <PlaybookFormDialog
          playbook={editing}
          onClose={() => {
            onCreatingChange(false);
            setEditing(null);
          }}
          onSaved={invalidate}
        />
      )}
      {running && <RunPlaybookDialog playbook={running} onClose={() => setRunning(null)} />}
    </>
  );
}

function PlaybookDetailDialog({
  playbook,
  isAdmin,
  onClose,
  onRun,
  onEdit,
  onApprove,
  onDeprecate,
}: {
  playbook: WorkflowListItem;
  isAdmin: boolean;
  onClose: () => void;
  onRun: (playbook: WorkflowListItem) => void;
  onEdit: (playbook: WorkflowListItem) => void;
  onApprove: (id: string) => void;
  onDeprecate: (id: string) => void;
}) {
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{playbook.title}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          {(playbook.rules ?? []).map((rule) => (
            <div key={rule.id} className="border-b pb-3 last:border-b-0 last:pb-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-medium">{rule.clauseType}</p>
                <Badge variant={rule.severity === "red" ? "destructive" : "secondary"}>
                  {rule.severity}
                </Badge>
              </div>
              <p className="mt-1 text-sm">{rule.standardPosition}</p>
              {rule.fallbacks?.length ? (
                <p className="mt-1 text-xs text-muted-foreground">
                  Fallbacks:{" "}
                  {rule.fallbacks
                    .map((fallback) =>
                      typeof fallback === "string" ? fallback : `clause:${fallback.clauseId}`
                    )
                    .join(" -> ")}
                </p>
              ) : null}
              {rule.unacceptable && (
                <p className="mt-1 text-xs text-destructive">Red line: {rule.unacceptable}</p>
              )}
              {rule.guidance && (
                <p className="mt-1 text-xs text-muted-foreground">{rule.guidance}</p>
              )}
            </div>
          ))}
          {!playbook.rules?.length && (
            <p className="text-sm text-muted-foreground">No rules have been added yet.</p>
          )}
        </div>
        <DialogFooter>
          <div className="flex flex-1 items-center gap-1.5">
            {isAdmin && playbook.status === "draft" && (
              <Button size="xs" variant="outline" onClick={() => onApprove(playbook.id)}>
                Approve
              </Button>
            )}
            {isAdmin && playbook.status !== "deprecated" && !playbook.isSystem && (
              <Button size="xs" variant="ghost" onClick={() => onDeprecate(playbook.id)}>
                Deprecate
              </Button>
            )}
            {!playbook.isSystem && playbook.allowEdit && (
              <Button size="xs" variant="ghost" onClick={() => onEdit(playbook)}>
                Edit rules
              </Button>
            )}
          </div>
          <Button
            size="sm"
            variant="outline"
            disabled={playbook.status === "deprecated"}
            onClick={() => onRun(playbook)}
          >
            <Play className="size-3.5" /> Run
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function playbookMatches(playbook: WorkflowListItem, search: string) {
  const query = search.trim().toLowerCase();
  if (!query) return true;
  return [
    playbook.title,
    playbook.practice,
    playbook.status,
    playbook.isSystem ? "built-in" : playbook.isOwner ? "myself" : playbook.sharedByName,
    ...(playbook.rules ?? []).flatMap((rule) => [
      rule.clauseType,
      rule.standardPosition,
      rule.unacceptable,
      rule.guidance,
      rule.severity,
    ]),
  ].some((value) => value?.toLowerCase().includes(query));
}

function playbookColumns({
  isAdmin,
  onOpen,
  onRun,
  onEdit,
  onApprove,
  onDeprecate,
}: {
  isAdmin: boolean;
  onOpen: (playbook: WorkflowListItem) => void;
  onRun: (playbook: WorkflowListItem) => void;
  onEdit: (playbook: WorkflowListItem) => void;
  onApprove: (id: string) => void;
  onDeprecate: (id: string) => void;
}) {
  return [
    playbookColumn.accessor("title", {
      header: "Playbook",
      size: 320,
      cell: (c) => (
        <span className="inline-flex min-w-0 items-center gap-2 text-sm text-foreground">
          <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
          <span className="truncate">{c.getValue()}</span>
        </span>
      ),
    }),
    playbookColumn.display({
      id: "rules",
      header: "Rules",
      size: 100,
      cell: (c) => (
        <span className="text-xs font-medium text-muted-foreground">
          {c.row.original.rules?.length ?? 0} rules
        </span>
      ),
    }),
    playbookColumn.display({
      id: "source",
      header: "Source",
      size: 140,
      cell: (c) => {
        const playbook = c.row.original;
        return (
          <span className="inline-flex min-w-0 items-center gap-1.5 text-xs font-medium text-muted-foreground">
            {playbook.isSystem ? (
              <ClipboardCheck className="size-3.5 shrink-0" />
            ) : (
              <User className="size-3.5 shrink-0" />
            )}
            <span className="truncate">
              {playbook.isSystem
                ? "Built-in"
                : playbook.isOwner
                  ? "Myself"
                  : (playbook.sharedByName ?? "Shared")}
            </span>
          </span>
        );
      },
    }),
    playbookColumn.accessor("status", {
      header: "Status",
      size: 120,
      meta: { noTruncate: true },
      cell: (c) => <Badge variant={STATUS_VARIANT[c.getValue()]}>{c.getValue()}</Badge>,
    }),
    playbookColumn.display({
      id: "actions",
      header: "",
      size: 184,
      enableResizing: false,
      meta: { noTruncate: true },
      cell: (c) => {
        const playbook = c.row.original;
        return (
          <div className="flex justify-end gap-1.5" onClick={(e) => e.stopPropagation()}>
            {isAdmin && playbook.status === "draft" && (
              <Button size="xs" variant="outline" onClick={() => onApprove(playbook.id)}>
                Approve
              </Button>
            )}
            <Button size="xs" variant="ghost" onClick={() => onOpen(playbook)}>
              View
            </Button>
            {!playbook.isSystem && playbook.allowEdit && (
              <Button size="xs" variant="ghost" onClick={() => onEdit(playbook)}>
                Edit
              </Button>
            )}
            <Button
              size="xs"
              variant="outline"
              disabled={playbook.status === "deprecated"}
              onClick={() => onRun(playbook)}
            >
              <Play className="size-3.5" /> Run
            </Button>
            {isAdmin && playbook.status !== "deprecated" && !playbook.isSystem && (
              <Button size="xs" variant="ghost" onClick={() => onDeprecate(playbook.id)}>
                Deprecate
              </Button>
            )}
          </div>
        );
      },
    }),
  ];
}

const EMPTY_RULE = (): PlaybookRule => ({
  id: crypto.randomUUID(),
  clauseType: "",
  standardPosition: "",
  severity: "yellow",
});

function PlaybookFormDialog({
  playbook,
  onClose,
  onSaved,
}: {
  playbook: WorkflowListItem | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(playbook?.title ?? "");
  const [rules, setRules] = useState<PlaybookRule[]>(playbook?.rules ?? [EMPTY_RULE()]);

  const setRule = (id: string, patch: Partial<PlaybookRule>) =>
    setRules((rs) => rs.map((r) => (r.id === id ? { ...r, ...patch } : r)));

  const valid =
    title.trim() &&
    rules.length &&
    rules.every((r) => r.clauseType.trim() && r.standardPosition.trim());

  const saveMutation = useMutation({
    mutationFn: async () => {
      if (playbook) await api.updateWorkflow(playbook.id, { title, rules });
      else await api.createWorkflow({ title, type: "playbook", rules });
    },
    onSuccess: () => {
      toast.success(playbook ? "Playbook updated" : "Playbook created (draft)");
      onSaved();
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[85vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{playbook ? "Edit playbook" : "New playbook"}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="pb-title">Title (one contract type per playbook)</Label>
            <Input
              id="pb-title"
              placeholder="NDA Playbook"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
            />
          </div>
          {rules.map((rule, i) => (
            <div key={rule.id} className="flex flex-col gap-2 rounded-md border p-3">
              <div className="flex items-center justify-between">
                <p className="text-sm font-medium">Rule {i + 1}</p>
                <div className="flex items-center gap-1.5">
                  <Select
                    value={rule.severity}
                    onValueChange={(v) => setRule(rule.id, { severity: v as "red" | "yellow" })}
                  >
                    <SelectTrigger className="h-7 w-28 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="yellow">Yellow</SelectItem>
                      <SelectItem value="red">Red</SelectItem>
                    </SelectContent>
                  </Select>
                  <Button
                    size="icon-sm"
                    variant="ghost"
                    aria-label="Remove rule"
                    onClick={() => setRules((rs) => rs.filter((r) => r.id !== rule.id))}
                  >
                    <Trash2 className="size-3.5" />
                  </Button>
                </div>
              </div>
              <Input
                placeholder="Clause type, e.g. Limitation of liability"
                value={rule.clauseType}
                onChange={(e) => setRule(rule.id, { clauseType: e.target.value })}
              />
              <Textarea
                placeholder="Standard position"
                rows={2}
                value={rule.standardPosition}
                onChange={(e) => setRule(rule.id, { standardPosition: e.target.value })}
              />
              <Textarea
                placeholder="Unacceptable / red line (optional)"
                rows={1}
                value={rule.unacceptable ?? ""}
                onChange={(e) => setRule(rule.id, { unacceptable: e.target.value || undefined })}
              />
              <Textarea
                placeholder="Guidance (optional)"
                rows={1}
                value={rule.guidance ?? ""}
                onChange={(e) => setRule(rule.id, { guidance: e.target.value || undefined })}
              />
            </div>
          ))}
          <Button
            size="sm"
            variant="outline"
            onClick={() => setRules((rs) => [...rs, EMPTY_RULE()])}
          >
            <Plus className="size-4" /> Add rule
          </Button>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={() => saveMutation.mutate()} disabled={saveMutation.isPending || !valid}>
            {saveMutation.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function RunPlaybookDialog({
  playbook,
  onClose,
}: {
  playbook: WorkflowListItem;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [matterId, setMatterId] = useState<string | null>(null);
  const [docIds, setDocIds] = useState<string[]>([]);

  const { data: matters = [] } = useQuery({
    queryKey: ["matters"],
    queryFn: () => api.listMatters(),
  });
  const { data: docs = [] } = useQuery({
    queryKey: ["matter-docs", matterId, null],
    queryFn: () => api.listMatterDocuments(matterId!, null),
    enabled: !!matterId,
  });

  const runMutation = useMutation({
    mutationFn: () => api.runPlaybook(playbook.id, { matterId: matterId!, documentIds: docIds }),
    onSuccess: ({ reviewId }) => {
      toast.success("Playbook review created — press Run to extract verdicts");
      onClose();
      void navigate({ to: "/reviews/$id", params: { id: reviewId } });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Run "{playbook.title}"</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Matter</Label>
            <Select
              value={matterId ?? ""}
              onValueChange={(v) => {
                setMatterId(v);
                setDocIds([]);
              }}
            >
              <SelectTrigger>
                <SelectValue placeholder="Pick a matter" />
              </SelectTrigger>
              <SelectContent>
                {matters.map(({ matter }) => (
                  <SelectItem key={matter.id} value={matter.id}>
                    {matter.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          {matterId && (
            <div className="flex flex-col gap-1.5">
              <Label>Documents</Label>
              <div className="flex max-h-48 flex-col gap-1 overflow-y-auto rounded-md border p-2">
                {docs.map((d) => (
                  <label key={d.id} className="flex items-center gap-2 text-sm">
                    <Checkbox
                      checked={docIds.includes(d.id)}
                      onChange={(e) =>
                        setDocIds(
                          e.target.checked ? [...docIds, d.id] : docIds.filter((id) => id !== d.id)
                        )
                      }
                    />
                    {d.title}
                  </label>
                ))}
                {!docs.length && (
                  <p className="text-sm text-muted-foreground">No documents in this matter.</p>
                )}
              </div>
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button
            onClick={() => runMutation.mutate()}
            disabled={runMutation.isPending || !matterId || !docIds.length}
          >
            {runMutation.isPending ? "Creating…" : `Run ${playbook.rules?.length ?? 0} rules`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
