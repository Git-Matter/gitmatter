import { notifySuccess } from "@/lib/feedback";
import { useDraftExit } from "@/lib/hooks/useDraftExit";
import { FormFeedback } from "@/components/FormFeedback";
import { SnapshotNotice } from "@/components/SnapshotNotice";
import { readableSnapshot, snapshotIsCurrent } from "@/lib/data/snapshot-refresh";
import { Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { api, type Client } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";

/** Click a client row → this dialog. Edits the client's directory details inline
 *  (name, type, number, status) and lists the client's work (matters, documents,
 *  reviews the caller can see); rows link out to their detail. */
export function ClientDialog({ client, onClose }: { client: Client | null; onClose: () => void }) {
  const qc = useQueryClient();
  // Fetch only while a client is selected; cached per id so reopening is instant.
  const overviewQuery = useQuery({
    queryKey: queryKeys.client(client?.id ?? ""),
    queryFn: () => api.getClient(client!.id),
    enabled: !!client,
    retry: false,
  });
  const overview = readableSnapshot(overviewQuery);
  // A row is useful initial context, but cannot override a denied detail response.
  const current = overview?.client ?? (!overviewQuery.error ? client : null);
  const confirmed = snapshotIsCurrent(overviewQuery);

  const [name, setName] = useState("");
  const [type, setType] = useState<Client["type"]>("organization");
  const [clientNumber, setClientNumber] = useState("");
  const [status, setStatus] = useState<Client["status"]>("active");
  const [baseline, setBaseline] = useState<Client | null>(null);

  const dirty =
    !!baseline &&
    baseline.id === client?.id &&
    (name.trim() !== baseline.name ||
      type !== baseline.type ||
      clientNumber.trim() !== (baseline.clientNumber ?? "") ||
      status !== baseline.status);

  // Background refresh must not overwrite unsaved local input.
  useEffect(() => {
    if (!client) {
      setBaseline(null);
      return;
    }
    if (!current || (baseline?.id === current.id && (dirty || !confirmed || baseline === current)))
      return;
    setBaseline(current);
    setName(current.name);
    setType(current.type);
    setClientNumber(current.clientNumber ?? "");
    setStatus(current.status);
  }, [current, client, baseline, confirmed, dirty]);

  const save = useMutation({
    mutationFn: () => {
      if (!client || !snapshotIsCurrent(overviewQuery))
        throw new Error("Refresh client details before saving changes.");
      return api.updateClient(client.id, {
        name: name.trim(),
        type,
        clientNumber: clientNumber.trim() || null,
        status,
      });
    },
    onSuccess: () => {
      exit.resolve();
      notifySuccess("Client updated", { section: "Clients" });
      void qc.invalidateQueries({ queryKey: queryKeys.clients });
      void qc.invalidateQueries({ queryKey: queryKeys.client(client!.id) });
      onClose();
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  const exit = useDraftExit({
    dirty: !!client && dirty,
    saving: !!client && save.isPending,
    discard: () => {
      if (baseline) {
        setName(baseline.name);
        setType(baseline.type);
        setClientNumber(baseline.clientNumber ?? "");
        setStatus(baseline.status);
      }
    },
  });
  return (
    <>
      {exit.guard}
      <Dialog
        open={!!client}
        onOpenChange={(open, details) => {
          if (!open && !exit.requestClose(onClose)) details.cancel();
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit client</DialogTitle>
          </DialogHeader>
          <SnapshotNotice query={overviewQuery} label="Client" />
          {overviewQuery.isPending && <p role="status">Loading client details…</p>}
          {client && current && (
            <>
              <FormFeedback error={save.error} title="Client was not saved" />
              <fieldset disabled={save.isPending || !confirmed} className="flex flex-col gap-3">
                <div className="flex flex-col gap-1.5">
                  <Label htmlFor="edit-client-name">Name</Label>
                  <Input
                    id="edit-client-name"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                  />
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-client-type">Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as Client["type"])}>
                      <SelectTrigger id="edit-client-type" className="capitalize">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {(["organization", "individual"] as const).map((t) => (
                          <SelectItem key={t} value={t} className="capitalize">
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="flex flex-col gap-1.5">
                    <Label htmlFor="edit-client-number">Client number</Label>
                    <Input
                      id="edit-client-number"
                      value={clientNumber}
                      onChange={(e) => setClientNumber(e.target.value)}
                      placeholder="2024-001"
                    />
                  </div>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <Label htmlFor="edit-client-status">Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Client["status"])}>
                    <SelectTrigger id="edit-client-status" className="w-32 capitalize">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {(["active", "inactive"] as const).map((s) => (
                        <SelectItem key={s} value={s} className="capitalize">
                          {s}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </fieldset>

              {!overview ? (
                <div className="flex flex-col gap-2">
                  <Skeleton className="h-5 w-full" />
                  <Skeleton className="h-5 w-2/3" />
                </div>
              ) : (
                <div
                  inert={!confirmed}
                  className="flex max-h-[50vh] flex-col gap-section overflow-x-hidden overflow-y-auto border-t border-border pt-4"
                >
                  <Section title="Matters" empty="No matters you can access.">
                    {overview.matters.map(({ matter }) => (
                      <Row
                        key={matter.id}
                        to="/matters/$id"
                        id={matter.id}
                        label={matter.name}
                        meta={matter.practiceArea ?? undefined}
                      />
                    ))}
                  </Section>
                  <Section title="Documents" empty="No documents.">
                    {overview.documents.map((d) => (
                      <Row
                        key={d.id}
                        to="/documents/$id"
                        id={d.id}
                        label={d.title}
                        meta={d.fileType}
                      />
                    ))}
                  </Section>
                  <Section title="Reviews" empty="No reviews.">
                    {overview.reviews.map((rv) => (
                      <Row key={rv.id} to="/reviews/$id" id={rv.id} label={rv.title} />
                    ))}
                  </Section>
                </div>
              )}

              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button
                  disabled={!confirmed || !dirty || !name.trim() || save.isPending}
                  onClick={() => save.mutate()}
                >
                  {save.isPending ? "Saving…" : "Save"}
                </Button>
              </DialogFooter>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}

function Section({
  title,
  empty,
  children,
}: {
  title: string;
  empty: string;
  children: React.ReactNode[];
}) {
  return (
    <div className="flex flex-col gap-1">
      <h3 className="text-xs font-medium text-muted-foreground">{title}</h3>
      {children.length ? (
        <div className="flex flex-col divide-y divide-border">{children}</div>
      ) : (
        <p className="py-2 text-sm text-muted-foreground">{empty}</p>
      )}
    </div>
  );
}

function Row({
  to,
  id,
  label,
  meta,
}: {
  to: "/matters/$id" | "/documents/$id" | "/reviews/$id";
  id: string;
  label: string;
  meta?: string;
}) {
  return (
    <Link
      to={to}
      params={{ id }}
      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50"
    >
      <span className="truncate">{label}</span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </Link>
  );
}
