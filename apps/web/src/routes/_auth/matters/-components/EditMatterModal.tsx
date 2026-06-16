import { useEffect, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Check, ChevronsUpDown, Search } from "lucide-react";
import { JURISDICTIONS } from "@workspace/registry";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { PracticeAreaPicker } from "@/components/PracticeAreaPicker";
import { Skeleton } from "@/components/ui/skeleton";
import { cn } from "@/lib/utils";
import { useDebouncedValue } from "@/lib/useDebouncedValue";
import { api, type Matter } from "../../../../lib/api";

const selectClass = "h-9 w-full rounded-md border border-input bg-background px-2.5 text-sm";

/** Typeable, debounced client picker. Searches clients server-side as you type
 *  and reports the chosen client's id + name back up. */
function ClientCombobox({
  clientId,
  clientName,
  onPick,
}: {
  clientId: string;
  clientName: string;
  onPick: (id: string, name: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebouncedValue(query.trim(), 250);

  const { data } = useQuery({
    queryKey: ["client-search", debounced],
    queryFn: () => api.listClientsPage({ page: 1, pageSize: 20, q: debounced }),
    enabled: open,
  });

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger
        render={
          <Button variant="outline" className="h-9 w-full justify-between font-normal">
            <span className="truncate">{clientName || "Select client…"}</span>
            <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
          </Button>
        }
      />
      <PopoverContent align="start" className="w-(--anchor-width) gap-0 overflow-hidden p-0">
        <div className="flex items-center gap-1.5 border-b border-border px-2 py-2.5">
          <Search className="size-4 shrink-0 text-muted-foreground" />
          <input
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search clients…"
            className="h-7 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
          />
        </div>
        <div className="max-h-72 overflow-y-auto p-1">
          {!data && [0, 1, 2].map((i) => <Skeleton key={i} className="mx-2 my-1.5 h-4 w-40" />)}

          {data?.rows.map((c) => (
            <button
              key={c.id}
              type="button"
              onClick={() => {
                onPick(c.id, c.name);
                setOpen(false);
              }}
              className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-muted"
            >
              <Check
                className={cn("size-4 shrink-0", c.id === clientId ? "opacity-100" : "opacity-0")}
              />
              <span className="block min-w-0 flex-1 truncate text-sm text-foreground">
                {c.name}
              </span>
            </button>
          ))}

          {data && data.rows.length === 0 && (
            <p className="px-2 py-3 text-center text-sm text-muted-foreground">No clients found</p>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}

/** Edit a matter's core details: client, name, number, practice area, governing
 *  jurisdiction. Owner-only (the trigger is gated upstream). */
export function EditMatterModal({
  matter,
  open,
  onOpenChange,
  canClose,
  onSaved,
}: {
  matter: Matter;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  canClose: boolean;
  onSaved: () => void;
}) {
  const [clientId, setClientId] = useState(matter.clientId);
  const [clientName, setClientName] = useState("");
  const [name, setName] = useState(matter.name);
  const [practiceArea, setPracticeArea] = useState<string | null>(matter.practiceArea ?? null);
  const [jurisdiction, setJurisdiction] = useState(matter.jurisdiction ?? "");
  const [status, setStatus] = useState(matter.status);
  const [conflictCleared, setConflictCleared] = useState(matter.conflictCleared);
  const [conflictNotes, setConflictNotes] = useState(matter.conflictNotes ?? "");

  // Seed the picker's display name for the matter's current client.
  const { data: currentClient } = useQuery({
    queryKey: ["client", matter.clientId],
    queryFn: () => api.getClient(matter.clientId),
    enabled: open,
  });

  // Reset the form whenever a different matter (or fresh data) opens.
  useEffect(() => {
    if (!open) return;
    setClientId(matter.clientId);
    setClientName(currentClient?.client.name ?? "");
    setName(matter.name);
    setPracticeArea(matter.practiceArea ?? null);
    setJurisdiction(matter.jurisdiction ?? "");
    setStatus(matter.status);
    setConflictCleared(matter.conflictCleared);
    setConflictNotes(matter.conflictNotes ?? "");
  }, [open, matter, currentClient]);

  const save = useMutation({
    mutationFn: () =>
      api.updateMatter(matter.id, {
        clientId,
        name: name.trim(),
        practiceArea,
        jurisdiction: jurisdiction || null,
        // Status + conflict clearance are owner-only.
        ...(canClose && {
          status,
          conflictCleared,
          conflictNotes: conflictCleared ? conflictNotes.trim() || null : null,
        }),
      }),
    onSuccess: () => {
      toast.success("Matter updated");
      onSaved();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Update failed"),
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Edit matter</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex flex-col gap-1.5">
            <Label>Client</Label>
            <ClientCombobox
              clientId={clientId}
              clientName={clientName}
              onPick={(id, n) => {
                setClientId(id);
                setClientName(n);
              }}
            />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Matter name</Label>
            <Input value={name} onChange={(e) => setName(e.target.value)} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Practice area</Label>
            <PracticeAreaPicker value={practiceArea} onChange={setPracticeArea} />
          </div>
          <div className="flex flex-col gap-1.5">
            <Label>Jurisdiction</Label>
            <select
              className={selectClass}
              value={jurisdiction}
              onChange={(e) => setJurisdiction(e.target.value)}
            >
              <option value="">System default (US)</option>
              {JURISDICTIONS.map((j) => (
                <option key={j.code} value={j.code}>
                  {j.label}
                </option>
              ))}
            </select>
          </div>

          {canClose && (
            <div className="flex flex-col gap-3 border-t border-border pt-3">
              <div className="flex items-center justify-between gap-3">
                <Label>Status</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as Matter["status"])}>
                  <SelectTrigger className="w-32 capitalize">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(["open", "closed"] as const).map((s) => (
                      <SelectItem key={s} value={s} className="capitalize">
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center justify-between gap-3">
                <Label htmlFor="conflict-cleared">Conflicts cleared</Label>
                <Switch
                  id="conflict-cleared"
                  checked={conflictCleared}
                  onCheckedChange={setConflictCleared}
                />
              </div>
              {conflictCleared && (
                <div className="flex flex-col gap-1.5">
                  <Label>Conflict notes</Label>
                  <Textarea
                    value={conflictNotes}
                    onChange={(e) => setConflictNotes(e.target.value)}
                    placeholder="What was reviewed to clear conflicts…"
                  />
                </div>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
          <Button
            disabled={!name.trim() || !clientId || save.isPending}
            onClick={() => save.mutate()}
          >
            {save.isPending ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
