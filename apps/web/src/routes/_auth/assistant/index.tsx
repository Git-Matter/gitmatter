import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import BrandMark from "@/components/BrandMark";
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
import { useSession } from "@/lib/auth/auth-client";

// Fresh chat. Resuming a conversation lives at /assistant/$id (assistant.$id.tsx),
// which seeds AssistantView from its loader. Keyed "new" so state starts clean.
export const Route = createFileRoute("/_auth/assistant/")({
  component: () => <AssistantView key="new" loaded={null} />,
});

export function AssistantView({ loaded }: { loaded: ChatDetail | null }) {
  const { data: session } = useSession();
  const navigate = useNavigate();

  // Multi-step workflow run: prompts still queued to send (after the current one)
  // and the new chat id to navigate to once the last step is sent. Navigation is
  // held until then — navigating mid-run would unmount this view and drop the queue.
  const stepsRef = useRef<string[]>([]);
  const navIdRef = useRef<string | null>(null);

  const s = useChatSession({
    loaded,
    onFirstChat: (id) => {
      if (stepsRef.current.length > 0) navIdRef.current = id;
      else void navigate({ to: "/assistant/$id", params: { id }, replace: true });
    },
  });

  const firstName =
    session?.user.name?.split(" ")[0] || session?.user.email?.split("@")[0] || "there";
  const empty = s.turns.length === 0;

  // A workflow "Use" launch stashes a seed (ordered prompt steps + document
  // attachments) then navigates here; consume it once on a fresh chat. The first
  // step auto-sends; the rest are queued and sent one-by-one as each completes.
  const [pendingAutoSend, setPendingAutoSend] = useState(false);
  useEffect(() => {
    if (loaded) return;
    const raw = sessionStorage.getItem("workflowChatSeed");
    if (!raw) return;
    sessionStorage.removeItem("workflowChatSeed");
    try {
      const seed = JSON.parse(raw) as { steps?: string[]; attachments?: ChatAttachment[] };
      const steps = seed.steps ?? [];
      if (!steps.length) return;
      s.setInput(steps[0]);
      s.setAttachments(seed.attachments ?? []);
      stepsRef.current = steps.slice(1);
      setPendingAutoSend(true);
    } catch {
      /* ignore malformed seed */
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loaded]);
  useEffect(() => {
    if (pendingAutoSend && s.input.trim() && !s.busy) {
      setPendingAutoSend(false);
      void s.send();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingAutoSend, s.input, s.busy]);
  // After a step finishes, send the next queued step into the same chat (context
  // carries via chatId). Once the queue is empty, run the deferred navigation.
  useEffect(() => {
    if (s.busy || pendingAutoSend) return;
    if (stepsRef.current.length > 0 && s.chatId) {
      const next = stepsRef.current.shift()!;
      s.setInput(next);
      setPendingAutoSend(true);
      return;
    }
    if (stepsRef.current.length === 0 && navIdRef.current) {
      const id = navIdRef.current;
      navIdRef.current = null;
      void navigate({ to: "/assistant/$id", params: { id }, replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [s.busy, pendingAutoSend, s.chatId]);

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
      onSend={s.send}
      onStop={s.stop}
    />
  );

  if (empty) {
    return (
      <div className="mx-auto flex h-full w-full max-w-xl flex-col items-center justify-center gap-section md:max-w-2xl lg:max-w-3xl xl:max-w-4xl">
        <h1 className="flex items-center gap-3 font-heading text-4xl font-light tracking-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-primary text-primary-foreground">
            <BrandMark className="size-6" />
          </span>
          Hi, {firstName}
        </h1>
        <div className="w-full">{composer}</div>
        <p className="text-sm text-muted-foreground">
          AI can make mistakes. Answers are not legal advice.
        </p>
      </div>
    );
  }

  return (
    <ActivityPanelProvider>
      <div className="flex h-full min-h-0">
        <div className="min-w-0 flex-1 overflow-hidden">
          <div className="mx-auto flex h-full min-h-0 w-full max-w-3xl flex-col">
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
