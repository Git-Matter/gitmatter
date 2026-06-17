import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { type PaginationState, type SortingState } from "@tanstack/react-table";
import { Plus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DataTable } from "@/components/DataTable";
import { PracticeAreaPicker } from "@/components/PracticeAreaPicker";
import { PageHeader } from "@/components/PageHeader";
import { TablePager } from "@/components/TablePager";
import { TableSearch } from "@/components/TableSearch";
import { ToolbarTabs } from "@/components/ToolbarTabs";
import { api, type MatterListItem } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";
import { useDataTable } from "@/lib/hooks/table/useDataTable";
import { useTablePageParams } from "@/lib/hooks/table/useTablePageParams";
import { useMatters } from "@/lib/context/matters-context";
import { matterColumns } from "./-components/matterColumns";
import { EditMatterModal } from "./-components/EditMatterModal";
import { PeopleModal } from "./-components/PeopleModal";

export const Route = createFileRoute("/_auth/matters/")({
  component: Matters,
  // ?view filters the list by status (set from the sidebar): all | active | closed.
  validateSearch: (s: Record<string, unknown>): { view?: string } => ({
    view: typeof s.view === "string" ? s.view : undefined,
  }),
});

type Scope = "all" | "mine" | "shared";

function Matters() {
  // React Compiler memoizes <DataTable table={table} />; the TanStack table is a
  // stable reference whose rows mutate in place, so the compiler can't see data
  // changes and skips the re-render that fills the table. Opt this component out.
  "use no memo";
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { refresh, setCurrent } = useMatters();
  const [creating, setCreating] = useState(false);
  const [scope, setScope] = useState<Scope>("all");
  const [query, setQuery] = useState("");
  const [sorting, setSorting] = useState<SortingState>([{ id: "updatedAt", desc: true }]);
  const [pagination, setPagination] = useState<PaginationState>({ pageIndex: 0, pageSize: 50 });
  const [rowSelection, setRowSelection] = useState({});
  const [editing, setEditing] = useState<MatterListItem | null>(null);
  const [peopleFor, setPeopleFor] = useState<MatterListItem | null>(null);

  const pageParams = useTablePageParams({
    query,
    sorting,
    pagination,
    setPagination,
    extraDeps: [scope],
    extraParams: { scope },
  });

  const { data } = useQuery({
    queryKey: queryKeys.mattersPage(pageParams),
    queryFn: () => api.listMattersPage(pageParams),
    placeholderData: keepPreviousData,
  });
  const shown = data?.rows ?? [];
  const rowCount = data?.rowCount ?? 0;

  // Mutations touch both the sidebar's full list (the matters context) and this
  // paged query, so refresh both.
  const refreshMatters = () => {
    refresh();
    void qc.invalidateQueries({ queryKey: queryKeys.matters });
  };

  const closeMutation = useMutation({
    mutationFn: (m: MatterListItem) =>
      api.updateMatter(m.matter.id, {
        status: m.matter.status === "closed" ? "open" : "closed",
      }),
    onSuccess: (_, m) => {
      toast.success(m.matter.status === "closed" ? "Matter reopened" : "Matter closed");
      refreshMatters();
      void qc.invalidateQueries({ queryKey: ["matter", m.matter.id] });
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const columns = useMemo(
    () =>
      matterColumns({
        onEdit: setEditing,
        onManagePeople: setPeopleFor,
        onToggleClose: (m) => closeMutation.mutate(m),
      }),
    [closeMutation]
  );

  const { table } = useDataTable({
    columns,
    data: shown,
    getRowId: (m) => m.matter.id,
    rowCount,
    sorting,
    onSortingChange: setSorting,
    pagination,
    onPaginationChange: setPagination,
    rowSelection,
    onRowSelectionChange: setRowSelection,
  });

  return (
    <div className="-mb-12 flex min-h-0 flex-1 flex-col gap-stack">
      {/* mike Projects header: serif title + a round add button. */}
      <PageHeader
        title="Matters"
        action={
          <Button
            variant="outline"
            size="icon-sm"
            className="rounded-full"
            title="New matter"
            aria-label="New matter"
            onClick={() => setCreating((v) => !v)}
          >
            <Plus className="size-4" />
          </Button>
        }
      />

      <ToolbarTabs
        tabs={[
          { id: "all" as const, label: "All" },
          { id: "mine" as const, label: "Mine" },
          { id: "shared" as const, label: "Shared with me" },
        ]}
        active={scope}
        onChange={setScope}
        actions={<TableSearch value={query} onChange={setQuery} placeholder="Search matters…" />}
      />

      {creating && (
        <CreateMatter
          onCreated={(id) => {
            setCreating(false);
            refreshMatters();
            setCurrent(id);
          }}
        />
      )}

      <DataTable
        table={table}
        empty={
          query || scope !== "all"
            ? "No matters match this filter."
            : "No matters yet. Create one to start filing work."
        }
        onRowClick={(m) => navigate({ to: "/matters/$id", params: { id: m.matter.id } })}
      />
      <TablePager table={table} />

      {editing && (
        <EditMatterModal
          matter={editing.matter}
          open
          onOpenChange={(open) => !open && setEditing(null)}
          canClose={editing.role === "owner"}
          onSaved={() => {
            refreshMatters();
            void qc.invalidateQueries({ queryKey: ["matter", editing.matter.id] });
          }}
        />
      )}

      {peopleFor && (
        <PeopleModal
          matterId={peopleFor.matter.id}
          matterName={peopleFor.matter.name}
          canManage={peopleFor.role === "owner"}
          open
          onOpenChange={(open) => !open && setPeopleFor(null)}
        />
      )}
    </div>
  );
}

function CreateMatter({ onCreated }: { onCreated: (id: string) => void }) {
  const { data: clients = [] } = useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.listClients(),
  });
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [practiceArea, setPracticeArea] = useState<string | null>(null);
  const [adverse, setAdverse] = useState("");
  const [conflicts, setConflicts] = useState<string[] | null>(null);

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof api.createMatter>[0]) => api.createMatter(d),
    onSuccess: (m) => {
      toast.success("Matter created");
      onCreated(m.id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const adverseParties = () =>
    adverse
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  async function check() {
    const client = clients.find((c) => c.id === clientId);
    if (!client) return toast.error("Pick a client first");
    const { matches } = await api.checkConflicts({
      clientName: client.name,
      adverseParties: adverseParties(),
    });
    setConflicts(matches);
    toast[matches.length ? "warning" : "success"](
      matches.length ? `${matches.length} possible conflict(s)` : "No conflicts found"
    );
  }

  function create() {
    if (!clientId) return toast.error("Pick a client");
    if (!name.trim()) return toast.error("Matter name is required");
    createMutation.mutate({
      clientId,
      name: name.trim(),
      practiceArea: practiceArea ?? undefined,
      adverseParties: adverseParties(),
    });
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New matter</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <div className="grid gap-stack sm:grid-cols-2">
          <div className="flex flex-col gap-field">
            <Label>Client</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              value={clientId}
              onChange={(e) => setClientId(e.target.value)}
            >
              <option value="">Select a client…</option>
              {clients.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>
            {!clients.length && (
              <p className="text-xs text-muted-foreground">
                No clients yet —{" "}
                <Link to="/clients" className="underline">
                  add one
                </Link>{" "}
                first.
              </p>
            )}
          </div>
          <div className="flex flex-col gap-field">
            <Label>Matter name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Series A financing"
            />
          </div>
          <div className="flex flex-col gap-field">
            <Label>Practice area (optional)</Label>
            <PracticeAreaPicker value={practiceArea} onChange={setPracticeArea} />
          </div>
        </div>

        <div className="flex flex-col gap-field">
          <Label>Adverse parties (optional, comma-separated)</Label>
          <Input
            value={adverse}
            onChange={(e) => setAdverse(e.target.value)}
            placeholder="Beta LLC, Gamma Inc"
          />
        </div>

        {conflicts !== null && (
          <div
            className={
              conflicts.length
                ? "rounded-md border border-amber-500/40 bg-amber-500/10 p-3 text-sm"
                : "rounded-md border border-border bg-muted/50 p-3 text-sm text-muted-foreground"
            }
          >
            {conflicts.length ? (
              <>
                <p className="font-medium">Possible conflicts — review before proceeding:</p>
                <ul className="mt-1 list-inside list-disc">
                  {conflicts.map((m) => (
                    <li key={m}>{m}</li>
                  ))}
                </ul>
              </>
            ) : (
              "No conflicts found."
            )}
          </div>
        )}

        <div className="flex gap-2">
          <Button variant="outline" onClick={check} disabled={!clientId}>
            Check conflicts
          </Button>
          <Button onClick={create} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create matter"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
