import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { api, type Client } from "../lib/api";
import { useMatters } from "../lib/matters-context";

export const Route = createFileRoute("/matters")({ component: Matters });

function Matters() {
  const { matters, refresh, setCurrent } = useMatters();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Matters"
        description="Engagements you're staffed on. New work files under the matter you pick here."
        action={
          <Button onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New matter"}
          </Button>
        }
      />

      {creating && (
        <CreateMatter
          onCreated={(id) => {
            setCreating(false);
            refresh();
            setCurrent(id);
          }}
        />
      )}

      <div className="grid gap-stack sm:grid-cols-2 lg:grid-cols-3">
        {matters.map(({ matter, client, role }) => (
          <Link key={matter.id} to="/matters/$id" params={{ id: matter.id }}>
            <Card className="h-full transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="flex items-start justify-between gap-2 text-base">
                  <span className="truncate">{matter.name}</span>
                  <Badge variant="outline" className="shrink-0 font-normal capitalize">
                    {role}
                  </Badge>
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-1 text-sm text-muted-foreground">
                <span className="truncate">{client.name}</span>
                <div className="flex flex-wrap gap-1.5">
                  {matter.practiceArea && (
                    <Badge variant="secondary" className="font-normal">
                      {matter.practiceArea}
                    </Badge>
                  )}
                  {matter.status === "closed" && <Badge variant="outline">Closed</Badge>}
                  {!matter.conflictCleared && (
                    <Badge variant="outline" className="border-amber-500/50 text-amber-700">
                      Conflicts pending
                    </Badge>
                  )}
                </div>
              </CardContent>
            </Card>
          </Link>
        ))}
        {!matters.length && <p className="text-muted-foreground">No matters yet.</p>}
      </div>
    </div>
  );
}

function CreateMatter({ onCreated }: { onCreated: (id: string) => void }) {
  const [clients, setClients] = useState<Client[]>([]);
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [matterNumber, setMatterNumber] = useState("");
  const [practiceArea, setPracticeArea] = useState("");
  const [adverse, setAdverse] = useState("");
  const [conflicts, setConflicts] = useState<string[] | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api
      .listClients()
      .then(setClients)
      .catch(() => {});
  }, []);

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

  async function create() {
    if (!clientId) return toast.error("Pick a client");
    if (!name.trim()) return toast.error("Matter name is required");
    setBusy(true);
    try {
      const m = await api.createMatter({
        clientId,
        name: name.trim(),
        matterNumber: matterNumber.trim() || undefined,
        practiceArea: practiceArea.trim() || undefined,
        adverseParties: adverseParties(),
      });
      toast.success("Matter created");
      onCreated(m.id);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
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
            <Label>Matter number (optional)</Label>
            <Input
              value={matterNumber}
              onChange={(e) => setMatterNumber(e.target.value)}
              placeholder="M-2024-014"
            />
          </div>
          <div className="flex flex-col gap-field">
            <Label>Practice area (optional)</Label>
            <Input
              value={practiceArea}
              onChange={(e) => setPracticeArea(e.target.value)}
              placeholder="Corporate"
            />
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
          <Button onClick={create} disabled={busy}>
            {busy ? "Creating…" : "Create matter"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
