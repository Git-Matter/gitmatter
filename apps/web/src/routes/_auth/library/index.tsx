import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookMarked, ClipboardCheck, Play, Plus, Trash2 } from "lucide-react";
import {
  api,
  type Clause,
  type ClauseInput,
  type PlaybookRule,
  type WorkflowListItem,
} from "@/lib/data/api";
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
import { TableSearch } from "@/components/TableSearch";
import { useSession } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/_auth/library/")({ component: LibraryPage });

// The firm's library: curated, admin-approved knowledge in two sections that
// share one lifecycle (draft -> approved -> deprecated) and live on the commit
// spine. Clauses = what language we use; Playbooks = how we review against it.

const RISK_LABEL = { acceptable: "Acceptable", negotiable: "Negotiable", escalate: "Escalate" };
const STATUS_VARIANT = { approved: "default", draft: "secondary", deprecated: "outline" } as const;

type LibraryTab = "clauses" | "playbooks";

function LibraryPage() {
  const [tab, setTab] = useState<LibraryTab>("clauses");
  const { data: session } = useSession();
  const isAdmin =
    session?.user && "tenantRole" in session.user
      ? (session.user as { tenantRole?: string }).tenantRole === "admin"
      : false;

  return (
    <PageShell header={<PageHeader breadcrumbs={[{ label: "Library" }]} />}>
      <ToolbarTabs
        tabs={[
          { id: "clauses" as const, label: "Clauses" },
          { id: "playbooks" as const, label: "Playbooks" },
        ]}
        active={tab}
        onChange={setTab}
      />
      {tab === "clauses" && <ClausesSection isAdmin={isAdmin} />}
      {tab === "playbooks" && <PlaybooksSection isAdmin={isAdmin} />}
    </PageShell>
  );
}

function ClausesSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [search, setSearch] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<Clause | null>(null);
  const [creating, setCreating] = useState<{ parent?: Clause } | null>(null);

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
    () =>
      clausesList.filter(
        (cl) =>
          cl.title.toLowerCase().includes(search.toLowerCase()) ||
          cl.category.toLowerCase().includes(search.toLowerCase())
      ),
    [clausesList, search]
  );
  const byCategory = useMemo(() => {
    const m = new Map<string, Clause[]>();
    for (const cl of filtered) m.set(cl.category, [...(m.get(cl.category) ?? []), cl]);
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [filtered]);

  return (
    <div className="flex flex-col gap-stack">
      <div className="flex items-center justify-between gap-3">
        <TableSearch value={search} onChange={setSearch} placeholder="Filter clauses…" />
        <div className="flex items-center gap-3">
          <p className="text-sm text-muted-foreground">
            Approved language and fallback positions. Every edit is a commit with blame.
          </p>
          <Button size="sm" onClick={() => setCreating({})}>
            <Plus className="size-4" /> New clause
          </Button>
        </div>
      </div>

      {byCategory.map(([category, rows]) => (
        <div key={category} className="flex flex-col gap-1.5">
          <p className="mt-2 text-sm font-medium text-muted-foreground">{category}</p>
          <ul className="flex flex-col">
            {rows.map((cl) => (
              <li
                key={cl.id}
                className="flex cursor-pointer items-center justify-between gap-3 border-b py-2 hover:bg-muted/40"
                onClick={() => setSelectedId(cl.id === selectedId ? null : cl.id)}
              >
                <div className="flex min-w-0 items-center gap-2">
                  <BookMarked className="size-4 shrink-0 text-muted-foreground" />
                  <span className="truncate font-medium">{cl.title}</span>
                  {cl.jurisdiction && (
                    <span className="text-xs text-muted-foreground">{cl.jurisdiction}</span>
                  )}
                </div>
                <div className="flex shrink-0 items-center gap-1.5">
                  <span className="text-xs text-muted-foreground">{RISK_LABEL[cl.riskRating]}</span>
                  <Badge variant={STATUS_VARIANT[cl.status]}>{cl.status}</Badge>
                </div>
              </li>
            ))}
          </ul>
          {selectedId && detail && rows.some((r) => r.id === selectedId) && (
            <ClauseDetail
              detail={detail}
              isAdmin={isAdmin}
              onEdit={(cl) => setEditing(cl)}
              onAddFallback={(parent) => setCreating({ parent })}
              onApprove={(id) => approveMutation.mutate(id)}
              onDeprecate={(id) => deprecateMutation.mutate(id)}
            />
          )}
        </div>
      ))}
      {!filtered.length && (
        <p className="py-8 text-center text-sm text-muted-foreground">
          No clauses yet. Add your firm's standard language to get started.
        </p>
      )}

      {(creating || editing) && (
        <ClauseFormDialog
          clause={editing}
          parent={creating?.parent}
          onClose={() => {
            setCreating(null);
            setEditing(null);
          }}
          onSaved={invalidate}
        />
      )}
    </div>
  );
}

function ClauseDetail({
  detail,
  isAdmin,
  onEdit,
  onAddFallback,
  onApprove,
  onDeprecate,
}: {
  detail: { clause: Clause; ladder: Clause[] };
  isAdmin: boolean;
  onEdit: (cl: Clause) => void;
  onAddFallback: (parent: Clause) => void;
  onApprove: (id: string) => void;
  onDeprecate: (id: string) => void;
}) {
  const { ladder } = detail;
  return (
    <div className="rounded-md border bg-muted/20 p-3">
      {ladder.map((cl, i) => (
        <div key={cl.id} className={i > 0 ? "mt-3 border-t pt-3" : ""}>
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
      <div className="mt-3 border-t pt-2">
        <Button size="xs" variant="outline" onClick={() => onAddFallback(ladder[0]!)}>
          <Plus className="size-3.5" /> Add fallback position
        </Button>
      </div>
    </div>
  );
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

function PlaybooksSection({ isAdmin }: { isAdmin: boolean }) {
  const qc = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<WorkflowListItem | null>(null);
  const [creating, setCreating] = useState(false);
  const [running, setRunning] = useState<WorkflowListItem | null>(null);

  const { data: allWorkflows = [] } = useQuery({
    queryKey: ["workflows-all"],
    queryFn: () => api.listWorkflows(),
  });
  const playbooks = allWorkflows.filter((w) => w.type === "playbook");

  const invalidate = () => void qc.invalidateQueries({ queryKey: ["workflows-all"] });

  const statusMutation = useMutation({
    mutationFn: (v: { id: string; status: "approved" | "deprecated" }) =>
      api.updateWorkflow(v.id, { status: v.status }),
    onSuccess: () => {
      toast.success("Updated");
      invalidate();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  return (
    <div className="flex flex-col gap-stack">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">
          How the firm reviews each contract type: standard positions, fallbacks, and red lines. Run
          one against documents to get a verdict per rule.
        </p>
        <Button size="sm" onClick={() => setCreating(true)}>
          <Plus className="size-4" /> New playbook
        </Button>
      </div>

      <ul className="flex flex-col">
        {playbooks.map((pb) => (
          <li key={pb.id} className="border-b">
            <div
              className="flex cursor-pointer items-center justify-between gap-3 py-2 hover:bg-muted/40"
              onClick={() => setSelectedId(pb.id === selectedId ? null : pb.id)}
            >
              <div className="flex min-w-0 items-center gap-2">
                <ClipboardCheck className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate font-medium">{pb.title}</span>
                <span className="text-xs text-muted-foreground">
                  {pb.rules?.length ?? 0} rules{pb.isSystem ? " · built-in" : ""}
                </span>
              </div>
              <div className="flex shrink-0 items-center gap-1.5">
                <Badge variant={STATUS_VARIANT[pb.status]}>{pb.status}</Badge>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={pb.status === "deprecated"}
                  onClick={(e) => {
                    e.stopPropagation();
                    setRunning(pb);
                  }}
                >
                  <Play className="size-3.5" /> Run
                </Button>
              </div>
            </div>
            {selectedId === pb.id && (
              <div className="mb-2 rounded-md border bg-muted/20 p-3">
                {(pb.rules ?? []).map((rule) => (
                  <div key={rule.id} className="border-b py-2 last:border-b-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium">{rule.clauseType}</p>
                      <Badge variant={rule.severity === "red" ? "destructive" : "secondary"}>
                        {rule.severity}
                      </Badge>
                    </div>
                    <p className="mt-0.5 text-sm">{rule.standardPosition}</p>
                    {rule.fallbacks?.length ? (
                      <p className="mt-0.5 text-xs text-muted-foreground">
                        Fallbacks:{" "}
                        {rule.fallbacks
                          .map((f) => (typeof f === "string" ? f : `clause:${f.clauseId}`))
                          .join(" → ")}
                      </p>
                    ) : null}
                    {rule.unacceptable && (
                      <p className="mt-0.5 text-xs text-destructive">
                        Red line: {rule.unacceptable}
                      </p>
                    )}
                    {rule.guidance && (
                      <p className="mt-0.5 text-xs text-muted-foreground">{rule.guidance}</p>
                    )}
                  </div>
                ))}
                <div className="mt-2 flex items-center gap-1.5 border-t pt-2">
                  {isAdmin && pb.status === "draft" && (
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => statusMutation.mutate({ id: pb.id, status: "approved" })}
                    >
                      Approve
                    </Button>
                  )}
                  {isAdmin && pb.status !== "deprecated" && !pb.isSystem && (
                    <Button
                      size="xs"
                      variant="ghost"
                      onClick={() => statusMutation.mutate({ id: pb.id, status: "deprecated" })}
                    >
                      Deprecate
                    </Button>
                  )}
                  {!pb.isSystem && pb.allowEdit && (
                    <Button size="xs" variant="ghost" onClick={() => setEditing(pb)}>
                      Edit rules
                    </Button>
                  )}
                </div>
              </div>
            )}
          </li>
        ))}
        {!playbooks.length && (
          <p className="py-8 text-center text-sm text-muted-foreground">
            No playbooks yet. Create one, or ask your assistant to draft one from your standard
            template (draft_playbook).
          </p>
        )}
      </ul>

      {(creating || editing) && (
        <PlaybookFormDialog
          playbook={editing}
          onClose={() => {
            setCreating(false);
            setEditing(null);
          }}
          onSaved={invalidate}
        />
      )}
      {running && <RunPlaybookDialog playbook={running} onClose={() => setRunning(null)} />}
    </div>
  );
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
