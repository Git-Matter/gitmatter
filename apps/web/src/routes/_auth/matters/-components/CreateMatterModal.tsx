import { FieldDescription } from "@/components/ui/field";
import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { useDraftExit } from "@/lib/hooks/useDraftExit";
import { FormFeedback } from "@/components/FormFeedback";
import { NativeSelect, NativeSelectOption } from "@/components/ui/native-select";
import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
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
  const clientsQuery = useQuery({
    queryKey: queryKeys.clients,
    queryFn: () => api.listClients(),
    enabled: open,
  });
  const clients = clientsQuery.data ?? [];
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
    onMutate: () => captureActionOrigin(),
    mutationFn: (d: Parameters<typeof api.createMatter>[0]) => api.createMatter(d),
    onSuccess: (m, _variables, origin) => {
      exit.resolve();
      notifySuccess("Matter created", origin);
      onCreated(m.id);
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const clearDraft = () => {
    setName("");
    setClientId("");
    setPracticeArea(null);
    setAdverse("");
    setConflicts(null);
  };
  const exit = useDraftExit({
    dirty: open && !!(name.trim() || clientId || practiceArea || adverse.trim()),
    saving: open && createMutation.isPending,
    discard: clearDraft,
  });
  const [validation, setValidation] = useState("");
  const [checking, setChecking] = useState(false);
  const [conflictError, setConflictError] = useState<unknown>(null);
  const adverseParties = () =>
    adverse
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean);

  async function check() {
    const client = clients.find((c) => c.id === clientId);
    if (!client) {
      setValidation("Choose a client before checking conflicts.");
      return;
    }
    setConflictError(null);
    setChecking(true);
    try {
      const { matches } = await api.checkConflicts({
        clientName: client.name,
        adverseParties: adverseParties(),
      });
      setConflicts(matches);
      toast[matches.length ? "warning" : "success"](
        matches.length ? `${matches.length} possible conflict(s)` : "No conflicts found"
      );
    } catch (error) {
      setConflictError(error);
    } finally {
      setChecking(false);
    }
  }

  function create() {
    if (!clientsQuery.isSuccess) {
      setValidation(
        "Client access is not confirmed. Retry loading clients before creating a matter."
      );
      return;
    }
    setValidation("");
    if (!clientId || !name.trim()) {
      setValidation(!clientId ? "Choose a client." : "Enter a matter name.");
      document.getElementById(!clientId ? "new-matter-client" : "new-matter-name")?.focus();
      return;
    }
    createMutation.mutate({
      clientId,
      name: name.trim(),
      practiceArea: practiceArea ?? undefined,
      adverseParties: adverseParties(),
    });
  }

  return (
    <>
      {exit.guard}
      <Dialog
        open={open}
        onOpenChange={(next, details) => {
          if (next) onOpenChange(true);
          else if (!exit.requestClose(() => onOpenChange(false))) details.cancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New matter</DialogTitle>
          </DialogHeader>

          <FormFeedback
            id="new-matter-errors"
            error={createMutation.error || conflictError || validation}
            title="Matter needs attention"
          />
          <FormFeedback error={clientsQuery.error} title="Clients could not be loaded" />
          {clientsQuery.isError && (
            <Button variant="outline" onClick={() => void clientsQuery.refetch()}>
              Retry clients
            </Button>
          )}
          {clientsQuery.isPending && <p role="status">Loading clients…</p>}
          <FieldDescription id="matter-create-hint">
            Choose a client and enter a matter name. Checking conflicts does not create the matter;
            use Create matter to save it.
          </FieldDescription>
          <fieldset disabled={createMutation.isPending || checking} className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="new-matter-client">Client</Label>
              <NativeSelect
                id="new-matter-client"
                disabled={!clientsQuery.isSuccess}
                aria-describedby={
                  validation ? "new-matter-errors matter-create-hint" : "matter-create-hint"
                }
                aria-invalid={!!validation && !clientId}
                value={clientId}
                onChange={(e) => setClientId(e.target.value)}
              >
                <NativeSelectOption value="">Select a client…</NativeSelectOption>
                {clients.map((c) => (
                  <NativeSelectOption key={c.id} value={c.id}>
                    {c.name}
                  </NativeSelectOption>
                ))}
              </NativeSelect>
              {clientsQuery.isSuccess && !clients.length && (
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
              <Label htmlFor="new-matter-name">Matter name</Label>
              <Input
                id="new-matter-name"
                aria-describedby={
                  validation ? "new-matter-errors matter-create-hint" : "matter-create-hint"
                }
                aria-invalid={!!validation && !name.trim()}
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
              <Label htmlFor="new-matter-adverse">
                Adverse parties (optional, comma-separated)
              </Label>
              <Input
                id="new-matter-adverse"
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
          </fieldset>

          <DialogFooter>
            <Button
              variant="outline"
              onClick={check}
              disabled={!clientId || checking || createMutation.isPending}
              className="mr-auto"
            >
              {checking ? "Checking conflicts…" : "Check conflicts"}
            </Button>
            <Button variant="outline" onClick={() => exit.requestClose(() => onOpenChange(false))}>
              Cancel
            </Button>
            <Button onClick={create} disabled={createMutation.isPending || !clientsQuery.isSuccess}>
              {createMutation.isPending ? "Creating…" : "Create matter"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
