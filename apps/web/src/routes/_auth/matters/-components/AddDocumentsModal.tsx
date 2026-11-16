import { notifySuccess } from "@/lib/feedback";
import { Input } from "@/components/ui/input";
import { useMemo, useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { Search, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { fileTypeLabel } from "@/lib/format/documentLabels";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { api } from "../../../../lib/data/api";

/** Add documents to a matter: link pre-existing documents (any the user owns,
 *  across matters) or kick off a fresh upload. Docs already in this matter are
 *  excluded from the list. */
export function AddDocumentsModal({
  matterId,
  open,
  onOpenChange,
  existingIds,
  onLinked,
  onUploadNew,
}: {
  matterId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  existingIds: string[];
  onLinked: () => void;
  onUploadNew: () => void;
}) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const { data: docs } = useQuery({
    queryKey: ["documents"],
    queryFn: () => api.listDocuments(),
    enabled: open,
  });

  const existing = useMemo(() => new Set(existingIds), [existingIds]);
  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (docs ?? [])
      .filter((d) => !existing.has(d.id))
      .filter((d) => !q || d.title.toLowerCase().includes(q));
  }, [docs, existing, query]);

  const link = useMutation({
    mutationFn: () => api.linkDocumentsToMatter(matterId, [...selected]),
    onSuccess: ({ linked }) => {
      notifySuccess(`Added ${linked} document${linked === 1 ? "" : "s"}`);
      onLinked();
      onOpenChange(false);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed to add documents"),
  });

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  // Reset transient state each time the dialog opens.
  function handleOpenChange(next: boolean) {
    if (next) {
      setQuery("");
      setSelected(new Set());
    }
    onOpenChange(next);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add documents</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          <div className="flex items-center gap-2 rounded-md border border-input bg-background px-2.5">
            <Search className="size-4 shrink-0 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search your documents…"
              className="h-9 w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            />
          </div>

          <div className="max-h-72 overflow-y-auto rounded-md border border-border">
            {!docs && [0, 1, 2].map((i) => <Skeleton key={i} className="mx-2 my-2 h-4 w-48" />)}

            {docs &&
              candidates.map((d) => (
                <button
                  key={d.id}
                  type="button"
                  onClick={() => toggle(d.id)}
                  className="flex w-full items-center gap-2.5 border-b border-border px-3 py-2 text-left transition-colors last:border-0 hover:bg-muted"
                >
                  <Checkbox checked={selected.has(d.id)} readOnly tabIndex={-1} aria-hidden />
                  <span className="block min-w-0 flex-1 truncate text-sm font-medium">
                    {d.title}
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground uppercase">
                    {fileTypeLabel(d.fileType)}
                  </span>
                </button>
              ))}

            {docs && candidates.length === 0 && (
              <p className="px-3 py-6 text-center text-sm text-muted-foreground">
                {query.trim() ? "No documents match." : "No other documents to add."}
              </p>
            )}
          </div>
        </div>

        <DialogFooter className="sm:justify-between">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              onUploadNew();
            }}
          >
            <Upload className="size-4" /> Upload new file
          </Button>
          <div className="flex items-center gap-2">
            <DialogClose render={<Button variant="outline" />}>Cancel</DialogClose>
            <Button disabled={selected.size === 0 || link.isPending} onClick={() => link.mutate()}>
              {link.isPending
                ? "Adding…"
                : `Add selected${selected.size ? ` (${selected.size})` : ""}`}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
