import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { CommitHistory } from "@/components/CommitHistory";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DocxView } from "./-components/DocxView";
import { PageHeader } from "@/components/PageHeader";
import { api, type DocumentDetail, type DocEdit } from "@/lib/data/api";
import { useSession } from "@/lib/auth/auth-client";

export const Route = createFileRoute("/_auth/documents/$id")({ component: DocumentView });

const STATUS_VARIANT: Record<string, "default" | "secondary" | "outline" | "destructive"> = {
  pending: "outline",
  accepted: "secondary",
  rejected: "destructive",
};

function DocumentView() {
  const { id } = Route.useParams();
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session } = useSession();
  const docKey = ["document", id];
  const { data } = useQuery({ queryKey: docKey, queryFn: () => api.getDocumentDetail(id) });
  const { data: history = [] } = useQuery({
    queryKey: ["document-history", id],
    queryFn: () => api.documentHistory(id),
  });
  const [find, setFind] = useState("");
  const [replace, setReplace] = useState("");
  const [reason, setReason] = useState("");

  // Both mutations return the updated document; seed it into the cache and
  // refresh the blame history.
  const onEdited = (updated: DocumentDetail) => {
    qc.setQueryData(docKey, updated);
    void qc.invalidateQueries({ queryKey: ["document-history", id] });
  };

  const proposeMutation = useMutation({
    mutationFn: () => api.proposeEdit(id, { find, replace, reason: reason || undefined }),
    onSuccess: (updated) => {
      onEdited(updated);
      setFind("");
      setReplace("");
      setReason("");
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  const resolveMutation = useMutation({
    mutationFn: (v: { edit: DocEdit; decision: "accept" | "reject" }) =>
      api.resolveEdit(id, v.edit.changeId, v.decision),
    onSuccess: onEdited,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  // Accept/reject every pending change at once — one new version.
  const resolveAllMutation = useMutation({
    mutationFn: (decision: "accept" | "reject") => api.resolveAllEdits(id, decision),
    onSuccess: onEdited,
    onError: (e) => toast.error(e instanceof Error ? e.message : "Failed"),
  });

  if (!data)
    return (
      <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto pt-6 lg:grid-cols-[1fr_300px]">
        <div className="flex flex-col gap-4">
          <Skeleton className="h-8 w-64" />
          <Skeleton className="h-96 w-full" />
        </div>
        <Skeleton className="h-40 w-full" />
      </div>
    );

  const { document, edits } = data;
  const pending = edits.filter((e) => e.status === "pending");
  const isDocx = document.fileType === "docx" && !!document.currentVersionId;

  return (
    <div className="grid min-h-0 flex-1 gap-6 overflow-y-auto pt-6 lg:grid-cols-[1fr_300px]">
      <div className="flex min-w-0 flex-col gap-4">
        <PageHeader
          breadcrumbs={[{ label: "Documents", to: "/documents" }, { label: document.title }]}
          title={document.title}
          action={
            <Button
              variant="outline"
              disabled={!document.markdown}
              tooltip={
                document.markdown
                  ? "Draft a playbook from this document"
                  : "Wait for text extraction to finish"
              }
              onClick={() => {
                sessionStorage.setItem(
                  "workflowChatSeed",
                  JSON.stringify({
                    steps: [
                      "Draft a contract-review playbook from the attached document. Use draft_playbook, then explain the proposed rules and save the result as a draft playbook only after I confirm.",
                    ],
                    attachments: [{ kind: "document", id: document.id, label: document.title }],
                  })
                );
                void navigate({ to: "/assistant" });
              }}
            >
              Draft playbook
            </Button>
          }
        />

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {isDocx ? "Document (tracked changes)" : "Current text"}
            </CardTitle>
          </CardHeader>
          <CardContent>
            {isDocx ? (
              <DocxView
                url={api.documentDownloadUrl(id)}
                versionToken={document.currentVersionId}
              />
            ) : document.markdown ? (
              // Legal text gets the serif and a readable measure — it is the hero (DESIGN.md).
              <pre className="max-w-[70ch] font-serif text-base leading-relaxed whitespace-pre-wrap">
                {document.markdown}
              </pre>
            ) : (
              <p className="text-sm text-muted-foreground">
                {document.status === "ready"
                  ? "No text extracted."
                  : "Text is still being extracted…"}
              </p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">Propose tracked change</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-col gap-3">
            <div className="flex flex-col gap-1.5">
              <Label>Find (exact text in the document)</Label>
              <Input value={find} onChange={(e) => setFind(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Replace with</Label>
              <Input value={replace} onChange={(e) => setReplace(e.target.value)} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>Reason (optional)</Label>
              <Input value={reason} onChange={(e) => setReason(e.target.value)} />
            </div>
            <Button
              onClick={() => find && proposeMutation.mutate()}
              disabled={proposeMutation.isPending || !find}
              className="self-start"
            >
              {proposeMutation.isPending ? "Proposing…" : "Propose edit"}
            </Button>
          </CardContent>
        </Card>

        <div className="flex flex-col gap-2">
          <div className="flex items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">Tracked changes ({pending.length} pending)</h2>
            {pending.length > 0 && (
              <div className="flex gap-2">
                <Button
                  size="xs"
                  disabled={resolveAllMutation.isPending}
                  onClick={() => resolveAllMutation.mutate("accept")}
                >
                  Accept all
                </Button>
                <Button
                  size="xs"
                  variant="outline"
                  disabled={resolveAllMutation.isPending}
                  onClick={() => resolveAllMutation.mutate("reject")}
                >
                  Reject all
                </Button>
              </div>
            )}
          </div>
          {pending.length > 0 && (
            <p className="text-xs text-muted-foreground">
              AI-proposed edits are drafts — review each change before accepting. Not a substitute
              for a lawyer's review.
            </p>
          )}
          {edits.map((e) => (
            <Card key={e.id}>
              <CardContent className="flex flex-col gap-2 py-3">
                <div className="flex items-center gap-2">
                  <Badge variant={STATUS_VARIANT[e.status]}>{e.status}</Badge>
                  {e.blame && (
                    <span className="text-xs text-muted-foreground">
                      by{" "}
                      <span className={e.blame.actorType === "agent" ? "text-bronze" : undefined}>
                        {e.blame.actorType === "agent"
                          ? (e.blame.agentLabel ?? "agent")
                          : e.blame.actorId && e.blame.actorId === session?.user.id
                            ? "you"
                            : (e.blame.actorName ?? "you")}
                      </span>{" "}
                      · #{e.blame.seq}
                    </span>
                  )}
                </div>
                <div className="text-sm">
                  <span className="bg-red-500/15 text-red-700 line-through dark:text-red-400">
                    {e.deletedText}
                  </span>{" "}
                  <span className="bg-emerald-500/15 text-emerald-700 dark:text-emerald-400">
                    {e.insertedText}
                  </span>
                </div>
                {e.reason && <p className="text-xs text-muted-foreground">{e.reason}</p>}
                {e.status === "pending" && (
                  <div className="flex gap-2">
                    <Button
                      size="xs"
                      onClick={() => resolveMutation.mutate({ edit: e, decision: "accept" })}
                    >
                      Accept
                    </Button>
                    <Button
                      size="xs"
                      variant="outline"
                      onClick={() => resolveMutation.mutate({ edit: e, decision: "reject" })}
                    >
                      Reject
                    </Button>
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
          {!edits.length && <p className="text-sm text-muted-foreground">No proposed changes.</p>}
        </div>
      </div>

      <aside>
        <h2 className="mb-2 text-sm font-semibold">History</h2>
        <CommitHistory commits={history} currentUserId={session?.user.id} />
      </aside>
    </div>
  );
}
