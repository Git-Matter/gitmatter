import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { type ProviderId, resolveJurisdiction } from "@workspace/registry";
import {
  api,
  type ChatAttachment,
  type ChatDetail,
  type ChatEdit,
  type ChatTraceEvent,
  type Citation,
} from "../../../../lib/data/api";
import {
  useSelectedModel,
  useSelectedReasoning,
} from "../../../../lib/hooks/state/useSelectedModel";
import { queryKeys } from "../../../../lib/data/queries";

// One product-facing event in the assistant's execution timeline. The server
// sends curated activity events instead of exposing raw model scratch work.
export type Step = ChatTraceEvent;

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
  activeDocumentId,
  onFirstChat,
}: {
  loaded: ChatDetail | null;
  matterId?: string;
  activeDocumentId?: string;
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
      // New chats persist trace events. Older saved chats only have tool calls,
      // so keep a fallback timeline for those rows.
      steps:
        t.trace ??
        t.toolCalls?.map(
          (tc, index): Step => ({
            id: `${t.role}-${index}-${tc.tool}`,
            kind: "tool_call",
            status: "done",
            label: "Ran tool",
            summary: tc.tool.replace(/_/g, " "),
            detail: { tool: tc.tool, input: tc.input },
          })
        ),
      edits: t.edits,
      citations: t.citations,
    }))
  );
  const [tools, setTools] = useState<string[]>([]);
  const [jurisdiction, setJurisdiction] = useState<string>("");
  const [jurisdictionOverride, setJurisdictionOverrideState] = useState("");
  const [sourceIds, setSourceIds] = useState<ProviderId[] | null>(null);
  const { data: settings } = useQuery({
    queryKey: ["settings"],
    queryFn: () => api.getSettings(),
  });
  const effectiveJurisdiction = resolveJurisdiction(jurisdictionOverride, settings?.jurisdiction);

  function setJurisdictionOverride(next: string) {
    setJurisdictionOverrideState(next);
    setSourceIds(null);
  }
  const [model, setModel] = useSelectedModel();
  const [reasoning, setReasoning] = useSelectedReasoning();
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [chatId, setChatId] = useState<string | undefined>(loaded?.id);
  // Aborts an in-flight stream so navigating away (or unmounting) doesn't leave
  // the reader loop and its captured setState closures running in the background.
  const streamAbort = useRef<AbortController | null>(null);
  useEffect(() => () => streamAbort.current?.abort(), []);

  // Ids of staged uploads made in this composer that the user has NOT yet sent.
  // Sending commits them (server-side) and clears them here; removing a chip or
  // unmounting discards them (hard delete + S3). Picked library docs aren't here,
  // so removing them only unlinks.
  const stagedIds = useRef<Set<string>>(new Set());
  // Best-effort cleanup of uploads abandoned without sending (covered server-side
  // by the abandon sweep too). Read the ref at unmount, not at mount.
  useEffect(
    () => () => {
      for (const id of stagedIds.current) void api.discardStagedDocument(id).catch(() => {});
    },
    []
  );

  // Abort the in-flight stream (the finally block clears busy + the ref).
  const stop = () => streamAbort.current?.abort();

  const addAttachment = (a: ChatAttachment) =>
    setAttachments((prev) =>
      prev.some((p) => p.kind === a.kind && p.id === a.id) ? prev : [...prev, a]
    );
  const removeAttachment = (a: ChatAttachment) => {
    // A staged upload (made in this composer, not yet sent) is hard-discarded; a
    // picked library doc is just unlinked from the message.
    if (a.kind === "document" && stagedIds.current.has(a.id)) {
      stagedIds.current.delete(a.id);
      void api.discardStagedDocument(a.id).catch(() => {});
    }
    setAttachments((prev) => prev.filter((p) => !(p.kind === a.kind && p.id === a.id)));
  };

  // Upload a local file from the composer. Show the chip immediately (covers the
  // R2-write window), swap to the real document once stored, then let the SSE
  // stream below drive it through extraction to ready/failed.
  async function uploadFile(file: File) {
    const tempId = `upload:${crypto.randomUUID()}`;
    const fileType = file.name.split(".").pop()?.toLowerCase();
    addAttachment({ kind: "document", id: tempId, label: file.name, fileType, status: "pending" });
    try {
      // Staged: held for context but kept out of the library until the turn is sent.
      const doc = await api.uploadDocument(file, file.name, matterId, null, { staged: true });
      stagedIds.current.add(doc.id);
      setAttachments((prev) =>
        prev.map((p) =>
          p.kind === "document" && p.id === tempId
            ? {
                kind: "document",
                id: doc.id,
                label: doc.title,
                fileType: doc.fileType,
                status: doc.status,
              }
            : p
        )
      );
    } catch (error) {
      setAttachments((prev) => prev.filter((p) => !(p.kind === "document" && p.id === tempId)));
      toast.error(error instanceof Error ? error.message : "Upload failed");
    }
  }

  // Extraction runs in-process; one SSE stream pushes status changes
  // (pending -> processing -> ready/failed). Patch the matching document chip.
  useEffect(() => {
    const es = new EventSource("/api/documents/events");
    es.addEventListener("status", (e) => {
      const { id, status, extractionError, ocrSuggested } = JSON.parse(
        (e as MessageEvent).data
      ) as {
        id: string;
        status: ChatAttachment["status"];
        extractionError: string | null;
        ocrSuggested?: boolean;
      };
      setAttachments((prev) =>
        prev.map((p) =>
          p.kind === "document" && p.id === id
            ? { ...p, status, extractionError, ocrSuggested: ocrSuggested ?? false }
            : p
        )
      );
    });
    return () => es.close();
  }, []);

  // Any attached document still being stored or extracted. Used to block send
  // until the model can actually read every attached document.
  const hasProcessingAttachment = attachments.some(
    (a) => a.kind === "document" && (a.status === "pending" || a.status === "processing")
  );

  async function send() {
    const message = input.trim();
    if (!message || busy || hasProcessingAttachment) return;
    setInput("");
    setBusy(true);
    const sent = attachments;
    setAttachments([]);
    // The server commits these staged uploads into the library on receiving the
    // turn, so stop tracking them here — they're no longer ours to discard.
    for (const a of sent) if (a.kind === "document") stagedIds.current.delete(a.id);
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
    const steps: Step[] = [];
    const pushSteps = () => patchLast({ steps: [...steps] });
    const upsertTrace = (event: ChatTraceEvent) => {
      const index = steps.findIndex((s) => s.id === event.id);
      if (index >= 0) steps[index] = event;
      else steps.push(event);
      pushSteps();
    };

    const controller = new AbortController();
    streamAbort.current = controller;
    try {
      await api.streamChat(
        message,
        {
          model: model || undefined,
          jurisdiction: jurisdictionOverride || undefined,
          sourceIds: sourceIds ?? undefined,
          attachments: sent.length ? sent : undefined,
          reasoning: reasoning ?? undefined,
          chatId,
          // Only meaningful when creating a new chat; ignored once chatId exists.
          matterId: chatId ? undefined : matterId,
          // Sent every turn — the open tab changes as the user switches documents.
          activeDocumentId,
        },
        {
          onReasoning: () => {},
          onTrace: upsertTrace,
          onText: (delta) => {
            acc += delta;
            patchLast({ text: acc, steps: [...steps] });
          },
          onTool: () => {},
          onDone: (r) => {
            patchLast({
              text: r.text || acc,
              steps: r.trace.length ? r.trace : [...steps],
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
                    trace: r.trace,
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
    jurisdictionOverride,
    effectiveJurisdiction,
    setJurisdictionOverride,
    sourceIds,
    setSourceIds,
    model,
    setModel,
    reasoning,
    setReasoning,
    attachments,
    setAttachments,
    addAttachment,
    removeAttachment,
    uploadFile,
    hasProcessingAttachment,
    busy,
    chatId,
    send,
    stop,
  };
}
