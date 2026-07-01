import { createFileRoute } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { BookMarked, Plus } from "lucide-react";
import { api, type Clause, type ClauseInput } from "@/lib/data/api";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
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

export const Route = createFileRoute("/_auth/library/")({ component: ClauseLibrary });

// The firm's clause library: approved language, fallback ladders, and the
// guidance that teaches when each position applies. Every edit is a commit.

const RISK_LABEL = { acceptable: "Acceptable", negotiable: "Negotiable", escalate: "Escalate" };
const STATUS_VARIANT = { approved: "default", draft: "secondary", deprecated: "outline" } as const;

function ClauseLibrary() {
  const qc = useQueryClient();
  const { data: session } = useSession();
  const isAdmin =
    session?.user && "tenantRole" in session.user
      ? (session.user as { tenantRole?: string }).tenantRole === "admin"
      : false;
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
    <PageShell
      header={
        <PageHeader
          breadcrumbs={[{ label: "Clause Library" }]}
          actions={[
            <Button key="new" size="sm" onClick={() => setCreating({})}>
              <Plus className="size-4" /> New clause
            </Button>,
          ]}
        />
      }
    >
      <div className="flex items-center justify-between gap-3">
        <TableSearch value={search} onChange={setSearch} placeholder="Filter clauses…" />
        <p className="text-sm text-muted-foreground">
          Approved language and fallback positions. Every edit is a commit with blame.
        </p>
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
    </PageShell>
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
