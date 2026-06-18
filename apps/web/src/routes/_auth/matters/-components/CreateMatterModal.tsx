import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PracticeAreaPicker } from "@/components/PracticeAreaPicker";
import { api } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";

/** Create a new matter: client, name, practice area, adverse parties, with an
 *  optional conflicts check before filing. */
export function CreateMatterModal({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const { data: clients = [] } = useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.listClients(),
    enabled: open,
  });
  const [clientId, setClientId] = useState("");
  const [name, setName] = useState("");
  const [practiceArea, setPracticeArea] = useState<string | null>(null);
  const [adverse, setAdverse] = useState("");
  const [conflicts, setConflicts] = useState<string[] | null>(null);

  // Reset the form each time the dialog opens.
  useEffect(() => {
    if (!open) return;
    setClientId("");
    setName("");
    setPracticeArea(null);
    setAdverse("");
    setConflicts(null);
  }, [open]);

  const createMutation = useMutation({
    mutationFn: (d: Parameters<typeof api.createMatter>[0]) => api.createMatter(d),
    onSuccess: (m) => {
      toast.success("Matter created");
      onCreated(m.id);
      onOpenChange(false);
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
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New matter</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
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
          <div className="flex flex-col gap-1.5">
            <Label>Matter name</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Series A financing"
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Practice area (optional)</Label>
            <PracticeAreaPicker value={practiceArea} onChange={setPracticeArea} />
          </div>
          <div className="flex flex-col gap-1.5">
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
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={check} disabled={!clientId} className="mr-auto">
            Check conflicts
          </Button>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button onClick={create} disabled={createMutation.isPending}>
            {createMutation.isPending ? "Creating…" : "Create matter"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
