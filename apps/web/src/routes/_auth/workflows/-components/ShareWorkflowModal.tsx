import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, type WorkflowShare } from "@/lib/api";
import { useSession } from "@/lib/auth-client";
import { cn } from "@/lib/utils";
import { EmailPillInput } from "./EmailPillInput";
import { WorkflowModal } from "./WorkflowModal";

interface Props {
  workflowId: string;
  workflowName: string;
  onClose: () => void;
}

export function ShareWorkflowModal({ workflowId, workflowName, onClose }: Props) {
  const { data: session } = useSession();
  const ownEmail = session?.user.email?.trim().toLowerCase() ?? null;
  const [pendingEmails, setPendingEmails] = useState<string[]>([]);
  const [allowEdit, setAllowEdit] = useState(false);
  const [existingShares, setExistingShares] = useState<WorkflowShare[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    api
      .listWorkflowShares(workflowId)
      .then(setExistingShares)
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [workflowId]);

  async function handleRemoveShare(shareId: string) {
    await api.deleteWorkflowShare(workflowId, shareId).catch(() => {});
    setExistingShares((prev) => prev.filter((s) => s.id !== shareId));
  }

  async function handleConfirm() {
    const emails = ownEmail ? pendingEmails.filter((email) => email !== ownEmail) : pendingEmails;
    if (emails.length === 0) return;
    setSaving(true);
    setError(null);
    try {
      const updated = await api.shareWorkflow(workflowId, { emails, allowEdit });
      setExistingShares(updated);
      setPendingEmails([]);
    } catch (err) {
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Unable to share this workflow. Please try again."
      );
    } finally {
      setSaving(false);
    }
  }

  return (
    <WorkflowModal
      open
      onClose={onClose}
      breadcrumbs={["Workflows", workflowName, "People"]}
      primaryAction={{
        label: saving ? "Sharing…" : "Share",
        onClick: () => void handleConfirm(),
        disabled: saving || pendingEmails.length === 0,
      }}
    >
      <div className="flex min-h-0 flex-1 flex-col gap-6 py-1">
        <section className="space-y-3">
          <EmailPillInput
            emails={pendingEmails}
            onChange={setPendingEmails}
            validate={async (email) =>
              ownEmail && email === ownEmail ? "You cannot share a workflow with yourself." : null
            }
            placeholder="Add people by email…"
            autoFocus
          />
          {error ? (
            <div className="rounded-md bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
              {error}
            </div>
          ) : null}
        </section>

        <section className="flex flex-col gap-3">
          <span className="text-xs font-medium text-muted-foreground">
            Allow editing by share recipients
          </span>
          <button
            type="button"
            onClick={() => setAllowEdit((v) => !v)}
            className={cn(
              "relative inline-flex h-5 w-9 shrink-0 rounded-full border-2 border-transparent transition-colors duration-200",
              allowEdit ? "bg-foreground" : "bg-muted"
            )}
          >
            <span
              className={cn(
                "pointer-events-none inline-block h-4 w-4 rounded-full bg-background shadow transition-transform duration-200",
                allowEdit ? "translate-x-4" : "translate-x-0"
              )}
            />
          </button>
        </section>

        <section className="min-h-0 flex-1">
          <p className="mb-2 text-xs font-medium text-muted-foreground">People with access</p>
          {loading ? (
            <div className="space-y-2">
              {[1, 2].map((i) => (
                <div key={i} className="flex items-center justify-between">
                  <div className="h-3 w-40 animate-pulse rounded bg-muted" />
                  <div className="h-3 w-16 animate-pulse rounded bg-muted" />
                </div>
              ))}
            </div>
          ) : existingShares.length === 0 ? (
            <p className="text-sm text-muted-foreground">None</p>
          ) : (
            <div className="space-y-1">
              {existingShares.map((share) => (
                <div key={share.id} className="flex items-center justify-between py-1">
                  <span className="truncate text-sm text-foreground">{share.sharedWithEmail}</span>
                  <div className="flex shrink-0 items-center gap-3">
                    <span className="text-xs text-muted-foreground">
                      {share.allowEdit ? "Can edit" : "Read-only"}
                    </span>
                    <button
                      onClick={() => handleRemoveShare(share.id)}
                      className="text-muted-foreground transition-colors hover:text-destructive"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </div>
    </WorkflowModal>
  );
}
