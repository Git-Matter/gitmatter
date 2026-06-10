import { createFileRoute, Link, useRouter } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { PageHeader } from "@/components/PageHeader";
import { JURISDICTIONS } from "@workspace/registry";
import { api } from "../lib/api";
import { useWorkingMatterId } from "../lib/matters-context";

export const Route = createFileRoute("/contracts")({ component: Contracts });

function Contracts() {
  const router = useRouter();
  const matterId = useWorkingMatterId();
  const [contracts, setContracts] = useState<
    Array<{ id: string; title: string; createdAt: string }>
  >([]);
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [jurisdiction, setJurisdiction] = useState("");
  const [creating, setCreating] = useState(false);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    api
      .listContracts()
      .then(setContracts)
      .catch(() => {});
  }, []);

  async function create() {
    if (!title.trim() || !body.trim()) return;
    setBusy(true);
    try {
      const { id } = await api.createContract({
        title: title.trim(),
        body,
        jurisdiction: jurisdiction || null,
        matterId,
      });
      void router.navigate({ to: "/contracts/$id", params: { id } });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setUploading(true);
    try {
      const { id } = await api.uploadContract(file, undefined, jurisdiction || null, matterId);
      void router.navigate({ to: "/contracts/$id", params: { id } });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
    }
  }

  return (
    <div className="flex flex-col gap-section">
      <PageHeader
        title="Contracts"
        description="Redline with tracked changes. Every edit — yours or an agent's — is a commit."
        action={
          <div className="flex items-center gap-2">
            <label className="cursor-pointer rounded-md border px-3 py-1.5 text-sm hover:bg-muted/50">
              {uploading ? "Uploading…" : "Upload DOCX"}
              <input
                type="file"
                accept=".docx,.doc"
                disabled={uploading}
                onChange={onUpload}
                className="hidden"
              />
            </label>
            <Button onClick={() => setCreating((v) => !v)}>
              {creating ? "Cancel" : "New contract"}
            </Button>
          </div>
        }
      />

      {creating && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">New contract</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Title</Label>
              <Input
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="Acme MSA"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Governing jurisdiction (optional override)</Label>
              <select
                className="h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm"
                value={jurisdiction}
                onChange={(e) => setJurisdiction(e.target.value)}
              >
                <option value="">Use my default</option>
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Body</Label>
              <Textarea rows={10} value={body} onChange={(e) => setBody(e.target.value)} />
            </div>
            <Button
              onClick={create}
              disabled={busy || !title.trim() || !body.trim()}
              className="self-start"
            >
              {busy ? "Creating…" : "Create contract"}
            </Button>
          </CardContent>
        </Card>
      )}

      <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {contracts.map((c) => (
          <Link key={c.id} to="/contracts/$id" params={{ id: c.id }}>
            <Card className="transition-colors hover:bg-muted/50">
              <CardHeader>
                <CardTitle className="text-base">{c.title}</CardTitle>
              </CardHeader>
              <CardContent className="text-sm text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()}
              </CardContent>
            </Card>
          </Link>
        ))}
        {!contracts.length && <p className="text-muted-foreground">No contracts yet.</p>}
      </div>
    </div>
  );
}
