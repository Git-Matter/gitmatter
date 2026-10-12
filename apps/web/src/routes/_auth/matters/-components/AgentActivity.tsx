import { useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type {
  ApprovalPolicy,
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
      request<{ items: CellProposal[]; nextCursor: string | null }>(
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
    queryFn: () => request<CellProposal>(`/api/proposals/${selectedId}`),
  });
  const refresh = () => {
    void qc.invalidateQueries({ queryKey: queueKey });
    void qc.invalidateQueries({ queryKey: ["proposal", selectedId] });
    void qc.invalidateQueries({ queryKey: ["tabular"] });
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
          policy: { agentCells: gate, escalationDecisions: findingRole },
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
  return (
    <section className="flex min-h-0 flex-1 flex-col gap-4" aria-label="Agent activity">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-sm">Cell proposals awaiting human review</p>
          <p className="text-xs text-muted-foreground">
            Agent cell writes:{" "}
            {policy?.policy.agentCells === "direct"
              ? "Direct, audited"
              : policy
                ? `${policy.policy.agentCells} decision required`
                : "Loading policy…"}
            . Document changes always require human resolution.
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
      <div className="grid min-h-0 gap-6 overflow-auto md:grid-cols-[minmax(220px,1fr)_minmax(0,2fr)]">
        <div className="space-y-1">
          {queue?.items.map((item) => (
            <Button
              key={item.id}
              variant={selectedId === item.id ? "secondary" : "ghost"}
              className="h-auto w-full justify-start py-3 text-left whitespace-normal"
              onClick={() => {
                setSelectedId(item.id);
                setNote("");
              }}
            >
              <span>
                <span className="block">{item.payload.content.summary || "Cell proposal"}</span>
                <span className="block text-xs font-normal text-muted-foreground">
                  {item.agentLabel ?? "Agent"} · {item.payload.content.flag} · {item.status}
                  {item.policyChanged ? " · Policy changed" : ""}
                </span>
              </span>
            </Button>
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
                <p className="text-sm font-medium">{selected.payload.content.summary}</p>
                <p className="text-xs text-muted-foreground">
                  {selected.status} · {selected.requiredRole} decision required · proposal revision{" "}
                  {selected.revision}
                </p>
              </div>
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
                      {citation.page !== undefined && (
                        <span className="ml-2 text-xs text-muted-foreground">
                          Page {citation.page}
                        </span>
                      )}
                    </blockquote>
                  ))
                ) : (
                  <p className="mt-1 text-sm text-muted-foreground">No quoted source evidence.</p>
                )}
              </div>
              {selected.stale && selected.status === "pending" && (
                <p role="status" className="text-sm text-destructive">
                  Source or accepted content changed. Reject or withdraw this proposal, then rerun
                  the review to create a revised proposal.
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
                      A current matter {selected.requiredRole} with review edit access must decide
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
                ? "Apply this exact cell proposal?"
                : "Reject this cell proposal?"}
            </DialogTitle>
          </DialogHeader>
          <p className="text-sm">
            {confirmDecision === "approve"
              ? "The proposed result will replace the accepted cell. Your decision and the original agent attribution will be recorded together."
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
      <Dialog open={policyOpen} onOpenChange={setPolicyOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Matter approval policy</DialogTitle>
          </DialogHeader>
          <p className="text-sm text-muted-foreground">
            This gate applies to agent writes across the review API, connected agents, and workers.
            Pending proposals require a new review after any policy change. Workflow and export
            gates are not yet available.
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
