import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
  GUIDED_TASKS,
  JURISDICTIONS,
  type GuidedTaskId,
  type PreparedGuidedTask,
} from "@workspace/registry";
import { Link } from "@tanstack/react-router";
import { api } from "@/lib/data/api";
import { guidedApi } from "@/lib/data/guided-api";
import { practiceApi } from "@/lib/data/practice-api";
import { queryKeys } from "@/lib/data/queries";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";

const selectClass =
  "h-10 w-full rounded-md border border-input bg-background px-3 text-sm focus-visible:outline-2 focus-visible:outline-ring";

export function GuidedTaskDialog({
  taskId,
  onClose,
  onStart,
}: {
  taskId: GuidedTaskId;
  onClose: () => void;
  onStart: (seed: PreparedGuidedTask) => void;
}) {
  const task = GUIDED_TASKS.find((item) => item.id === taskId)!;
  const qc = useQueryClient();
  const [matterId, setMatterId] = useState("");
  const [documentIds, setDocumentIds] = useState<string[]>([]);
  const [jurisdiction, setJurisdiction] = useState("");
  const [instructions, setInstructions] = useState("");
  const [prepared, setPrepared] = useState<PreparedGuidedTask | null>(null);
  const [prompt, setPrompt] = useState("");
  const matters = useQuery({ queryKey: queryKeys.matters, queryFn: api.listMatters });
  const profile = useQuery({ queryKey: ["practice-profile"], queryFn: practiceApi.getProfile });
  const sourceDocuments = useQuery({
    queryKey: ["guided-documents", matterId],
    queryFn: () => api.listMatterDocuments(matterId),
    enabled: !!matterId,
  });
  const selectedMatter = matters.data?.find((item) => item.matter.id === matterId)?.matter;
  const effectiveJurisdiction =
    jurisdiction ||
    (selectedMatter?.jurisdiction?.startsWith("AU")
      ? selectedMatter.jurisdiction
      : profile.data?.profile.jurisdiction) ||
    "AU";

  const sample = useMutation({
    mutationFn: guidedApi.sample,
    onSuccess: async (result) => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: queryKeys.matters }),
        qc.invalidateQueries({ queryKey: queryKeys.clients }),
        qc.invalidateQueries({ queryKey: queryKeys.documents }),
        qc.invalidateQueries({ queryKey: ["guided-documents", result.matterId] }),
      ]);
      setMatterId(result.matterId);
      setDocumentIds(result.documentIds);
      setJurisdiction("AU-NSW");
      setInstructions(
        "We act for the fictional customer, Harbour Studio. Explain the proposed commitments and questions to resolve before signing. Do not assume acceptance or payment occurred."
      );
      setPrepared(null);
    },
  });
  const prepare = useMutation({
    mutationFn: () =>
      guidedApi.prepare({
        task: taskId,
        matterId,
        documentIds,
        jurisdiction: effectiveJurisdiction,
        instructions,
      }),
    onSuccess: (result) => {
      setPrepared(result);
      setPrompt(result.prompt);
    },
  });
  const start = useMutation({
    // Recheck permissions and readiness immediately before launching the model.
    mutationFn: () =>
      guidedApi.prepare({
        task: taskId,
        matterId,
        documentIds,
        jurisdiction: effectiveJurisdiction,
        instructions,
      }),
    onSuccess: (result) => {
      onStart({ ...result, prompt: prompt.trim() });
      onClose();
    },
  });
  const busy = sample.isPending || prepare.isPending || start.isPending;
  const error = sample.error || prepare.error || start.error;
  const editableMatters =
    matters.data?.filter((item) => item.role !== "viewer" && item.matter.status === "open") ?? [];
  const canPrepare =
    !!matterId && documentIds.length > 0 && instructions.trim().length > 0 && !busy;

  function changeMatter(next: string) {
    setMatterId(next);
    setDocumentIds([]);
    setPrepared(null);
    setJurisdiction("");
  }

  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open && !busy) onClose();
      }}
    >
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{task.title}</DialogTitle>
          <DialogDescription>
            {task.description} Prepare instructions first; starting the assistant uses your selected
            AI account.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-5">
          <div className="rounded-lg bg-muted/60 p-4">
            <p className="font-medium">Try with fictional material</p>
            <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
              Creates or reopens a clearly labelled fictional client, matter, and two sample
              documents in your practice. No AI call runs until you start.
            </p>
            <Button
              type="button"
              variant="outline"
              className="mt-3"
              disabled={busy}
              onClick={() => sample.mutate()}
            >
              {sample.isPending ? "Preparing sample…" : "Open fictional sample"}
            </Button>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guided-matter">Matter</Label>
            <select
              id="guided-matter"
              className={selectClass}
              value={matterId}
              onChange={(event) => changeMatter(event.target.value)}
              disabled={busy || matters.isPending}
            >
              <option value="">
                {matters.isPending ? "Loading matters…" : "Choose an open matter"}
              </option>
              {editableMatters.map((item) => (
                <option key={item.matter.id} value={item.matter.id}>
                  {item.client.name} · {item.matter.name}
                </option>
              ))}
            </select>
            {matters.isError ? (
              <p role="alert" className="text-xs text-destructive">
                Could not load matters.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    void matters.refetch();
                  }}
                >
                  Try again
                </button>
              </p>
            ) : null}
            {!matters.isPending && !matters.isError && !editableMatters.length ? (
              <p className="text-xs text-muted-foreground">
                Create a matter from{" "}
                <Link to="/matters" className="underline">
                  Matters
                </Link>
                , or open the fictional sample.
              </p>
            ) : null}
          </div>
          <fieldset className="flex flex-col gap-2" disabled={busy || !matterId}>
            <legend className="mb-2 text-sm font-medium">Source documents</legend>
            {matterId && sourceDocuments.isPending ? (
              <p role="status" className="text-xs text-muted-foreground">
                Loading documents…
              </p>
            ) : null}
            {sourceDocuments.isError ? (
              <p role="alert" className="text-xs text-destructive">
                Could not load source documents.{" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => {
                    void sourceDocuments.refetch();
                  }}
                >
                  Try again
                </button>
              </p>
            ) : null}
            {(sourceDocuments.data ?? []).map((doc) => (
              <label
                key={doc.id}
                className="flex items-start gap-3 rounded-md px-2 py-2 hover:bg-muted/50"
              >
                <input
                  type="checkbox"
                  className="mt-0.5 size-4 accent-primary"
                  checked={documentIds.includes(doc.id)}
                  disabled={doc.status !== "ready"}
                  onChange={(event) => {
                    setDocumentIds((previous) =>
                      event.target.checked
                        ? [...previous, doc.id]
                        : previous.filter((id) => id !== doc.id)
                    );
                    setPrepared(null);
                  }}
                />
                <span className="min-w-0 text-sm">
                  {doc.title}
                  <span className="ml-2 text-xs text-muted-foreground">
                    {doc.status === "ready"
                      ? "Ready"
                      : doc.status === "failed"
                        ? "Extraction failed"
                        : "Processing"}
                  </span>
                </span>
              </label>
            ))}
            {matterId &&
            !sourceDocuments.isPending &&
            !sourceDocuments.isError &&
            !sourceDocuments.data?.length ? (
              <p className="text-xs text-muted-foreground">
                This matter has no source documents. Add documents from its matter workspace, or
                open the fictional sample.
              </p>
            ) : null}
            <p className="text-xs text-muted-foreground">
              Select up to 25 ready documents. Every selected source is checked again before the
              assistant starts.
            </p>
          </fieldset>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guided-jurisdiction">Applicable jurisdiction</Label>
            <select
              id="guided-jurisdiction"
              className={selectClass}
              value={effectiveJurisdiction}
              disabled={busy}
              onChange={(event) => {
                setJurisdiction(event.target.value);
                setPrepared(null);
              }}
            >
              {JURISDICTIONS.filter((item) => item.code.startsWith("AU")).map((item) => (
                <option key={item.code} value={item.code}>
                  {item.label}
                </option>
              ))}
            </select>
            <p className="text-xs text-muted-foreground">
              Confirm this for the work. It is separate from your document storage region.
            </p>
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="guided-instructions">Your client’s role and instructions</Label>
            <Textarea
              id="guided-instructions"
              value={instructions}
              maxLength={4000}
              disabled={busy}
              onChange={(event) => {
                setInstructions(event.target.value);
                setPrepared(null);
              }}
              placeholder="Who do you act for, what do they need, and which questions should the draft address?"
            />
          </div>
          {prepared ? (
            <div className="flex flex-col gap-2">
              <Label htmlFor="guided-prompt">Review and edit the prepared instructions</Label>
              <Textarea
                id="guided-prompt"
                value={prompt}
                maxLength={20000}
                disabled={busy}
                onChange={(event) => setPrompt(event.target.value)}
                className="min-h-56 text-sm"
              />
              <p className="text-xs leading-relaxed text-muted-foreground">
                AI output remains a draft. Check source support and extracted dates before relying
                on it. If your AI account is not configured,{" "}
                <Link to="/settings" className="underline">
                  open Settings
                </Link>
                .
              </p>
            </div>
          ) : null}
          {profile.isError ? (
            <p className="text-xs text-muted-foreground">
              Practice preferences could not be loaded. Preparation will retry them before
              continuing.
            </p>
          ) : null}
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error.message}
            </p>
          ) : null}
          <div className="flex flex-wrap justify-end gap-2">
            <Button type="button" variant="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </Button>
            {prepared ? (
              <Button
                type="button"
                disabled={busy || !prompt.trim()}
                onClick={() => start.mutate()}
              >
                {start.isPending ? "Checking sources…" : "Start in assistant"}
              </Button>
            ) : (
              <Button type="button" disabled={!canPrepare} onClick={() => prepare.mutate()}>
                {prepare.isPending ? "Preparing…" : "Prepare instructions"}
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
