import { captureActionOrigin, notifySuccess } from "@/lib/feedback";
import { lazy, Suspense, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { z } from "zod";
import type { TemplateView, templateActionSchema } from "@workspace/contracts";
import { Check, FileText, RotateCcw, X } from "lucide-react";
import { api } from "@/lib/data/api";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Spinner } from "@/components/ui/spinner";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  formatBytes,
  isTemplateConflict,
  refreshTemplateQueries,
  TemplateDownload,
  templateQueryKey,
  templateStatus,
} from "./template-ui";
import { TemplateHistory } from "./TemplateHistory";
import { TemplateTeam } from "./TemplateTeam";
import { templateSnapshotAccess, type TemplateAccess } from "./template-access";
import { DiscardChangesDialog, UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";

const DocxView = lazy(async () => ({
  default: (await import("../../documents/-components/DocxView")).DocxView,
}));
type TemplateAction = z.infer<typeof templateActionSchema>["action"];
const pendingLabels: Partial<Record<TemplateAction, string>> = {
  submit: "Sending revision…",
  publish: "Recording approval…",
  request_changes: "Recording change request…",
  archive: "Withdrawing template…",
  restore: "Restoring template…",
};

export function TemplateDetail({
  item,
  latestHead,
  latestAccess,
  onClose,
  onEdit,
  returnFocus,
  refreshCurrent = true,
  onRetryRefresh,
}: {
  item: TemplateView;
  latestHead?: string;
  latestAccess?: TemplateAccess;
  onClose: () => void;
  onEdit: (snapshot: TemplateView) => void;
  returnFocus?: () => HTMLElement | null;
  refreshCurrent?: boolean;
  onRetryRefresh?: () => void;
}) {
  const client = useQueryClient();
  // Review the revision deliberately opened, never whatever a background refetch
  // happens to replace it with while the person is reading.
  const [openedSnapshot, setSnapshot] = useState(item);
  const { privateViewRevoked, ...currentAccess } = templateSnapshotAccess(
    openedSnapshot,
    item,
    latestAccess
  );
  const snapshot = { ...openedSnapshot, ...currentAccess };
  const [view, setView] = useState<"working" | "current">(initialView(item));
  const [reason, setReason] = useState("");
  const [reviewerId, setReviewerId] = useState(item.reviewerId ?? "");
  const [reviewed, setReviewed] = useState(false);
  const [confirmAction, setConfirmAction] = useState<"archive" | "restore" | null>(null);
  const [pendingIntent, setPendingIntent] = useState<"close" | "reload" | "edit" | null>(null);
  const exitResolved = useRef(false);
  const stale =
    item.headCommitId !== snapshot.headCommitId ||
    (latestHead !== undefined && latestHead !== snapshot.headCommitId);
  const latestReady = latestHead === undefined || item.headCommitId === latestHead;
  const blocked = stale || !refreshCurrent || privateViewRevoked;
  const authorityReduced =
    (openedSnapshot.canReview && !currentAccess.canReview) ||
    (openedSnapshot.canEdit && !currentAccess.canEdit) ||
    (openedSnapshot.canManageMembers && !currentAccess.canManageMembers);
  const content =
    (view === "working" ? snapshot.draft : snapshot.current) ?? snapshot.current ?? snapshot.draft!;
  const viewingWorking = view === "working" && content.id === snapshot.draft?.id;
  const people = useQuery({
    queryKey: ["tenant-members"],
    queryFn: api.listTenantMembers,
    enabled: snapshot.canEdit,
  });
  const reviewers =
    people.data?.filter(
      (person) =>
        person.role === "admin" ||
        snapshot.members.some((member) => member.userId === person.id && member.role === "reviewer")
    ) ?? [];
  const mutation = useMutation({
    onMutate: () => {
      exitResolved.current = false;

      return captureActionOrigin();
    },
    mutationFn: (action: TemplateAction) =>
      api.templateAction(snapshot.id, {
        expectedHead: snapshot.headCommitId,
        action,
        revisionId: snapshot.draft?.id,
        reviewerId,
        message: reason,
      }),
    onSuccess: async (_, action, origin) => {
      exitResolved.current = true;
      await client.invalidateQueries({ queryKey: templateQueryKey });
      notifySuccess(
        action === "publish"
          ? `Version ${snapshot.draft?.version} is now approved and current.`
          : action === "request_changes"
            ? "Changes requested. The owner can prepare the next revision."
            : action === "submit"
              ? "Sent to the selected reviewer."
              : action === "archive"
                ? "Template withdrawn from the library."
                : "Restored as a draft. Fresh approval is required.",
        origin
      );
      onClose();
    },
    onError: async (error) => {
      if (isTemplateConflict(error)) await refreshTemplateQueries(client, snapshot.id);
    },
  });
  const reviewInputAvailable = viewingWorking && snapshot.status === "review" && snapshot.canReview;
  const submitInputAvailable =
    viewingWorking &&
    (snapshot.status === "draft" || snapshot.status === "changes_requested") &&
    snapshot.canEdit;
  const mayDecide = reviewInputAvailable && !blocked;
  const maySubmit = submitInputAvailable && !blocked;
  const busy = mutation.isPending;
  const pendingLabel =
    (mutation.variables && pendingLabels[mutation.variables]) ?? "Recording template action…";
  const dirty = !!reason || reviewerId !== (snapshot.reviewerId ?? "") || reviewed;
  useEffect(() => {
    if (!currentAccess.canReview) setReviewed(false);
  }, [currentAccess.canReview]);
  const reviewInputCopy = {
    title: "Keep your template review input?",
    description:
      "Your note, reviewer choice and confirmation are still here. Continue reviewing, or discard this input before leaving or loading another revision.",
  };
  function performIntent(intent: "close" | "reload" | "edit") {
    if (intent === "reload" && (privateViewRevoked || !refreshCurrent || !latestReady)) return;
    if (intent === "edit" && (blocked || !snapshot.canEdit)) return;
    if (intent === "reload") reloadRevision();
    else if (intent === "edit") onEdit(snapshot);
    else onClose();
  }
  function requestIntent(intent: "close" | "reload" | "edit") {
    if (busy) return;
    if (dirty) setPendingIntent(intent);
    else performIntent(intent);
  }
  const canApply = !!reason.trim() && !busy && !blocked;
  function reloadRevision() {
    exitResolved.current = false;
    setSnapshot(item);
    setView(initialView(item));
    setReason("");
    setReviewerId(item.reviewerId ?? "");
    setReviewed(false);
  }
  const exitGuards = (
    <>
      <UnsavedNavigationGuard
        {...reviewInputCopy}
        isDirty={() => !exitResolved.current && (dirty || busy)}
        saving={busy}
      />
      <DiscardChangesDialog
        {...reviewInputCopy}
        open={pendingIntent !== null}
        saving={busy}
        onKeep={() => setPendingIntent(null)}
        onDiscard={() => {
          const intent = pendingIntent;
          setPendingIntent(null);
          if (intent && intent !== "reload") {
            exitResolved.current = true;
            setReason("");
            setReviewerId(snapshot.reviewerId ?? "");
            setReviewed(false);
          }
          if (intent) performIntent(intent);
        }}
      />
    </>
  );
  if (privateViewRevoked) {
    return (
      <>
        {exitGuards}
        <TemplateAccessChanged
          item={!item.canManage && !item.draft ? item : undefined}
          reason={reason}
          busy={busy}
          refreshCurrent={refreshCurrent}
          onRetryRefresh={onRetryRefresh}
          onClose={() => requestIntent("close")}
          returnFocus={returnFocus}
        />
      </>
    );
  }
  return (
    <>
      {exitGuards}
      <Dialog
        open
        onOpenChange={(open) => {
          if (!open) requestIntent("close");
        }}
      >
        <DialogContent
          finalFocus={returnFocus}
          showCloseButton={false}
          className="flex max-h-[92dvh] w-[calc(100%-2rem)] max-w-none flex-col gap-0 overflow-hidden p-0 sm:max-w-none md:max-w-none lg:max-w-7xl"
        >
          <DialogHeader className="relative shrink-0 border-b border-border bg-popover p-6 pr-16">
            <Button
              className="absolute top-4 right-4"
              variant="ghost"
              size="icon-sm"
              aria-label="Close"
              disabled={busy}
              onClick={() => requestIntent("close")}
            >
              <X />
            </Button>
            <div className="flex flex-wrap items-center gap-3">
              <Badge
                variant={viewingWorking || snapshot.status === "archived" ? "secondary" : "default"}
              >
                {viewingWorking
                  ? `Working revision v${content.version}`
                  : `${snapshot.status === "archived" ? "Last approved" : "Current approved"} v${content.version}`}
              </Badge>
              <span className="text-xs text-muted-foreground">{templateStatus(snapshot)}</span>
            </div>
            <DialogTitle className="text-xl break-words sm:text-2xl">{content.title}</DialogTitle>
            <DialogDescription>
              {content.category} · Owned by {snapshot.ownerName ?? "an unassigned member"}
              {snapshot.status === "review"
                ? ` · Reviewer: ${snapshot.reviewerName ?? "Unassigned"}`
                : ""}
            </DialogDescription>
          </DialogHeader>
          <div className="grid min-h-0 min-w-0 gap-6 overflow-y-auto p-6">
            <p role="status" className="sr-only">
              {busy ? pendingLabel : ""}
            </p>
            {stale && (
              <Alert>
                <AlertTitle>This template changed while you were reviewing it</AlertTitle>
                <AlertDescription>
                  Your open revision is preserved. Reload the latest revision and review it before
                  taking an action.
                  <Button
                    variant="outline"
                    className="mt-3 w-fit"
                    disabled={!latestReady}
                    onClick={() => requestIntent("reload")}
                  >
                    <RotateCcw data-icon="inline-start" />
                    Reload revision
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {!refreshCurrent && (
              <Alert>
                <AlertTitle>Template could not be refreshed</AlertTitle>
                <AlertDescription>
                  The revision you opened and your note are still here. Check the current template
                  before making a decision.
                  <Button variant="outline" className="mt-3 w-fit" onClick={onRetryRefresh}>
                    Retry template refresh
                  </Button>
                </AlertDescription>
              </Alert>
            )}
            {authorityReduced && (
              <Alert>
                <AlertTitle>Your template permissions changed</AlertTitle>
                <AlertDescription>
                  You can still inspect this revision, but previous editing, review, or team
                  authority is no longer available.
                </AlertDescription>
              </Alert>
            )}
            {reason && !reviewInputAvailable && !submitInputAvailable && (
              <RetainedTemplateNote reason={reason} />
            )}
            {snapshot.draft && snapshot.current && snapshot.draft.id !== snapshot.current.id && (
              <Tabs
                value={view}
                onValueChange={(value) => {
                  setView(value as "working" | "current");
                  setReviewed(false);
                }}
              >
                <TabsList variant="line">
                  <TabsTrigger value="working">Working v{snapshot.draft.version}</TabsTrigger>
                  <TabsTrigger value="current">Approved v{snapshot.current.version}</TabsTrigger>
                </TabsList>
              </Tabs>
            )}
            <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_20rem]">
              <div className="flex min-w-0 flex-col gap-4">
                {content.file ? (
                  <>
                    <div className="flex items-start gap-3 rounded-xl bg-muted/40 p-4">
                      <FileText
                        aria-hidden="true"
                        className="mt-0.5 size-5 shrink-0 text-muted-foreground"
                      />
                      <div className="min-w-0">
                        <p className="text-sm font-medium break-words">{content.file.fileName}</p>
                        <p className="mt-1 text-xs text-muted-foreground">
                          Original Word file · {formatBytes(content.file.sizeBytes)} · Formatting
                          preserved
                        </p>
                      </div>
                    </div>
                    <div
                      role="region"
                      aria-label="Word document preview"
                      tabIndex={0}
                      className="max-h-[60dvh] overflow-auto rounded-xl bg-card p-4 shadow-xs outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
                    >
                      <Suspense fallback={<Skeleton className="h-64 w-full" />}>
                        <DocxView
                          url={`/api/templates/${snapshot.id}/download?revisionId=${encodeURIComponent(content.id)}`}
                          versionToken={content.id}
                          preserveLayout
                        />
                      </Suspense>
                    </div>
                  </>
                ) : (
                  <article className="max-h-[60dvh] overflow-auto rounded-xl bg-card p-6 font-heading text-base leading-relaxed whitespace-pre-wrap shadow-xs">
                    {content.body}
                  </article>
                )}
                <div className="flex flex-wrap gap-2">
                  {snapshot.status !== "archived" && (
                    <TemplateDownload
                      id={snapshot.id}
                      revisionId={content.id}
                      version={content.version}
                      approved={!viewingWorking || content.id === snapshot.current?.id}
                    />
                  )}
                  {snapshot.canEdit && snapshot.status !== "archived" && (
                    <Button
                      variant="ghost"
                      disabled={blocked || busy}
                      onClick={() => requestIntent("edit")}
                    >
                      Create working revision
                    </Button>
                  )}
                </div>
                {content.file && (
                  <p className="text-xs text-muted-foreground">
                    Original page layout is preserved. Scroll within the preview to see the full
                    page, or download this exact revision to review it in Word.
                  </p>
                )}
              </div>
              <div className="flex min-w-0 flex-col gap-5">
                {snapshot.reviewNote && (
                  <Alert>
                    <AlertTitle>
                      Changes requested by {snapshot.reviewerName ?? "the reviewer"}
                    </AlertTitle>
                    <AlertDescription>{snapshot.reviewNote}</AlertDescription>
                  </Alert>
                )}
                {content.guidance && (
                  <Alert>
                    <AlertTitle>When to use it</AlertTitle>
                    <AlertDescription>{content.guidance}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-col gap-2 rounded-xl bg-muted/40 p-4 text-sm">
                  <p className="font-medium">
                    {viewingWorking ? "Working revision" : "Approved access"}
                  </p>
                  <p className="text-muted-foreground">
                    {content.audience === "workspace"
                      ? "Everyone in this workspace can use the approved version."
                      : "Only the template team and workspace admins can use this template."}
                  </p>
                  {viewingWorking && snapshot.current && (
                    <p className="text-xs text-muted-foreground">
                      Your team continues downloading approved v{snapshot.current.version} until a
                      new revision is approved.
                    </p>
                  )}
                  {!viewingWorking && snapshot.publishedAt && (
                    <p className="text-xs text-muted-foreground">
                      Approved by {snapshot.publishedByName ?? "a former member"} ·{" "}
                      {new Date(snapshot.publishedAt).toLocaleString()}
                    </p>
                  )}
                </div>
                {snapshot.status === "review" && snapshot.canManage && !viewingWorking && (
                  <Alert>
                    <AlertTitle>Approval is available on the working revision</AlertTitle>
                    <AlertDescription>
                      Switch to working v{snapshot.draft?.version} to review the proposed change.
                      Approving this published view is disabled.
                    </AlertDescription>
                  </Alert>
                )}
                {(reviewInputAvailable || submitInputAvailable) && (
                  <FieldGroup>
                    {submitInputAvailable && (
                      <Field>
                        <FieldLabel htmlFor="template-reviewer">Send to reviewer</FieldLabel>
                        <Select
                          value={reviewerId}
                          onValueChange={(value) => {
                            exitResolved.current = false;
                            setReviewerId(value ?? "");
                          }}
                          disabled={busy || blocked}
                        >
                          <SelectTrigger id="template-reviewer" className="w-full">
                            <SelectValue>
                              {reviewers.find((person) => person.id === reviewerId)?.name ??
                                "Choose a reviewer"}
                            </SelectValue>
                          </SelectTrigger>
                          <SelectContent>
                            <SelectGroup>
                              {reviewers.map((person) => (
                                <SelectItem key={person.id} value={person.id}>
                                  {person.name}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FieldDescription>
                          Choose a workspace admin or a delegated template reviewer.
                        </FieldDescription>
                      </Field>
                    )}
                    <Field>
                      <FieldLabel htmlFor="template-action-reason">
                        {submitInputAvailable
                          ? "What should the reviewer check?"
                          : "Decision reason"}
                      </FieldLabel>
                      <Input
                        id="template-action-reason"
                        name="decision"
                        autoComplete="off"
                        maxLength={500}
                        value={reason}
                        onChange={(event) => {
                          exitResolved.current = false;
                          setReason(event.target.value);
                        }}
                        disabled={busy}
                        readOnly={blocked}
                      />
                      <FieldDescription>
                        Saved with your name when you send the revision or decision.
                      </FieldDescription>
                    </Field>
                    {reviewInputAvailable && (
                      <Field orientation="horizontal">
                        <Checkbox
                          id="template-reviewed"
                          checked={reviewed}
                          onCheckedChange={(event) => {
                            exitResolved.current = false;
                            setReviewed(event);
                          }}
                          disabled={busy || blocked}
                        />
                        <FieldLabel htmlFor="template-reviewed">
                          I reviewed working revision v{snapshot.draft?.version} shown here.
                        </FieldLabel>
                      </Field>
                    )}
                    <div className="flex flex-wrap gap-2">
                      {maySubmit && (
                        <Button
                          disabled={!canApply || !reviewerId}
                          onClick={() => mutation.mutate("submit")}
                        >
                          {busy && mutation.variables === "submit" ? (
                            <Spinner data-icon="inline-start" />
                          ) : (
                            <UploadIcon />
                          )}
                          {busy && mutation.variables === "submit"
                            ? pendingLabel
                            : `Send v${snapshot.draft?.version} for review`}
                        </Button>
                      )}
                      {mayDecide && (
                        <>
                          <Button
                            disabled={!canApply || !reviewed}
                            onClick={() => mutation.mutate("publish")}
                          >
                            {busy && mutation.variables === "publish" ? (
                              <Spinner data-icon="inline-start" />
                            ) : (
                              <Check data-icon="inline-start" />
                            )}
                            {busy && mutation.variables === "publish"
                              ? pendingLabel
                              : `Approve and publish v${snapshot.draft?.version}`}
                          </Button>
                          <Button
                            variant="outline"
                            disabled={!canApply}
                            onClick={() => mutation.mutate("request_changes")}
                          >
                            {busy && mutation.variables === "request_changes"
                              ? pendingLabel
                              : "Request changes"}
                          </Button>
                        </>
                      )}
                    </div>
                  </FieldGroup>
                )}
                {snapshot.status === "review" && viewingWorking && !snapshot.canReview && (
                  <p className="text-sm text-muted-foreground">
                    Waiting for {snapshot.reviewerName ?? "the assigned reviewer"}. The approved
                    version is unchanged.
                  </p>
                )}
                {snapshot.canManageMembers && (
                  <details className="text-sm">
                    <summary className="cursor-pointer text-muted-foreground">
                      Lifecycle actions
                    </summary>
                    <div className="mt-3 flex flex-col gap-3">
                      <Field>
                        <FieldLabel htmlFor="template-lifecycle-reason">Reason</FieldLabel>
                        <Input
                          id="template-lifecycle-reason"
                          name="lifecycle-reason"
                          autoComplete="off"
                          maxLength={500}
                          value={reason}
                          onChange={(event) => {
                            exitResolved.current = false;
                            setReason(event.target.value);
                          }}
                        />
                      </Field>
                      <Button
                        variant="outline"
                        disabled={!canApply}
                        onClick={() =>
                          setConfirmAction(snapshot.status === "archived" ? "restore" : "archive")
                        }
                      >
                        {snapshot.status === "archived"
                          ? "Restore as draft"
                          : "Archive and withdraw"}
                      </Button>
                    </div>
                  </details>
                )}
              </div>
            </div>
            {mutation.isError && (
              <Alert variant="destructive">
                <AlertTitle>Action was not applied</AlertTitle>
                <AlertDescription>{mutation.error.message}</AlertDescription>
              </Alert>
            )}
            {snapshot.canManage && (
              <>
                <TemplateTeam
                  item={snapshot}
                  stale={blocked}
                  onUpdated={() => requestIntent("close")}
                />
                <TemplateHistory id={snapshot.id} head={snapshot.headCommitId} />
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!confirmAction && snapshot.canManageMembers}
        onOpenChange={(open) => {
          if (!open && !busy) setConfirmAction(null);
        }}
      >
        <DialogContent className="sm:max-w-md md:max-w-md lg:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {confirmAction === "archive"
                ? "Withdraw this template?"
                : "Restore this template as a draft?"}
            </DialogTitle>
            <DialogDescription>
              {confirmAction === "archive"
                ? "Other workspace members will lose access and downloads will stop. The history remains available to the template team."
                : "The template will remain unavailable to readers until a reviewer approves it again."}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap justify-end gap-2">
            <Button variant="ghost" disabled={busy} onClick={() => setConfirmAction(null)}>
              Cancel
            </Button>
            <Button
              variant={confirmAction === "archive" ? "destructive" : "default"}
              disabled={busy || blocked}
              onClick={() => {
                if (confirmAction && canApply && snapshot.canManageMembers)
                  mutation.mutate(confirmAction);
              }}
            >
              {busy && <Spinner data-icon="inline-start" />}
              {confirmAction === "archive" ? "Withdraw template" : "Restore as draft"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}

function TemplateAccessChanged({
  item,
  reason,
  busy,
  refreshCurrent,
  onRetryRefresh,
  onClose,
  returnFocus,
}: {
  item?: Pick<TemplateView, "id" | "current">;
  reason: string;
  busy: boolean;
  refreshCurrent: boolean;
  onRetryRefresh?: () => void;
  onClose: () => void;
  returnFocus?: () => HTMLElement | null;
}) {
  const current = item?.current;
  return (
    <Dialog
      open
      onOpenChange={(open) => {
        if (!open) onClose();
      }}
    >
      <DialogContent
        finalFocus={returnFocus}
        showCloseButton={false}
        className="max-h-[92dvh] overflow-y-auto sm:max-w-3xl md:max-w-3xl lg:max-w-3xl"
      >
        <DialogHeader>
          <DialogTitle>Your template access changed</DialogTitle>
          <DialogDescription>
            The private working revision and its team controls are no longer available. Your own
            unsaved note is kept separately.
          </DialogDescription>
        </DialogHeader>
        {reason && <RetainedTemplateNote reason={reason} />}
        <p role="status" className="sr-only">
          {busy ? "Waiting for the template action response…" : ""}
        </p>
        {current && item && refreshCurrent ? (
          <>
            <div className="flex flex-wrap items-center gap-3">
              <Badge>Current approved v{current.version}</Badge>
              <h2 className="text-lg font-medium break-words">{current.title}</h2>
            </div>
            {current.file ? (
              <div
                role="region"
                aria-label="Approved Word document preview"
                tabIndex={0}
                className="max-h-[50dvh] overflow-auto rounded-xl bg-card p-4 outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
              >
                <Suspense fallback={<Skeleton className="h-48 w-full" />}>
                  <DocxView
                    url={`/api/templates/${item.id}/download?revisionId=${encodeURIComponent(current.id)}`}
                    versionToken={current.id}
                    preserveLayout
                  />
                </Suspense>
              </div>
            ) : (
              <article className="max-h-[50dvh] overflow-auto whitespace-pre-wrap">
                {current.body}
              </article>
            )}
            <div>
              <TemplateDownload id={item.id} revisionId={current.id} version={current.version} />
            </div>
          </>
        ) : (
          <Alert>
            <AlertTitle>Checking your approved access</AlertTitle>
            <AlertDescription>
              Private content has been removed. Refresh the template to load the approved version
              you can still read.
              <Button variant="outline" className="mt-3 w-fit" onClick={onRetryRefresh}>
                Retry template refresh
              </Button>
            </AlertDescription>
          </Alert>
        )}
        <div className="flex justify-end">
          <Button variant="outline" disabled={busy} onClick={onClose}>
            Close
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function RetainedTemplateNote({ reason }: { reason: string }) {
  return (
    <Field>
      <FieldLabel htmlFor="template-retained-note">Your unsaved review note</FieldLabel>
      <Textarea id="template-retained-note" readOnly value={reason} rows={3} />
      <FieldDescription>
        You can copy this note. It cannot be applied as a review decision.
      </FieldDescription>
    </Field>
  );
}

function UploadIcon() {
  return <FileText data-icon="inline-start" />;
}

function initialView(item: TemplateView): "working" | "current" {
  return item.draft && item.draft.id !== item.current?.id ? "working" : "current";
}
