import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { FieldDescription } from "@/components/ui/field";
import { useDraftExit } from "@/lib/hooks/useDraftExit";
import { FormFeedback } from "@/components/FormFeedback";
import { Input } from "@/components/ui/input";
import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, Loader2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { api, type Column } from "@/lib/data/api";
import { queryKeys } from "@/lib/data/queries";
import { useMatters } from "@/lib/context/matters-context";
import { ReviewColumnEditor } from "./ReviewColumnEditor";
import { ReviewDocumentPicker } from "./ReviewDocumentPicker";

const NO_TEMPLATE = "none";

export function CreateReviewDialog({
  open,
  onOpenChange,
  onCreated,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreated: (id: string) => void;
}) {
  const qc = useQueryClient();
  const { matters } = useMatters();

  const { data: docs = [] } = useQuery({
    queryKey: queryKeys.documents,
    queryFn: () => api.listDocuments(),
  });
  const { data: workflows = [] } = useQuery({
    queryKey: ["workflows"],
    queryFn: () => api.listWorkflows(),
  });
  const tabularWorkflows = workflows.filter((w) => w.type === "tabular");

  const [title, setTitle] = useState("");
  const [workflowId, setWorkflowId] = useState(NO_TEMPLATE);
  const [underMatter, setUnderMatter] = useState(false);
  const [matterId, setMatterId] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [columns, setColumns] = useState<Column[]>([{ index: 0, name: "", prompt: "" }]);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Reset the form whenever the dialog reopens.
  useEffect(() => {
    if (!open) return;
    setTitle("");
    setWorkflowId(NO_TEMPLATE);
    setUnderMatter(false);
    setMatterId("");
    setSelected(new Set());
    setColumns([{ index: 0, name: "", prompt: "" }]);
  }, [open]);

  const toggleDoc = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const allChecked = docs.length > 0 && docs.every((d) => selected.has(d.id));
  const selectAll = () =>
    setSelected((s) => {
      if (allChecked) {
        const n = new Set(s);
        docs.forEach((d) => n.delete(d.id));
        return n;
      }
      return new Set([...s, ...docs.map((d) => d.id)]);
    });

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(e.target.files ?? []);
    if (!files.length) return;
    setUploading(true);
    try {
      const uploaded = await Promise.all(
        files.map((f) => api.uploadDocument(f, undefined, underMatter ? matterId : undefined))
      );
      void qc.invalidateQueries({ queryKey: queryKeys.documents });
      setSelected((s) => new Set([...s, ...uploaded.map((d) => d.id)]));
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  const createMutation = useMutation({
    onMutate: () => captureActionOrigin(),
    mutationFn: (d: Parameters<typeof api.createReview>[0]) => api.createReview(d),
    onSuccess: ({ id }, _variables, origin) => {
      notifySuccess("Review created", origin);
      exit.resolve();
      void qc.invalidateQueries({ queryKey: queryKeys.reviews });
      onOpenChange(false);
      onCreated(id);
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const [validation, setValidation] = useState("");
  const exit = useDraftExit({
    dirty:
      open &&
      !!(
        title.trim() ||
        selected.size ||
        workflowId !== NO_TEMPLATE ||
        underMatter ||
        columns.some((column) => column.name.trim() || column.prompt.trim())
      ),
    saving: open && (createMutation.isPending || uploading),
    discard: () => {
      setTitle("");
      setSelected(new Set());
      setWorkflowId(NO_TEMPLATE);
      setUnderMatter(false);
      setMatterId("");
      setColumns([{ index: 0, name: "", prompt: "" }]);
    },
  });
  function create() {
    setValidation("");
    const cols = columns
      .filter((c) => c.name.trim() && c.prompt.trim())
      .map((c, i) => ({ ...c, index: i }));
    if (!title.trim() || !selected.size || !cols.length) {
      setValidation(
        "Enter a review name, select a document, and complete at least one review question."
      );
      document.getElementById("new-review-name")?.focus();
      return;
    }
    if (underMatter && !matterId) {
      setValidation("Select the matter for this review.");
      return;
    }
    createMutation.mutate({
      title: title.trim(),
      columnsConfig: cols,
      documentIds: [...selected],
      matterId: underMatter ? matterId : undefined,
    });
  }

  const canCreate = !!title.trim() && (!underMatter || !!matterId);

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
        <DialogContent
          showCloseButton
          className="flex max-h-[85vh] flex-col gap-0 p-0 sm:max-w-2xl"
        >
          <DialogTitle className="sr-only">New review</DialogTitle>
          {/* Breadcrumb header */}
          <div className="flex items-center gap-1.5 border-b border-border px-6 py-4 text-sm text-muted-foreground">
            <span>Reviews</span>
            <ChevronRight className="size-3.5" />
            <span className="text-foreground">New review</span>
          </div>

          <fieldset
            disabled={createMutation.isPending || uploading}
            className="flex min-h-0 flex-1 flex-col gap-section overflow-y-auto px-6 py-5"
          >
            <FormFeedback
              id="new-review-error"
              error={createMutation.error || validation}
              title="Review was not created"
            />
            <Input
              id="new-review-name"
              aria-label="Review name"
              aria-describedby={validation ? "new-review-error" : undefined}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Review name"
              autoFocus
              className="w-full bg-transparent font-serif text-2xl text-foreground placeholder:text-muted-foreground focus:outline-none"
            />

            {/* Workflow template */}
            <div className="flex flex-col gap-field">
              <Label>Workflow template</Label>
              <Select value={workflowId} onValueChange={(v) => setWorkflowId(v as string)}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NO_TEMPLATE}>No template — start from scratch</SelectItem>
                  {tabularWorkflows.map((w) => (
                    <SelectItem key={w.id} value={w.id}>
                      {w.title}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {/* Create under a matter */}
            <div className="flex flex-col gap-field">
              <label className="flex w-fit items-center gap-2.5">
                <Switch
                  checked={underMatter}
                  onCheckedChange={(c) => {
                    setUnderMatter(c);
                    if (!c) setMatterId("");
                  }}
                />
                <span className="text-sm">Create under a matter</span>
              </label>
              {underMatter && (
                <Select value={matterId} onValueChange={(v) => setMatterId(v as string)}>
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Select matter…" />
                  </SelectTrigger>
                  <SelectContent>
                    {matters.map((m) => (
                      <SelectItem key={m.matter.id} value={m.matter.id}>
                        {m.matter.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <ReviewDocumentPicker
              docs={docs}
              matters={matters}
              selected={selected}
              allChecked={allChecked}
              onSelectAll={selectAll}
              onToggle={toggleDoc}
            />

            <ReviewColumnEditor columns={columns} setColumns={setColumns} />
          </fieldset>

          <FieldDescription id="review-create-hint" className="px-6 pb-3">
            {uploading
              ? "Wait for the document upload to finish before creating the review."
              : "To create a review, enter a name, select at least one document and complete a question name and prompt. Select a matter if matter filing is enabled. Creating does not run extraction."}
          </FieldDescription>
          {/* Footer */}
          <div className="flex items-center justify-between border-t border-border px-6 py-4">
            <input
              ref={fileRef}
              type="file"
              accept=".pdf,.docx,.doc"
              multiple
              className="hidden"
              onChange={handleUpload}
            />
            <Button
              type="button"
              variant="outline"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="size-4 animate-spin" />
              ) : (
                <Upload className="size-4" />
              )}
              {uploading ? "Uploading…" : "Upload"}
            </Button>
            <div className="flex items-center gap-2">
              <Button
                type="button"
                variant="ghost"
                onClick={() => exit.requestClose(() => onOpenChange(false))}
              >
                Cancel
              </Button>
              <Button
                type="button"
                onClick={create}
                disabled={!canCreate || createMutation.isPending}
                aria-describedby="review-create-hint"
              >
                {createMutation.isPending ? "Creating…" : "Create"}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
