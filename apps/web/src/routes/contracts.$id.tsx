import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocxView } from "@/components/DocxView";
import { api, type Blame, type ContractDetail, type ContractEdit } from "../lib/api";

export const Route = createFileRoute("/contracts/$id")({ component: ContractView });

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  accepted: "secondary",
  rejected: "destructive",
};

function ContractView() {
  const { id } = Route.useParams();
  const [data, setData] = useState<ContractDetail | null>(null);
  const [history, setHistory] = useState<Blame[]>([]);
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);

  const loadHistory = useCallback(
    () =>
      api
        .contractHistory(id)
        .then(setHistory)
        .catch(() => {}),
    [id]
  );
  useEffect(() => {
    api
      .getContract(id)
      .then(setData)
      .catch(() => {});
    void loadHistory();
  }, [id, loadHistory]);

  if (!data) return <p className="pt-6 text-muted-foreground">Loading…</p>;

  async function propose() {
    if (!find) return;
    setBusy(true);
    try {
      setData(await api.proposeEdit(id, { find, replace, reason: reason || undefined }));
      setFind("");
      setReplace("");
      setReason("");
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  async function resolve(edit: ContractEdit, decision: "accept" | "reject") {
    try {
      setData(await api.resolveEdit(id, edit.changeId, decision));
      await loadHistory();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    }
  }

  const { contract, edits } = data;
  const pending = edits.filter((e) => e.status === "pending");
  const isDocx = !!contract.currentVersionId;

  return (
    <div className="grid gap-6 pt-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <h1 className="text-xl font-semibold">{contract.title}</h1>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isDocx ? "Document (tracked changes)" : "Current text"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isDocx ? (
              <DocxView url={api.contractDocxUrl(id)} versionToken={contract.currentVersionId} />
            ) : (
              <pre className="text-sm leading-relaxed whitespace-pre-wrap">{contract.body}</pre>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Propose tracked change</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Find (exact text in the contract)</Label>
              <Input value={find} onChange={(e) => setFind(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Replace with</Label>
              <Input value={replace} onChange={(e) => setReplace(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button onClick={propose} disabled={busy || !find} className="self-start">
              {busy ? "Proposing…" : "Propose edit"}
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <h2 className="text-sm font-semibold">Tracked changes ({pending.length} pending)</h2>
          {edits.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge>
                  {e.blame && (
                    <span className="text-xs text-muted-foreground">
                      by {e.blame.actorType === "agent" ? (e.blame.agentLabel ?? "agent") : "you"} ·
                      #{e.blame.seq}
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <span className="bg-red-500/15 text-red-700 line-through dark:text-red-400">
                    {e.deletedText}
                  </span>{" "}
                  <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                    {e.insertedText}
                  </span>
                </div>
                {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
                {e.status === "pending" && (
                  <div className="flex gap-2">
                    <Button size="xs" onClick={() => resolve(e, "accept")}>
                      Accept
                    </Button>
                    <Button size="xs" variant="outline" onClick={() => resolve(e, "reject")}>
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!edits.length && <p className="text-sm text-muted-foreground">No proposed changes.</p>}
        </div>
      </div>

      <aside>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        <ol className="flex flex-col gap-2">
          {history.map((c) => (
            <li key={c.id} className="rounded-md border p-2 text-xs">
              <div className="flex items-center gap-2">
                <span className="font-mono text-muted-foreground">#{c.seq}</span>
                <Badge variant={c.actorType === "agent" ? "default" : "secondary"}>
                  {c.actorType === "agent" ? (c.agentLabel ?? "agent") : "you"}
                </Badge>
                <span className="font-mono">{c.op}</span>
              </div>
              <p className="mt-1">{c.message}</p>
              <p className="mt-0.5 text-muted-foreground">
                {new Date(c.createdAt).toLocaleString()}
              </p>
            </li>
          ))}
        </ol>
      </aside>
    </div>
  );
}
