import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { api, type Client } from "../lib/api";

export const Route = createFileRoute("/clients")({ component: Clients });

function Clients() {
  const [clients, setClients] = useState<Client[]>([]);
  const [creating, setCreating] = useState(false);

  const refresh = () =>
    api
      .listClients()
      .then(setClients)
      .catch(() => {});
  useEffect(() => {
    void refresh();
  }, []);

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Clients"
        description="The firm's client directory. Open a matter under a client to start work."
        action={
          <Button onClick={() => setCreating((v) => !v)}>
            {creating ? "Cancel" : "New client"}
          </Button>
        }
      />

      {creating && (
        <CreateClient
          onCreated={() => {
            setCreating(false);
            void refresh();
          }}
        />
      )}

      <div className="grid gap-stack sm:grid-cols-2 lg:grid-cols-3">
        {clients.map((cl) => (
          <Card key={cl.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between gap-2 text-base">
                <span className="truncate">{cl.name}</span>
                <Badge variant="outline" className="shrink-0 font-normal capitalize">
                  {cl.type}
                </Badge>
              </CardTitle>
            </CardHeader>
            <CardContent className="text-sm text-muted-foreground">
              {cl.clientNumber ? `No. ${cl.clientNumber}` : "—"}
            </CardContent>
          </Card>
        ))}
        {!clients.length && <p className="text-muted-foreground">No clients yet.</p>}
      </div>
    </div>
  );
}

function CreateClient({ onCreated }: { onCreated: () => void }) {
  const [name, setName] = useState("");
  const [type, setType] = useState<"organization" | "individual">("organization");
  const [clientNumber, setClientNumber] = useState("");
  const [busy, setBusy] = useState(false);

  async function create() {
    if (!name.trim()) return toast.error("Name is required");
    setBusy(true);
    try {
      await api.createClient({
        name: name.trim(),
        type,
        clientNumber: clientNumber.trim() || undefined,
      });
      toast.success("Client created");
      onCreated();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">New client</CardTitle>
      </CardHeader>
      <CardContent className="flex flex-col gap-stack">
        <div className="flex flex-col gap-field">
          <Label>Name</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corp" />
        </div>
        <div className="grid grid-cols-2 gap-stack">
          <div className="flex flex-col gap-field">
            <Label>Type</Label>
            <select
              className="h-9 rounded-md border border-input bg-background px-2.5 text-sm"
              value={type}
              onChange={(e) => setType(e.target.value as "organization" | "individual")}
            >
              <option value="organization">Organization</option>
              <option value="individual">Individual</option>
            </select>
          </div>
          <div className="flex flex-col gap-field">
            <Label>Client number (optional)</Label>
            <Input
              value={clientNumber}
              onChange={(e) => setClientNumber(e.target.value)}
              placeholder="2024-001"
            />
          </div>
        </div>
        <Button onClick={create} disabled={busy} className="self-start">
          {busy ? "Creating…" : "Create client"}
        </Button>
      </CardContent>
    </Card>
  );
}
