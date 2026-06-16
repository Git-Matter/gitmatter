import { useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  api,
  type ChatAttachment,
  type ChatDetail,
  type ChatEdit,
  type Citation,
} from "../../../../lib/api";
import { useSelectedModel, useSelectedReasoning } from "../../../../lib/useSelectedModel";
import { queryKeys } from "../../../../lib/queries";

// One entry in the assistant's execution timeline, in arrival order. Reasoning
// blocks and tool calls interleave exactly as the model emitted them, so the UI
// can render a "Completed in N steps" timeline instead of two separate buckets.
export type Step =
  | { kind: "reasoning"; text: string; ms?: number; streaming?: boolean; start?: number }
  | { kind: "tool"; name: string; input?: unknown; done: boolean };

export type Turn = {
  role: "user" | "assistant";
  text: string;
  steps?: Step[];
  documents?: Array<{ id: string; title: string; download: string }>;
  edits?: ChatEdit[];
  citations?: Citation[];
};

/**
 * The assistant chat engine — conversation state plus the streaming send loop —
 * shared by the global assistant (single column) and the matter workspace
 * (3-pane). Routing differs, so the first-turn-of-a-new-chat navigation is left
 * to the caller via `onFirstChat`; `matterId` scopes a new chat to a matter.
 */
export function useChatSession({
  loaded,
  matterId,
  onFirstChat,
}: {
  loaded: ChatDetail | null;
  matterId?: string;
  onFirstChat?: (chatId: string) => void;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  // Seed from the loaded conversation (callers key the view by chat, so this
  // runs fresh per conversation — no reset effect needed).
  const [turns, setTurns] = useState<Turn[]>(() =>
    (loaded?.turns ?? []).map((t) => ({
      role: t.role,
      text: t.text,
      // Resumed turns: only tool calls are persisted (reasoning isn't), so the
      // timeline replays as tool steps.
      steps: t.toolCalls?.map(
        (tc): Step => ({ kind: "tool", name: tc.tool, input: tc.input, done: true })
      ),
      edits: t.edits,
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
  // Aborts an in-flight stream so navigating away (or unmounting) doesn't leave
  // the reader loop and its captured setState closures running in the background.
  const streamAbort = useRef<AbortController | null>(null);
  useEffect(() => () => streamAbort.current?.abort(), []);

  // Abort the in-flight stream (the finally block clears busy + the ref).
  const stop = () => streamAbort.current?.abort();

  const addAttachment = (a: ChatAttachment) =>
    setAttachments((prev) =>
      prev.some((p) => p.kind === a.kind && p.id === a.id) ? prev : [...prev, a]
    );
  const removeAttachment = (a: ChatAttachment) =>
    setAttachments((prev) => prev.filter((p) => !(p.kind === a.kind && p.id === a.id)));

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
    // Ordered execution timeline; reasoning and tool steps interleave as emitted.
    const steps: Step[] = [];
    const pushSteps = () => patchLast({ steps: [...steps] });
    // Close out the trailing reasoning step (if still streaming) and stamp its
    // duration — called when a tool starts or the first answer token arrives.
    const finishReasoning = () => {
      const last = steps[steps.length - 1];
      if (last?.kind === "reasoning" && last.streaming) {
        last.streaming = false;
        if (last.start) last.ms = Date.now() - last.start;
      }
    };
    const markToolsDone = () => {
      let changed = false;
      for (const s of steps)
        if (s.kind === "tool" && !s.done) {
          s.done = true;
          changed = true;
        }
      if (changed) pushSteps();
    };

    const controller = new AbortController();
    streamAbort.current = controller;
    try {
      await api.streamChat(
        message,
        {
          model: model || undefined,
          attachments: sent.length ? sent : undefined,
          reasoning: reasoning ?? undefined,
          chatId,
          // Only meaningful when creating a new chat; ignored once chatId exists.
          matterId: chatId ? undefined : matterId,
        },
        {
          onReasoning: (delta) => {
            // Append to the open reasoning step, or start a new one (a tool or
            // answer token since the last reasoning closed the previous block).
            const last = steps[steps.length - 1];
            if (last?.kind === "reasoning" && last.streaming) last.text += delta;
            else steps.push({ kind: "reasoning", text: delta, streaming: true, start: Date.now() });
            pushSteps();
          },
          onText: (delta) => {
            // First answer token ends the thinking phase and any running tools.
            finishReasoning();
            markToolsDone();
            acc += delta;
            patchLast({ text: acc, steps: [...steps] });
          },
          onTool: (name, input) => {
            finishReasoning();
            for (const s of steps) if (s.kind === "tool") s.done = true;
            steps.push({ kind: "tool", name, input, done: false });
            pushSteps();
          },
          onDone: (r) => {
            finishReasoning();
            markToolsDone();
            patchLast({
              text: r.text || acc,
              steps: [...steps],
              documents: r.documents,
              edits: r.edits,
              citations: r.citations,
            });
            setTools(r.tools);
            setJurisdiction(r.jurisdiction);
            if (!chatId) {
              // First turn of a new chat. Seed the resume route's cache with the
              // just-finished conversation so navigating to /…/$chatId renders it
              // instantly — without this the new id has no cache, so the resume
              // route flashes blank while it refetches (feels like a half-nav).
              queryClient.setQueryData<ChatDetail>(queryKeys.chat(r.chatId), {
                id: r.chatId,
                title: null,
                turns: [
                  { role: "user", text: message },
                  {
                    role: "assistant",
                    text: r.text || acc,
                    toolCalls: r.toolCalls,
                    edits: r.edits,
                    citations: r.citations,
                  },
                ],
              });
              setChatId(r.chatId);
              // Invalidate the whole "chats" prefix so every chat list refreshes:
              // the sidebar's `allChats` (["chats","all"]), the global list, and the
              // matter-scoped list. A matter-specific key would miss `allChats`, so a
              // new matter chat would never appear in the sidebar without a reload.
              void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
              onFirstChat?.(r.chatId);
            } else {
              // Continuing an existing chat: drop the stale snapshot so the next
              // resume refetches the server copy with these new turns.
              queryClient.removeQueries({ queryKey: queryKeys.chat(r.chatId) });
            }
          },
          onError: (msg) => toast.error(msg),
        },
        controller.signal
      );
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        toast.error(e instanceof Error ? e.message : "Failed");
      }
    } finally {
      if (streamAbort.current === controller) streamAbort.current = null;
      setBusy(false);
    }
  }

  return {
    input,
    setInput,
    turns,
    tools,
    jurisdiction,
    model,
    setModel,
    reasoning,
    setReasoning,
    attachments,
    setAttachments,
    addAttachment,
    removeAttachment,
    busy,
    chatId,
    send,
    stop,
  };
}
