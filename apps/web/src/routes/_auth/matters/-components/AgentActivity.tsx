import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApprovalPolicy,
  ApprovalProposal,
  CellProposal,
  ProposalDecisionInput,
  ProposalStatus,
} from "@workspace/contracts";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

async function request<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, { ...init, headers: { "Content-Type": "application/json" } });
  const result = await response.json();
  if (!response.ok) throw new Error(result.error ?? "Request failed.");
  return result as T;
}
export function AgentActivity({ matterId, isOwner }: { matterId: string; isOwner: boolean }) {
  const qc = useQueryClient();
  const [status, setStatus] = useState<ProposalStatus>("pending");
  const [cursor, setCursor] = useState<string>();
  const [selectedId, setSelectedId] = useState<string>();
  const [note, setNote] = useState("");
  const [confirmDecision, setConfirmDecision] = useState<"approve" | "reject">();
  const [policyOpen, setPolicyOpen] = useState(false);
  const [gate, setGate] = useState<ApprovalPolicy["agentCells"]>("direct");
  const [documentRole, setDocumentRole] = useState<"editor" | "owner">("editor");
  const [exportGate, setExportGate] = useState<"direct" | "editor" | "owner">("direct");
  const [workflowGate, setWorkflowGate] = useState<"direct" | "editor" | "owner">("direct");
  const [batchIds, setBatchIds] = useState<string[]>([]);
  const [batchNote, setBatchNote] = useState("");
  const [confirmBatch, setConfirmBatch] = useState<"approve" | "reject">();
  const [findingRole, setFindingRole] = useState<"editor" | "owner">("editor");
  const [reason, setReason] = useState("");
  // Keep an uncertain request's receipt key until its exact input changes.
  const receipts = useRef(new Map<string, string>());
  const queueKey = ["matter-proposals", matterId];
  const {
    data: queue,
    isPending,
    error,
  } = useQuery({
    queryKey: [...queueKey, status, cursor],
    queryFn: () =>
      request<{ items: ApprovalProposal[]; nextCursor: string | null }>(
        `/api/matters/${matterId}/proposals?status=${status}${cursor ? `&afterId=${cursor}` : ""}`
      ),
    refetchInterval: 10000,
  });
  const { data: policy } = useQuery({
    queryKey: ["approval-policy", matterId],
    queryFn: () =>
      request<{ policy: ApprovalPolicy; revision: number }>(
        `/api/matters/${matterId}/approval-policy`
      ),
  });
  const { data: selected, error: detailError } = useQuery({
    queryKey: ["proposal", selectedId],
    enabled: !!selectedId,
    queryFn: () => request<ApprovalProposal>(`/api/proposals/${selectedId}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queueKey });
    void qc.invalidateQueries({ queryKey: ["proposal", selectedId] });
    void qc.invalidateQueries({ queryKey: ["tabular"] });
    void qc.invalidateQueries({ queryKey: ["workflows"] });
  };
  const decide = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      if (!selected) throw new Error("Select a proposal first.");
      const key = JSON.stringify([
        selected.id,
        selected.revision,
        selected.contentHash,
        selected.policyRevision,
        decision,
        note,
      ]);
      const requestId = receipts.current.get(key) ?? crypto.randomUUID();
      receipts.current.set(key, requestId);
      const input: ProposalDecisionInput = {
        requestId,
        proposalId: selected.id,
        revision: selected.revision,
        contentHash: selected.contentHash,
        policyRevision: selected.policyRevision,
        decision,
        ...(note.trim() ? { note: note.trim() } : {}),
      };
      return request<{ outcome: string }>(`/api/proposals/${selected.id}/decision`, {
        method: "POST",
        body: JSON.stringify(input),
      });
    },
    onSuccess: (result) => {
      toast.success(
        result.outcome === "applied"
          ? "Proposal applied and recorded."
          : "Proposal rejected and recorded."
      );
      setConfirmDecision(undefined);
      setNote("");
      refresh();
    },
    onError: (error) => {
      toast.error(error.message);
      refresh();
    },
  });
  const changePolicy = useMutation({
    mutationFn: () =>
      request(`/api/matters/${matterId}/approval-policy`, {
        method: "PUT",
        body: JSON.stringify({
          policy: {
            ...policy?.policy,
            agentCells: gate,
            escalationDecisions: findingRole,
            documentEdits: documentRole,
            agentWorkflows: workflowGate,
            cleanExports: {
              approvalAboveDocuments: exportGate === "direct" ? 1 : 0,
              approvalAboveProviderCostMicros: 0,
              requiredRole: exportGate === "owner" ? "owner" : "editor",
            },
          },
          expectedRevision: policy?.revision,
          reason,
        }),
      }),
    onSuccess: () => {
      setPolicyOpen(false);
      setReason("");
      void qc.invalidateQueries({ queryKey: ["approval-policy", matterId] });
      refresh();
      toast.success("Policy change recorded.");
    },
    onError: (error) => toast.error(error.message),
  });
  const batch = (queue?.items ?? []).filter(
    (item): item is CellProposal => item.kind === "cell" && batchIds.includes(item.id)
  );
  const batchContext = (item: CellProposal) =>
    JSON.stringify([
      item.matterId,
      item.artifactId,
      item.policyRevision,
      item.requiredRole,
      item.payload.documentId,
      item.payload.sourceVersionId,
      item.payload.sourceHash,
    ]);
  const batchCompatible =
    batch.length > 0 &&
    batch.length === batchIds.length &&
    batch.length <= 50 &&
    new Set(batch.map(batchContext)).size === 1 &&
    batch.every(
      (item) => item.status === "pending" && item.mayDecide && !item.stale && !item.policyChanged
    );
  const decideBatch = useMutation({
    mutationFn: async (decision: "approve" | "reject") => {
      if (!batchCompatible)
        throw new Error(
          "Select current cell proposals from the same review, source and policy context."
        );
      const decisions: ProposalDecisionInput[] = batch.map((item) => {
        const key = JSON.stringify([
          item.id,
          item.revision,
          item.contentHash,
          item.policyRevision,
          decision,
          batchNote,
        ]);
        const requestId = receipts.current.get(key) ?? crypto.randomUUID();
        receipts.current.set(key, requestId);
        return {
          requestId,
          proposalId: item.id,
          revision: item.revision,
          contentHash: item.contentHash,
          policyRevision: item.policyRevision,
          decision,
          ...(batchNote.trim() ? { note: batchNote.trim() } : {}),
        };
      });
      return request("/api/proposals/decisions", {
        method: "POST",
        body: JSON.stringify({ decisions }),
      });
    },
    onSuccess: () => {
      setBatchIds([]);
      setConfirmBatch(undefined);
      setBatchNote("");
      refresh();
      toast.success("Every batch decision was recorded.");
    },
    onError: (error) => {
      refresh();
      toast.error(error.message);
    },
  });
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4" aria-label="Agent activity">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm">Requests and agent proposals awaiting review</p>
          <p className="text-xs text-muted-foreground">
            Agent cell writes:{" "}
            {policy?.policy.agentCells === "direct"
              ? "Direct, audited"
              : policy
                ? `${policy.policy.agentCells} decision required`
                : "Loading policy…"}
            . Document changes require a human {policy?.policy.documentEdits ?? "editor"} decision.
            Matter workflow writes: {policy?.policy.agentWorkflows ?? "direct"}.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor={`proposal-status-${matterId}`}>Show</Label>
          <select
            id={`proposal-status-${matterId}`}
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={status}
            onChange={(e) => {
              setStatus(e.target.value as ProposalStatus);
              setCursor(undefined);
              setSelectedId(undefined);
              setBatchIds([]);
            }}
          >
            <option value="pending">Needs decision</option>
            <option value="applied">Applied</option>
            <option value="rejected">Rejected</option>
            <option value="withdrawn">Withdrawn</option>
          </select>
          {isOwner && (
            <Button
              variant="outline"
              disabled={!policy}
              onClick={() => {
                setGate(policy!.policy.agentCells);
                setFindingRole(policy!.policy.escalationDecisions ?? "editor");
                setDocumentRole(policy!.policy.documentEdits ?? "editor");
                setWorkflowGate(policy!.policy.agentWorkflows ?? "direct");
                setExportGate(
                  policy!.policy.cleanExports?.approvalAboveDocuments === 0
                    ? policy!.policy.cleanExports.requiredRole
                    : "direct"
                );
                setPolicyOpen(true);
              }}
            >
              Approval policy
            </Button>
          )}
        </div>
      </div>
      {error && (
        <p role="alert" className="text-sm text-destructive">
          {error.message}
        </p>
      )}
      {isPending && (
        <p role="status" className="text-sm text-muted-foreground">
          Loading proposals…
        </p>
      )}
      {queue && !queue.items.length && (
        <p className="py-8 text-sm text-muted-foreground">
          {status === "pending"
            ? "There is nothing awaiting review."
            : "No proposals match this filter."}
        </p>
      )}
      {batchIds.length > 0 && (
        <div className="space-y-2">
          <p className="text-sm">{batchIds.length} selected for one atomic decision</p>
          {!batchCompatible && (
            <p role="status" className="text-xs text-destructive">
              Choose current cell proposals sharing one review, source, authority and policy.
              Workflow proposals are decided individually.
            </p>
          )}
          <Label htmlFor="batch-decision-note">Batch note (required to reject)</Label>
          <Textarea
            id="batch-decision-note"
            value={batchNote}
            maxLength={4000}
            onChange={(e) => setBatchNote(e.target.value)}
          />
          <div className="flex gap-2">
            <Button
              disabled={!batchCompatible || decideBatch.isPending}
              onClick={() => setConfirmBatch("approve")}
            >
              Review and apply {batchIds.length}
            </Button>
            <Button
              variant="outline"
              disabled={!batchCompatible || !batchNote.trim() || decideBatch.isPending}
              onClick={() => setConfirmBatch("reject")}
            >
              Review and reject {batchIds.length}
            </Button>
            <Button variant="ghost" onClick={() => setBatchIds([])}>
              Clear selection
            </Button>
          </div>
        </div>
      )}
      <div className="grid min-h-0 gap-6 overflow-auto md:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <div className="space-y-1">
          {queue?.items.map((item) => (
            <div key={item.id} className="flex items-start gap-2">
              {status === "pending" && item.kind === "cell" && (
                <input
                  type="checkbox"
                  className="mt-4 size-4 accent-primary"
                  aria-label={`Select ${proposalTitle(item)} for batch decision`}
                  checked={batchIds.includes(item.id)}
                  disabled={!item.mayDecide || item.policyChanged || item.stale}
                  onChange={(e) =>
                    setBatchIds(
                      e.target.checked
                        ? [...batchIds, item.id]
                        : batchIds.filter((id) => id !== item.id)
                    )
                  }
                />
              )}
              <Button
                variant={selectedId === item.id ? "secondary" : "ghost"}
                className="h-auto flex-1 justify-start py-3 text-left whitespace-normal"
                onClick={() => {
                  setSelectedId(item.id);
                  setNote("");
                }}
              >
                <span>
                  <span className="block">{proposalTitle(item)}</span>
                  <span className="block text-xs font-normal text-muted-foreground">
                    {item.agentLabel ?? "Agent"} · {item.kind} · {item.status}
                    {item.policyChanged ? " · Policy changed" : ""}
                  </span>
                </span>
              </Button>
            </div>
          ))}
          {queue?.nextCursor && (
            <Button
              variant="ghost"
              onClick={() => {
                setCursor(queue.nextCursor!);
                setSelectedId(undefined);
              }}
            >
              Next proposals
            </Button>
          )}
          {cursor && (
            <Button variant="ghost" onClick={() => setCursor(undefined)}>
              First page
            </Button>
          )}
        </div>
        <div className="space-y-4">
          {detailError && <p role="alert">{detailError.message}</p>}
          {selected && (
            <>
              <div>
                <p className="text-sm font-medium">{proposalTitle(selected)}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.status} · {selected.requiredRole} decision required · proposal revision{" "}
                  {selected.revision}
                </p>
              </div>
              {selected.kind === "cell" ? (
                <>
                  <div className="grid gap-4 sm:grid-cols-2">
                    <div>
                      <p className="text-xs text-muted-foreground">Accepted before this proposal</p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {selected.payload.beforeContent?.summary ?? "No accepted result"}
                      </p>
                      <p className="mt-2 text-sm whitespace-pre-wrap text-muted-foreground">
                        {selected.payload.beforeContent?.reasoning}
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">
                        Proposed · {selected.payload.content.flag}
                      </p>
                      <p className="mt-1 text-sm whitespace-pre-wrap">
                        {selected.payload.content.summary}
                      </p>
                      <p className="mt-2 text-sm whitespace-pre-wrap">
                        {selected.payload.content.reasoning}
                      </p>
                    </div>
                  </div>
                  <div>
                    <p className="text-xs text-muted-foreground">
                      Source evidence · version{" "}
                      {selected.payload.sourceVersionId?.slice(0, 8) ?? "legacy source"}
                    </p>
                    {selected.payload.citations.length ? (
                      selected.payload.citations.map((citation, i) => (
                        <blockquote
                          key={i}
                          className="mt-2 border-l-2 pl-3 text-sm whitespace-pre-wrap"
                        >
                          {citation.quote}
                        </blockquote>
                      ))
                    ) : (
                      <p className="mt-1 text-sm text-muted-foreground">
                        No quoted source evidence.
                      </p>
                    )}
                  </div>
                </>
              ) : selected.kind === "workflow" ? (
                <div className="space-y-3">
                  <p className="text-xs text-muted-foreground">
                    {selected.payload.action === "create"
                      ? "A workflow will be created only after approval."
                      : "The proposed fields replace the accepted workflow in one audited decision."}
                  </p>
                  {Object.entries(selected.payload.after).map(([key, after]) => {
                    const before =
                      selected.payload.before?.[key as keyof typeof selected.payload.after] ?? null;
                    if (JSON.stringify(before) === JSON.stringify(after)) return null;
                    return (
                      <details key={key} open={key === "title" || key === "promptMd"}>
                        <summary className="cursor-pointer text-sm font-medium">
                          {workflowFieldLabel(key)}
                        </summary>
                        <div className="mt-2 grid gap-3 sm:grid-cols-2">
                          <div>
                            <p className="text-xs text-muted-foreground">Accepted</p>
                            <pre className="mt-1 font-sans text-sm break-words whitespace-pre-wrap">
                              {displayField(before)}
                            </pre>
                          </div>
                          <div>
                            <p className="text-xs text-muted-foreground">Proposed</p>
                            <pre className="mt-1 font-sans text-sm break-words whitespace-pre-wrap">
                              {displayField(after)}
                            </pre>
                          </div>
                        </div>
                      </details>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-3">
                  <p className="text-sm">
                    Authorize one clean DOCX with no incremental model-provider cost. This excludes
                    hosting and storage fees.
                  </p>
                  <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-2 text-xs">
                    <dt>Output</dt>
                    <dd>Clean DOCX</dd>
                    <dt>Document version</dt>
                    <dd className="break-all">{selected.payload.versionId}</dd>
                    <dt>Document audit cutoff</dt>
                    <dd className="break-all">
                      {selected.payload.documentCommitId ?? "Original source"}
                    </dd>
                    <dt>Review audit cutoff</dt>
                    <dd className="break-all">
                      {selected.payload.reviewCommitId ?? "Original review"}
                    </dd>
                    <dt>Documents / provider cost ceiling</dt>
                    <dd>1 / 0 USD</dd>
                  </dl>
                  <a
                    className="text-sm underline underline-offset-4"
                    href={`/api/documents/${selected.payload.documentId}/versions/${selected.payload.versionId}/download`}
                  >
                    Inspect the exact source DOCX
                  </a>
                  {selected.mayRetrieve && (
                    <a
                      className="block text-sm underline underline-offset-4"
                      href={`/api/documents/${selected.payload.documentId}/download?output=clean&reviewId=${selected.payload.reviewId}&approvalId=${selected.id}`}
                    >
                      Download approved clean DOCX
                    </a>
                  )}
                </div>
              )}
              {selected.stale && selected.status === "pending" && (
                <p role="status" className="text-sm text-destructive">
                  Source or accepted content changed. Reject or withdraw this proposal, then create
                  a revised proposal from current source or accepted content.
                </p>
              )}
              {selected.policyChanged && selected.status === "pending" && (
                <p role="status" className="text-sm text-destructive">
                  Policy changed. Reject or withdraw this proposal and create a revision under
                  current policy before applying.
                </p>
              )}
              {selected.status === "pending" && (
                <>
                  <Label htmlFor={`decision-note-${selected.id}`}>
                    Decision note (required to reject)
                  </Label>
                  <Textarea
                    id={`decision-note-${selected.id}`}
                    value={note}
                    maxLength={4000}
                    onChange={(e) => setNote(e.target.value)}
                  />
                  {selected.mayDecide ? (
                    <div className="flex gap-2">
                      <Button
                        disabled={selected.policyChanged || selected.stale || decide.isPending}
                        onClick={() => setConfirmDecision("approve")}
                      >
                        Approve and apply
                      </Button>
                      <Button
                        variant="outline"
                        disabled={!note.trim() || decide.isPending}
                        onClick={() => setConfirmDecision("reject")}
                      >
                        Reject
                      </Button>
                    </div>
                  ) : (
                    <p className="text-sm text-muted-foreground">
                      A current matter {selected.requiredRole} with artifact edit access must decide
                      this proposal.
                    </p>
                  )}
                </>
              )}
              <details>
                <summary className="cursor-pointer text-xs text-muted-foreground">
                  Audit binding and decisions
                </summary>
                <p className="mt-2 text-xs break-all">
                  Proposal commit: {selected.proposalCommitId}
                  <br />
                  Content: {selected.contentHash}
                  <br />
                  Captured policy revision: {selected.policyRevision}
                </p>
                {selected.decisions.map((d) => (
                  <p key={d.id} className="mt-2 text-sm whitespace-pre-wrap">
                    {d.decision}: {d.note ?? "No note"} ·{" "}
                    {new Date(d.createdAt).toLocaleString(undefined, { timeZoneName: "short" })}
                  </p>
                ))}
              </details>
            </>
          )}
        </div>
      </div>
      <Dialog
        open={!!confirmDecision}
        onOpenChange={(open) => {
          if (!open) setConfirmDecision(undefined);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {confirmDecision === "approve"
                ? "Apply this exact proposal?"
                : "Reject this proposal?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {confirmDecision === "approve"
              ? "The exact proposal will be applied or its requested output authorized. Your decision and the original agent attribution will be recorded together."
              : "Accepted content will stay unchanged. Your rejection and note will remain in history."}
          </p>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDecision(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={decide.isPending}
              onClick={() => confirmDecision && decide.mutate(confirmDecision)}
            >
              {decide.isPending
                ? "Recording…"
                : confirmDecision === "approve"
                  ? "Apply proposal"
                  : "Reject proposal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmBatch}
        onOpenChange={(open) => {
          if (!open) setConfirmBatch(undefined);
        }}
      >
        <DialogContent className="max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {confirmBatch === "approve" ? "Apply" : "Reject"} {batch.length} exact cell proposals?
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            Every item will receive your individual decision in one transaction. If any item changed
            or access was revoked, none will be applied.
          </p>
          {batch.map((item) => (
            <details key={item.id}>
              <summary className="cursor-pointer text-sm font-medium">
                {item.payload.content.summary}
              </summary>
              <div className="mt-2 grid gap-3 sm:grid-cols-2">
                <pre className="font-sans text-sm whitespace-pre-wrap">
                  {displayField(item.payload.beforeContent)}
                </pre>
                <pre className="font-sans text-sm whitespace-pre-wrap">
                  {displayField(item.payload.content)}
                </pre>
              </div>
              {item.payload.citations.map((citation, index) => (
                <blockquote key={index} className="mt-2 border-l pl-3 text-sm whitespace-pre-wrap">
                  {citation.quote}
                </blockquote>
              ))}
            </details>
          ))}
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmBatch(undefined)}>
              Cancel
            </Button>
            <Button
              disabled={
                !batchCompatible ||
                decideBatch.isPending ||
                (confirmBatch === "reject" && !batchNote.trim())
              }
              onClick={() => confirmBatch && decideBatch.mutate(confirmBatch)}
            >
              {decideBatch.isPending
                ? "Recording…"
                : `${confirmBatch === "approve" ? "Apply" : "Reject"} all ${batch.length}`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Matter approval policy</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This gate applies to agent writes across the review API, connected agents, and workers.
            Pending proposals require renewed review after a policy change. Document resolutions
            always require a person. Firm Library publication retains its separate admin authority.
          </p>
          <Label htmlFor="cell-approval-gate">Required decision</Label>
          <select
            id="cell-approval-gate"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={gate}
            onChange={(e) => setGate(e.target.value as ApprovalPolicy["agentCells"])}
          >
            <option value="direct">Direct, audited agent writes</option>
            <option value="editor">Human editor approval</option>
            <option value="owner">Human matter owner approval</option>
          </select>
          <Label htmlFor="document-approval-role">Document changes</Label>
          <select
            id="document-approval-role"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={documentRole}
            onChange={(e) => setDocumentRole(e.target.value as "editor" | "owner")}
          >
            <option value="editor">Human editor resolution</option>
            <option value="owner">Human matter owner resolution</option>
          </select>
          <Label htmlFor="workflow-approval-gate">Agent matter workflow changes</Label>
          <select
            id="workflow-approval-gate"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={workflowGate}
            onChange={(e) => setWorkflowGate(e.target.value as "direct" | "editor" | "owner")}
          >
            <option value="direct">Direct, audited agent writes</option>
            <option value="editor">Human editor approval</option>
            <option value="owner">Human matter owner approval</option>
          </select>
          <Label htmlFor="export-approval-gate">Clean DOCX export</Label>
          <select
            id="export-approval-gate"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={exportGate}
            onChange={(e) => setExportGate(e.target.value as "direct" | "editor" | "owner")}
          >
            <option value="direct">Allow one resolved DOCX within limits</option>
            <option value="editor">Human editor approves each exact output</option>
            <option value="owner">Human matter owner approves each exact output</option>
          </select>
          <p className="text-xs text-muted-foreground">
            This output supports one document and makes no model call. Each approval binds its
            document version and review history; changed inputs require a new request.
          </p>
          <Label htmlFor="finding-approval-role">Finding and escalation decisions</Label>
          <select
            id="finding-approval-role"
            className="h-9 rounded-md border border-input bg-background px-2 text-sm"
            value={findingRole}
            onChange={(e) => setFindingRole(e.target.value as "editor" | "owner")}
          >
            <option value="editor">Human editor can decide to leave language unchanged</option>
            <option value="owner">Human matter owner must decide</option>
          </select>
          <p className="text-xs text-muted-foreground">
            Editors can always request escalation. Resolving it uses this required role.
          </p>
          <Label htmlFor="policy-reason">Reason for changing policy</Label>
          <Textarea
            id="policy-reason"
            value={reason}
            maxLength={4000}
            onChange={(e) => setReason(e.target.value)}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setPolicyOpen(false)}>
              Cancel
            </Button>
            <Button
              disabled={!reason.trim() || changePolicy.isPending}
              onClick={() => changePolicy.mutate()}
            >
              {changePolicy.isPending ? "Recording…" : "Confirm policy change"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}

function proposalTitle(proposal: ApprovalProposal) {
  return proposal.kind === "cell"
    ? proposal.payload.content.summary || "Cell proposal"
    : proposal.kind === "export"
      ? "Clean DOCX export request"
      : `${proposal.payload.action === "create" ? "Create" : "Change"} ${proposal.payload.after.title}`;
}
function displayField(value: unknown) {
  return value === null
    ? "No accepted value"
    : typeof value === "string"
      ? value
      : JSON.stringify(value, null, 2);
}
function workflowFieldLabel(key: string) {
  return (
    (
      {
        title: "Title",
        type: "Workflow type",
        promptMd: "Prompt",
        steps: "Steps",
        columnsConfig: "Review columns",
        rules: "Playbook rules",
        status: "Status",
        practice: "Practice",
      } as Record<string, string>
    )[key] ?? key
  );
}
