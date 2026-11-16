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
import { useModelCatalog } from "@/lib/data/queries";
import { configuredModelAvailable } from "@/lib/data/configured-model";

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
  context?: ChatAttachment[];
  earlierCalls?: Array<{ tool: string; input: unknown }>;
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
  current = true,
}: {
  loaded: ChatDetail | null;
  matterId?: string;
  activeDocumentId?: string;
  onFirstChat?: (chatId: string) => void;
  current?: boolean;
}) {
  const queryClient = useQueryClient();
  const [input, setInput] = useState("");
  // Seed from the loaded conversation (callers key the view by chat, so this
  // runs fresh per conversation — no reset effect needed).
  const [turns, setTurns] = useState<Turn[]>(() =>
    (loaded?.turns ?? []).map((t) => ({
      role: t.role,
      text: t.text,
      // Earlier call inputs do not establish a completed tool outcome.
      steps: t.trace,
      earlierCalls: t.trace?.length ? undefined : t.toolCalls,
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
  const catalog = useModelCatalog();
  const modelReady =
    current &&
    !catalog.isFetching &&
    !catalog.error &&
    !!catalog.data &&
    configuredModelAvailable(model, catalog.data);
  const modelMessage = !current
    ? "Refresh this conversation before sending."
    : catalog.isPending || catalog.isFetching
      ? "Checking model access…"
      : catalog.error
        ? "Model access could not be checked."
        : !catalog.data?.some((provider) => provider.available)
          ? "Configure an application provider before sending."
          : !model
            ? "Choose a configured model before sending."
            : !modelReady
              ? "The selected model is unavailable. Choose a configured model."
              : null;
  const [reasoning, setReasoning] = useSelectedReasoning();
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [busy, setBusy] = useState(false);
  const [outcome, setOutcome] = useState<"idle" | "running" | "completed" | "failed" | "stopped">(
    "idle"
  );
  const [responseError, setResponseError] = useState<string | null>(null);
  const [chatId, setChatId] = useState<string | undefined>(loaded?.id);
  // Aborts an in-flight stream so navigating away (or unmounting) doesn't leave
  // the reader loop and its captured setState closures running in the background.
  const streamAbort = useRef<AbortController | null>(null);
  useEffect(() => () => streamAbort.current?.abort(), []);

  // Ids of staged uploads made in this composer that the user has NOT yet sent.
  // A received turn commits them server-side; after dispatch their outcome may be unknown.
  // Clear them here to avoid deleting a document the server may have committed; removing a chip or
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
  const hasFailedAttachment = attachments.some(
    (a) => a.kind === "document" && a.status === "failed"
  );

  async function send() {
    const message = input.trim();
    if (!message || busy || hasProcessingAttachment || hasFailedAttachment || !modelReady) return;
    setInput("");
    setBusy(true);
    setOutcome("running");
    setResponseError(null);
    const sent = attachments;
    setAttachments([]);
    // The server commits these staged uploads into the library on receiving the
    // turn, so stop tracking them here — they're no longer ours to discard.
    for (const a of sent) if (a.kind === "document") stagedIds.current.delete(a.id);
    // Append the user turn plus an empty assistant turn that fills in as it streams.
    setTurns((t) => [
      ...t,
      { role: "user", text: message, context: sent },
      { role: "assistant", text: "" },
    ]);

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
    let completed = false;
    let failure: string | null = null;
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
            completed = true;
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
                matterId: matterId ?? null,
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
              if (!failure) onFirstChat?.(r.chatId);
            } else {
              // Active views keep their observer; a future mount must not seed from an older turn list.
              queryClient.removeQueries({
                queryKey: queryKeys.chat(r.chatId),
                exact: true,
                type: "inactive",
              });
              void queryClient.invalidateQueries({
                queryKey: queryKeys.chat(r.chatId),
                exact: true,
                type: "active",
              });
            }
          },
          onError: (msg) => {
            failure = msg;
          },
        },
        controller.signal
      );
    } catch (e) {
      if ((e as Error)?.name !== "AbortError") {
        failure = e instanceof Error ? e.message : "The request failed.";
      }
    } finally {
      if (streamAbort.current === controller) streamAbort.current = null;
      if (completed && !failure) setOutcome("completed");
      else if (controller.signal.aborted) setOutcome("stopped");
      else {
        setOutcome("failed");
        setResponseError(
          failure ?? "The connection ended before a completed response was received."
        );
      }
      setBusy(false);
      // Even an interrupted request may have created a saved conversation.
      void queryClient.invalidateQueries({ queryKey: queryKeys.chats });
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
    hasFailedAttachment,
    busy,
    outcome,
    responseError,
    modelReady,
    modelChecking: catalog.isPending || catalog.isFetching,
    modelMessage,
    modelSetupNeeded:
      current &&
      !catalog.isPending &&
      !catalog.error &&
      !(catalog.data?.some((provider) => provider.available) ?? false),
    modelCheckFailed: !!catalog.error,
    retryModel: () => void catalog.refetch(),
    chatId,
    send,
    stop,
  };
}
