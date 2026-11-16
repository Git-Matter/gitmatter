import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Badge } from "@/components/ui/badge";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Composer } from "./-components/Composer";
import { ChatTurns } from "./-components/ChatTurns";
import { ActivityPanel } from "./-components/ActivityPanel";
import { ActivityPanelProvider } from "./-components/activity-context";
import { useChatSession } from "./-components/useChatSession";
import { type ChatAttachment, type ChatDetail } from "@/lib/data/api";
import { Button } from "@/components/ui/button";
import { UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";
import { ResponseNotice } from "./-components/ResponseNotice";

// Fresh chat. Resuming a conversation lives at /assistant/$id (assistant.$id.tsx),
// which seeds AssistantView from its loader. Keyed "new" so state starts clean.
export const Route = createFileRoute("/_auth/assistant/")({
  component: () => <AssistantView key="new" loaded={null} />,
});

export function AssistantView({
  loaded,
  current = true,
}: {
  loaded: ChatDetail | null;
  current?: boolean;
}) {
  const navigate = useNavigate();

  const stepsRef = useRef<string[]>([]);
  const navIdRef = useRef<string | null>(null);
  const [workflow, setWorkflow] = useState<{
    steps: string[];
    state: "ready" | "running" | "paused";
  } | null>(null);
  const [pendingAutoSend, setPendingAutoSend] = useState(false);
  const s = useChatSession({
    loaded,
    current,
    onFirstChat: (id) => {
      navIdRef.current = id;
    },
  });
  const empty = s.turns.length === 0;

  useEffect(() => {
    if (loaded) return;
    const raw = sessionStorage.getItem("workflowChatSeed");
    if (!raw) return;
    sessionStorage.removeItem("workflowChatSeed");
    try {
      const seed = JSON.parse(raw) as { steps?: unknown; attachments?: unknown };
      const steps = Array.isArray(seed.steps)
        ? seed.steps.filter((step): step is string => typeof step === "string" && !!step.trim())
        : [];
      if (!steps.length) return;
      s.setInput(steps[0]);
      const attachments = Array.isArray(seed.attachments)
        ? seed.attachments.filter(
            (a): a is ChatAttachment =>
              !!a &&
              typeof a.id === "string" &&
              typeof a.label === "string" &&
              ["document", "matter", "client", "review"].includes(a.kind)
          )
        : [];
      s.setAttachments(attachments);
      stepsRef.current = steps.slice(1);
      setWorkflow({ steps, state: "ready" });
    } catch {
      /* A malformed preparation is ignored; it never dispatches. */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);

  function send() {
    if (workflow?.state === "running") return;
    if (
      !s.modelReady ||
      !s.input.trim() ||
      s.busy ||
      s.hasProcessingAttachment ||
      s.hasFailedAttachment
    )
      return;
    if (workflow?.state === "ready") setWorkflow({ ...workflow, state: "running" });
    else if (workflow?.state === "paused") {
      stepsRef.current = [];
      setWorkflow(null);
    }
    void s.send();
  }
  function stop() {
    if (pendingAutoSend && s.input.trim()) stepsRef.current.unshift(s.input.trim());
    setPendingAutoSend(false);
    setWorkflow((value) => (value ? { ...value, state: "paused" } : null));
    s.stop();
  }
  useEffect(() => {
    if (!pendingAutoSend || s.busy) return;
    if (s.modelChecking) return;
    if (!s.modelReady || s.hasFailedAttachment) {
      setPendingAutoSend(false);
      setWorkflow((value) => (value ? { ...value, state: "paused" } : null));
      return;
    }
    if (!s.input.trim() || s.hasProcessingAttachment) return;
    setPendingAutoSend(false);
    void s.send();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    pendingAutoSend,
    s.input,
    s.busy,
    s.modelReady,
    s.modelChecking,
    s.hasProcessingAttachment,
    s.hasFailedAttachment,
  ]);
  useEffect(() => {
    if (s.busy || pendingAutoSend) return;
    if (workflow?.state === "running") {
      if (s.outcome === "failed" || s.outcome === "stopped") {
        setWorkflow({ ...workflow, state: "paused" });
        return;
      }
      if (s.outcome !== "completed") return;
      if (stepsRef.current.length) {
        // A follow-up draft entered during the response is never overwritten by a queued step.
        if (s.input.trim() || s.attachments.length) {
          setWorkflow({ ...workflow, state: "paused" });
          return;
        }
        s.setInput(stepsRef.current.shift()!);
        setPendingAutoSend(true);
        return;
      }
      setWorkflow(null);
    }
    if (
      navIdRef.current &&
      s.outcome === "completed" &&
      !s.input.trim() &&
      !s.attachments.length &&
      workflow?.state !== "ready" &&
      workflow?.state !== "paused"
    ) {
      const id = navIdRef.current;
      navIdRef.current = null;
      void navigate({ to: "/assistant/$id", params: { id }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.busy, s.outcome, s.chatId, s.input, s.attachments.length, pendingAutoSend, workflow]);

  const workflowPanel = workflow && (
    <section aria-label="Prepared workflow" className="mb-4 space-y-3 text-sm">
      <p className="font-medium">
        {workflow.state === "ready"
          ? "Workflow ready"
          : workflow.state === "running"
            ? "Workflow running"
            : "Workflow paused"}{" "}
        · {workflow.steps.length} planned steps
      </p>
      <p className="text-muted-foreground">
        {workflow.state === "ready"
          ? "Review the steps and selected model. Start workflow sends them in order; provider usage applies."
          : workflow.state === "paused"
            ? "Further steps are paused. Review the response and any unsent steps before continuing."
            : "Only a completed response advances to the next step. Stop pauses further dispatch."}
      </p>
      <details>
        <summary className="cursor-pointer">Review workflow steps</summary>
        <ol className="mt-2 max-h-48 list-decimal space-y-2 overflow-auto ps-5">
          {workflow.steps.map((step, index) => (
            <li key={index} className="whitespace-pre-wrap">
              {step}
            </li>
          ))}
        </ol>
      </details>
      {workflow.state === "ready" && (
        <Button
          variant="ghost"
          size="sm"
          onClick={() => {
            stepsRef.current = [];
            setWorkflow(null);
          }}
        >
          Keep first message only
        </Button>
      )}
      {workflow.state === "running" && (
        <Button variant="outline" size="sm" onClick={stop}>
          Pause workflow
        </Button>
      )}
      {workflow.state === "paused" && !!stepsRef.current.length && (
        <Button
          variant="outline"
          size="sm"
          disabled={!s.chatId || !!s.input.trim() || !!s.attachments.length}
          onClick={() => {
            const remaining = [...stepsRef.current];
            s.setInput(remaining[0]);
            stepsRef.current = remaining.slice(1);
            setWorkflow({ steps: remaining, state: "ready" });
          }}
        >
          Prepare unsent steps
        </Button>
      )}
    </section>
  );

  const composer = (
    <Composer
      input={s.input}
      setInput={s.setInput}
      model={s.model}
      setModel={s.setModel}
      jurisdiction={s.jurisdictionOverride}
      effectiveJurisdiction={s.effectiveJurisdiction}
      setJurisdiction={s.setJurisdictionOverride}
      sourceIds={s.sourceIds}
      setSourceIds={s.setSourceIds}
      reasoning={s.reasoning}
      setReasoning={s.setReasoning}
      attachments={s.attachments}
      onAdd={s.addAttachment}
      onRemove={s.removeAttachment}
      onUpload={s.uploadFile}
      hasProcessing={s.hasProcessingAttachment}
      busy={s.busy}
      onSend={send}
      onStop={stop}
      canSend={s.modelReady && !s.hasFailedAttachment && workflow?.state !== "running"}
      modelSetupNeeded={s.modelSetupNeeded}
      onRetryModel={s.modelCheckFailed ? s.retryModel : undefined}
      lockContext={workflow?.state === "running"}
      sendLabel={workflow?.state === "ready" ? "Start workflow" : "Send"}
      availabilityMessage={
        s.hasFailedAttachment
          ? "Remove or replace failed attachments before sending."
          : s.modelMessage
      }
    />
  );

  const guard = (
    <UnsavedNavigationGuard
      isDirty={() =>
        !!s.input.trim() ||
        !!s.attachments.length ||
        !!(workflow && workflow.state !== "running" && stepsRef.current.length)
      }
      title="Keep your message draft?"
      description="Your unsent message and context are still here. Keep editing, or discard this local draft before leaving."
    />
  );

  if (empty) {
    return (
      <div className="mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center gap-section md:max-w-2xl lg:max-w-3xl xl:max-w-4xl">
        {guard}
        <h1 className="font-heading text-3xl">Workspace assistant</h1>
        <div className="w-full">
          {workflowPanel}
          {composer}
        </div>
        <p className="text-sm text-muted-foreground">
          AI can make mistakes. Answers are not legal advice.
        </p>
      </div>
    );
  }

  return (
    <ActivityPanelProvider>
      {guard}
      <div className="flex h-full min-h-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
            <h1 className="shrink-0 pb-4 font-heading text-2xl break-words">
              {loaded?.title ?? "Workspace conversation"}
            </h1>
            <Conversation className="min-h-0 flex-1">
              <ConversationContent className="gap-6 px-0">
                {(s.jurisdiction || s.tools.length > 0) && (
                  <div className="flex items-center gap-2">
                    {s.jurisdiction && <Badge variant="outline">{s.jurisdiction}</Badge>}
                    {s.tools.length > 0 && (
                      <Badge variant="secondary">{s.tools.length} MCP tools</Badge>
                    )}
                  </div>
                )}
                <ChatTurns turns={s.turns} busy={s.busy} />
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
            <div className="flex shrink-0 flex-col gap-2 pt-2">
              {workflowPanel}
              <ResponseNotice outcome={s.outcome} error={s.responseError} />
              {composer}
              <p className="text-center text-xs text-muted-foreground">
                AI can make mistakes. Answers are not legal advice.
              </p>
            </div>
          </div>
        </div>
        <ActivityPanel />
      </div>
    </ActivityPanelProvider>
  );
}
