import { useRef, useState } from "react";
import { Link, useNavigate } from "@tanstack/react-router";
import { useMutation, useQuery } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/data/api";

/** Compact input confirmation beside the matter documents; inference remains an explicit run. */
export function ContractReviewSetup({
  matterId,
  onClose,
}: {
  matterId: string;
  onClose: () => void;
}) {
  const navigate = useNavigate();
  const [playbookId, setPlaybookId] = useState("");
  const [selected, setSelected] = useState<string[]>([]);
  const requestId = useRef(crypto.randomUUID());
  const {
    data: documents = [],
    isPending: documentsLoading,
    error: documentsError,
  } = useQuery({
    queryKey: ["matter-review-documents", matterId],
    queryFn: () => api.listMatterDocuments(matterId),
  });
  const {
    data: workflows = [],
    isPending: workflowsLoading,
    error: workflowsError,
  } = useQuery({ queryKey: ["approved-playbooks"], queryFn: () => api.listWorkflows() });
  const approved = workflows.filter(
    (w) => w.type === "playbook" && w.status === "approved" && !w.hidden
  );
  const create = useMutation({
    mutationFn: () =>
      api.runPlaybook(playbookId, {
        matterId,
        documentIds: selected,
        requestId: requestId.current,
      }),
    onSuccess: (result) => void navigate({ to: "/reviews/$id", params: { id: result.reviewId } }),
  });
  return (
    <section className="space-y-4 py-4" aria-label="Review contract setup">
      <div className="flex items-center justify-between gap-3">
        <h2 className="font-serif text-xl">Review contract</h2>
        <Button variant="ghost" size="sm" onClick={onClose}>
          Close setup
        </Button>
      </div>
      <p className="max-w-prose text-sm text-muted-foreground">
        Prepare a version-bound review using the firm's approved positions. On the review, run your
        selected model or ask your connected agent to populate cited findings.
      </p>
      {(documentsLoading || workflowsLoading) && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading review inputs…
        </p>
      )}
      {(documentsError || workflowsError) && (
        <p role="alert" className="text-sm text-destructive">
          Could not load review inputs. Close and reopen setup to retry.
        </p>
      )}
      {!documentsLoading && !documents.length && (
        <p className="text-sm">Add a document to this matter first.</p>
      )}
      <fieldset className="space-y-2">
        <legend className="mb-2 text-sm font-medium">Documents</legend>
        {documents.map((doc) => (
          <label key={doc.id} className="flex items-center gap-3 text-sm">
            <input
              type="checkbox"
              disabled={doc.status !== "ready" || create.isPending}
              checked={selected.includes(doc.id)}
              onChange={(e) => {
                requestId.current = crypto.randomUUID();
                setSelected((value) =>
                  e.target.checked ? [...value, doc.id] : value.filter((id) => id !== doc.id)
                );
              }}
            />
            <span className="min-w-0 truncate">{doc.title}</span>
            <span className="text-xs text-muted-foreground">
              {doc.status === "ready"
                ? "Ready"
                : doc.status === "failed"
                  ? "Extraction failed — retry from Documents"
                  : "Preparing source"}
            </span>
          </label>
        ))}
      </fieldset>
      <label className="block max-w-lg space-y-2 text-sm">
        <span className="font-medium">Approved playbook</span>
        <select
          className="h-9 w-full rounded-md border border-input bg-background px-3"
          value={playbookId}
          disabled={create.isPending}
          onChange={(e) => {
            requestId.current = crypto.randomUUID();
            setPlaybookId(e.target.value);
          }}
        >
          <option value="">Choose playbook</option>
          {approved.map((w) => (
            <option key={w.id} value={w.id}>
              {w.title} · {w.rules?.length ?? 0} rules
            </option>
          ))}
        </select>
      </label>
      {!workflowsLoading && !approved.length && (
        <p className="text-sm text-muted-foreground">
          No approved playbook is available.{" "}
          <Link to="/workflows" className="underline">
            Open Library to prepare one.
          </Link>
        </p>
      )}
      {create.error && (
        <p role="alert" className="text-sm text-destructive">
          {create.error instanceof Error ? create.error.message : "Review preparation failed"}
        </p>
      )}
      <div className="flex flex-wrap items-center gap-3">
        <Button
          disabled={!selected.length || !playbookId || create.isPending}
          onClick={() => create.mutate()}
        >
          {create.isPending ? "Preparing…" : "Prepare review"}
        </Button>
        <span className="text-xs text-muted-foreground">
          Source versions and playbook rules are captured before analysis.
        </span>
      </div>
    </section>
  );
}
