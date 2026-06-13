import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { ArrowRight, FileDown } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ModelPicker } from "@/components/ModelPicker";
import { ReasoningPicker } from "@/components/ReasoningPicker";
import { AttachChips, AttachControls } from "@/components/ChatAttachments";
import { type ToolRun } from "@/components/ThinkingTrace";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Message, MessageContent, MessageResponse } from "@/components/ai-elements/message";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { Tool, ToolHeader } from "@/components/ai-elements/tool";
import { Source, Sources, SourcesContent, SourcesTrigger } from "@/components/ai-elements/sources";
import { Shimmer } from "@/components/ai-elements/shimmer";
import {
  api,
  type ChatAttachment,
  type ChatDetail,
  type Citation,
  type ReasoningEffort,
} from "../../lib/api";
import { useSelectedModel, useSelectedReasoning } from "../../lib/useSelectedModel";
import { useSession } from "../../lib/auth-client";
import { queryKeys } from "../../lib/queries";

// Fresh chat. Resuming a conversation lives at /assistant/$id (assistant.$id.tsx),
// which seeds AssistantView from its loader. Keyed "new" so state starts clean.
export const Route = createFileRoute("/_auth/assistant")({
  component: () => <AssistantView key="new" loaded={null} />,
});

type Turn = {
  role: "user" | "assistant";
  text: string;
  reasoning?: string;
  reasoningMs?: number;
  reasoningStreaming?: boolean;
  tools?: ToolRun[];
  documents?: Array<{ id: string; title: string; download: string }>;
  citations?: Citation[];
};

function citationHref(cit: Citation): string {
  if (cit.cluster_id) return `https://www.courtlistener.com/opinion/${cit.cluster_id}/`;
  return "/documents";
}

function citationLabel(cit: Citation): string {
  if (cit.cluster_id) return `Case law (opinion ${cit.opinion_id ?? cit.cluster_id})`;
  if (cit.quotes?.length) return cit.quotes[0]!;
  return "Document";
}

export function AssistantView({ loaded }: { loaded: ChatDetail | null }) {
  const { data: session } = useSession();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  // Seed from the loaded conversation (component is keyed by chat, so this runs
  // fresh per conversation — no reset effect needed).
  const [turns, setTurns] = useState<Turn[]>(() =>
    (loaded?.turns ?? []).map((t) => ({
      role: t.role,
      text: t.text,
      tools: t.toolCalls?.map((tc) => ({ name: tc.tool, done: true })),
      citations: t.citations,
    }))
  );
  const [tools, setTools] = useState<string[]>([]);
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [model, setModel] = useSelectedModel();
  const [reasoning, setReasoning] = useSelectedReasoning();
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>(loaded?.id);

  const firstName =
    session?.user.name?.split(" ")[0] || session?.user.email?.split("@")[0] || "there";
  const empty = turns.length === 0;

  async function send() {
    const message = input.trim();
    if (!message || busy) return;
    setInput("");
    setBusy(true);
    const sent = attachments;
    setAttachments([]);
    // Append the user turn plus an empty assistant turn that fills in as it streams.
    setTurns((t) => [...t, { role: "user", text: message }, { role: "assistant", text: "" }]);

    // Update the trailing assistant turn in place as deltas arrive.
    const patchLast = (patch: Partial<Turn>) =>
      setTurns((t) => {
        const copy = [...t];
        const last = copy[copy.length - 1];
        if (last?.role === "assistant") copy[copy.length - 1] = { ...last, ...patch };
        return copy;
      });

    let acc = "";
    let racc = "";
    let rStart = 0;
    let answered = false;
    const toolRuns: ToolRun[] = [];
    const markToolsDone = () => {
      if (toolRuns.some((t) => !t.done)) {
        toolRuns.forEach((t) => (t.done = true));
        patchLast({ tools: [...toolRuns] });
      }
    };

    try {
      await api.streamChat(
        message,
        {
          model: model || undefined,
          attachments: sent.length ? sent : undefined,
          reasoning: reasoning ?? undefined,
          chatId,
        },
        {
          onReasoning: (delta) => {
            if (!rStart) rStart = Date.now();
            racc += delta;
            patchLast({ reasoning: racc, reasoningStreaming: true });
          },
          onText: (delta) => {
            // First answer token ends the thinking phase and any running tools.
            if (!answered && racc) {
              answered = true;
              patchLast({ reasoningStreaming: false, reasoningMs: Date.now() - rStart });
            }
            markToolsDone();
            acc += delta;
            patchLast({ text: acc });
          },
          onTool: (name) => {
            toolRuns.forEach((t) => (t.done = true));
            toolRuns.push({ name, done: false });
            patchLast({ tools: [...toolRuns] });
          },
          onDone: (r) => {
            markToolsDone();
            // Only set the thinking duration here if the answer never streamed
            // (reasoning-only) — otherwise keep the time-to-first-token captured above.
            patchLast({
              text: r.text || acc,
              reasoningStreaming: false,
              ...(!answered && rStart ? { reasoningMs: Date.now() - rStart } : {}),
              documents: r.documents,
              citations: r.citations,
            });
            setTools(r.tools);
            setJurisdiction(r.jurisdiction);
            // First turn of a new chat: adopt its id, refresh the sidebar list,
            // and reflect it in the URL (remounts to the resumed conversation).
            if (!chatId) {
              setChatId(r.chatId);
              void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
              void navigate({ to: "/assistant/$id", params: { id: r.chatId }, replace: true });
            }
          },
          onError: (msg) => toast.error(msg),
        }
      );
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Failed");
    } finally {
      setBusy(false);
    }
  }

  const composer = (
    <Composer
      input={input}
      setInput={setInput}
      model={model}
      setModel={setModel}
      reasoning={reasoning}
      setReasoning={setReasoning}
      attachments={attachments}
      onAdd={(a) =>
        setAttachments((prev) =>
          prev.some((p) => p.kind === a.kind && p.id === a.id) ? prev : [...prev, a]
        )
      }
      onRemove={(a) =>
        setAttachments((prev) => prev.filter((p) => !(p.kind === a.kind && p.id === a.id)))
      }
      busy={busy}
      onSend={send}
    />
  );

  if (empty) {
    return (
      <div className="mx-auto flex min-h-[calc(100dvh-10rem)] max-w-2xl flex-col items-center justify-center gap-section">
        <h1 className="flex items-center gap-3 font-heading text-4xl font-light tracking-tight">
          <span className="grid size-9 place-items-center rounded-lg bg-primary font-serif text-lg text-primary-foreground">
            g
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
    <div className="mx-auto flex h-[calc(100dvh-6rem)] max-w-2xl flex-col">
      <Conversation className="flex-1">
        <ConversationContent className="gap-6 px-0">
          {(jurisdiction || tools.length > 0) && (
            <div className="flex items-center gap-2">
              {jurisdiction && <Badge variant="outline">{jurisdiction}</Badge>}
              {tools.length > 0 && <Badge variant="secondary">{tools.length} MCP tools</Badge>}
            </div>
          )}
          {/* User turns are a quiet bubble; assistant turns open markdown on the
              page — the answer is the hero (DESIGN.md). */}
          {turns.map((t, i) =>
            t.role === "user" ? (
              <Message key={i} from="user">
                <MessageContent>
                  <p className="whitespace-pre-wrap">{t.text}</p>
                </MessageContent>
              </Message>
            ) : (
              <Message key={i} from="assistant">
                <MessageContent>
                  {/* Pre-first-token cue: model reached but nothing streamed back
                      yet. Keeps the UI alive between send and the first delta. */}
                  {busy &&
                    i === turns.length - 1 &&
                    !t.text &&
                    !t.reasoning &&
                    !(t.tools && t.tools.length) && <Shimmer duration={1}>Thinking…</Shimmer>}
                  {(t.reasoning || t.reasoningStreaming) && (
                    <Reasoning
                      isStreaming={Boolean(t.reasoningStreaming)}
                      duration={t.reasoningMs ? Math.round(t.reasoningMs / 1000) : undefined}
                    >
                      <ReasoningTrigger />
                      <ReasoningContent>{t.reasoning ?? ""}</ReasoningContent>
                    </Reasoning>
                  )}
                  {t.tools?.map((run, ti) => (
                    <Tool key={`${run.name}-${ti}`}>
                      <ToolHeader
                        type="dynamic-tool"
                        toolName={run.name.replace(/_/g, " ")}
                        state={run.done ? "output-available" : "input-available"}
                      />
                    </Tool>
                  ))}
                  {t.text && <MessageResponse>{t.text}</MessageResponse>}
                  {t.citations && t.citations.length > 0 && (
                    <Sources>
                      <SourcesTrigger count={t.citations.length} />
                      <SourcesContent>
                        {t.citations.map((cit) => (
                          <Source
                            key={cit.ref}
                            href={citationHref(cit)}
                            title={citationLabel(cit)}
                          />
                        ))}
                      </SourcesContent>
                    </Sources>
                  )}
                  {t.documents?.map((d) => (
                    <a
                      key={d.id}
                      href={api.documentDownloadUrl(d.id)}
                      className="flex items-center gap-2 rounded-md border border-border bg-background px-3 py-2 text-sm hover:bg-muted/50"
                    >
                      <FileDown className="size-4 text-muted-foreground" />
                      <span className="flex-1 truncate">{d.title}</span>
                      <span className="text-xs text-muted-foreground">Download .docx</span>
                    </a>
                  ))}
                </MessageContent>
              </Message>
            )
          )}
        </ConversationContent>
        <ConversationScrollButton />
      </Conversation>
      <div className="flex flex-col gap-2 pt-2">
        {composer}
        <p className="text-center text-xs text-muted-foreground">
          AI can make mistakes. Answers are not legal advice.
        </p>
      </div>
    </div>
  );
}

function Composer({
  input,
  setInput,
  model,
  setModel,
  reasoning,
  setReasoning,
  attachments,
  onAdd,
  onRemove,
  busy,
  onSend,
}: {
  input: string;
  setInput: (v: string) => void;
  model: string;
  setModel: (v: string) => void;
  reasoning: ReasoningEffort | null;
  setReasoning: (v: ReasoningEffort | null) => void;
  attachments: ChatAttachment[];
  onAdd: (a: ChatAttachment) => void;
  onRemove: (a: ChatAttachment) => void;
  busy: boolean;
  onSend: () => void;
}) {
  return (
    <div className="rounded-2xl border border-border bg-card shadow-xs focus-within:border-ring/60">
      <AttachChips attachments={attachments} onRemove={onRemove} />
      <Textarea
        rows={2}
        value={input}
        onChange={(e) => setInput(e.target.value)}
        placeholder="Ask a question about your documents…"
        className="resize-none border-0 bg-transparent px-4 pt-3 shadow-none focus-visible:ring-0"
        onKeyDown={(e) => {
          if (e.key === "Enter" && !e.shiftKey) {
            e.preventDefault();
            onSend();
          }
        }}
      />
      <div className="flex items-center justify-between gap-2 px-3 pb-3">
        <div className="flex min-w-0 [scrollbar-width:none] items-center gap-1 overflow-x-auto [&::-webkit-scrollbar]:hidden">
          <ModelPicker value={model} onChange={setModel} />
          <ReasoningPicker model={model} value={reasoning} onChange={setReasoning} />
          <span className="mx-1 h-4 w-px shrink-0 bg-border" />
          <AttachControls attachments={attachments} onAdd={onAdd} />
        </div>
        <Button
          size="icon"
          onClick={onSend}
          disabled={busy || !input.trim()}
          title="Send"
          className="shrink-0 rounded-full"
        >
          <ArrowRight className="size-4" />
        </Button>
      </div>
    </div>
  );
}
