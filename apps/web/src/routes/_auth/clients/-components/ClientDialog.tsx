import { notifySuccess } from "@/lib/feedback";
import { useDraftExit } from "@/lib/hooks/useDraftExit";
import { FormFeedback } from "@/components/FormFeedback";
import { Link } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
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
  const { data: overview } = useQuery({
    queryKey: queryKeys.client(client?.id ?? ""),
    queryFn: () => api.getClient(client!.id),
    enabled: !!client,
  });
  // Prefer the freshly fetched client; fall back to the row snapshot.
  const current = overview?.client ?? client;

  const [name, setName] = useState("");
  const [type, setType] = useState<Client["type"]>("organization");
  const [clientNumber, setClientNumber] = useState("");
  const [status, setStatus] = useState<Client["status"]>("active");

  const seeded = useRef<string | null>(null);
  // Background refresh must not overwrite unsaved local input.
  useEffect(() => {
    if (!client) {
      seeded.current = null;
      return;
    }
    if (!current || seeded.current === current.id) return;
    seeded.current = current.id;
    setName(current.name);
    setType(current.type);
    setClientNumber(current.clientNumber ?? "");
    setStatus(current.status);
  }, [current, client]);

  const dirty =
    !!current &&
    (name.trim() !== current.name ||
      type !== current.type ||
      clientNumber.trim() !== (current.clientNumber ?? "") ||
      status !== current.status);

  const save = useMutation({
    mutationFn: () =>
      api.updateClient(client!.id, {
        name: name.trim(),
        type,
        clientNumber: clientNumber.trim() || null,
        status,
      }),
    onSuccess: () => {
      exit.resolve();
      notifySuccess("Client updated");
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
      if (current) {
        setName(current.name);
        setType(current.type);
        setClientNumber(current.clientNumber ?? "");
        setStatus(current.status);
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
          {client && (
            <>
              <DialogHeader>
                <DialogTitle>Edit client</DialogTitle>
              </DialogHeader>

              <FormFeedback error={save.error} title="Client was not saved" />
              <fieldset disabled={save.isPending} className="flex flex-col gap-3">
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
                    <Label>Type</Label>
                    <Select value={type} onValueChange={(v) => setType(v as Client["type"])}>
                      <SelectTrigger className="capitalize">
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
                  <Label>Status</Label>
                  <Select value={status} onValueChange={(v) => setStatus(v as Client["status"])}>
                    <SelectTrigger className="w-32 capitalize">
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
                <div className="flex max-h-[50vh] flex-col gap-section overflow-x-hidden overflow-y-auto border-t border-border pt-4">
                  <Section title="Matters" empty="No matters you can access.">
                    {overview.matters.map(({ matter }) => (
                      <Row
                        key={matter.id}
                        to="/matters/$id"
                        id={matter.id}
                        onNavigate={onClose}
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
                        onNavigate={onClose}
                        label={d.title}
                        meta={d.fileType}
                      />
                    ))}
                  </Section>
                  <Section title="Reviews" empty="No reviews.">
                    {overview.reviews.map((rv) => (
                      <Row
                        key={rv.id}
                        to="/reviews/$id"
                        id={rv.id}
                        onNavigate={onClose}
                        label={rv.title}
                      />
                    ))}
                  </Section>
                </div>
              )}

              <DialogFooter>
                <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
                <Button
                  disabled={!dirty || !name.trim() || save.isPending}
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
  onNavigate,
}: {
  to: "/matters/$id" | "/documents/$id" | "/reviews/$id";
  id: string;
  label: string;
  meta?: string;
  onNavigate: () => void;
}) {
  return (
    <Link
      to={to}
      params={{ id }}
      onClick={onNavigate}
      className="-mx-2 flex items-center justify-between gap-3 rounded-md px-2 py-2 text-sm transition-colors hover:bg-muted/50"
    >
      <span className="truncate">{label}</span>
      {meta && <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>}
    </Link>
  );
}
