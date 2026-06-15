import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { ChevronRight, MessageSquarePlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Composer } from "../../assistant/-components/Composer";
import { ChatTurns } from "../../assistant/-components/ChatTurns";
import { useChatSession } from "../../assistant/-components/useChatSession";
import { MatterExplorer } from "./MatterExplorer";
import { DocViewerTabs, type DocTab } from "./DocViewerTabs";
import { api, type ChatDetail, type Doc } from "../../../../lib/api";
import { useSession } from "../../../../lib/auth-client";

const EXPLORER_MIN = 180;
const CHAT_MIN = 320;

/** Drag handle; `onDrag` receives the horizontal mouse delta since last move. */
function Divider({ onDrag }: { onDrag: (dx: number) => void }) {
  const dragging = useRef(false);
  const lastX = useRef(0);
  useEffect(() => {
    function move(e: MouseEvent) {
      if (!dragging.current) return;
      onDrag(e.clientX - lastX.current);
      lastX.current = e.clientX;
    }
    function up() {
      if (!dragging.current) return;
      dragging.current = false;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    }
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
    };
  }, [onDrag]);
  return (
    <div
      onMouseDown={(e) => {
        dragging.current = true;
        lastX.current = e.clientX;
        document.body.style.cursor = "col-resize";
        document.body.style.userSelect = "none";
      }}
      className="w-1 shrink-0 cursor-col-resize bg-border transition-colors hover:bg-primary/40"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

/**
 * The matter-scoped assistant — a 3-pane workspace (Explorer · Document Viewer ·
 * Assistant). The chat is filed under the matter; the explorer and viewer give
 * the assistant a document working surface, mirroring the project chat in mike.
 */
export function MatterChatWorkspace({
  matterId,
  loaded,
}: {
  matterId: string;
  loaded: ChatDetail | null;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session } = useSession();

  const { data: matter } = useQuery({
    queryKey: ["matter", matterId],
    queryFn: () => api.getMatter(matterId),
  });
  const { data: members = [] } = useQuery({
    queryKey: ["matter-people", matterId],
    queryFn: () => api.getMatterPeople(matterId),
  });
  const canEdit = members.find((m) => m.userId === session?.user.id)?.role !== "viewer";

  // Panel sizing + explorer collapse.
  const [explorerWidth, setExplorerWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(400);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);

  // Open document tabs in the center viewer.
  const [tabs, setTabs] = useState<DocTab[]>([]);
  const [activeTabId, setActiveTabId] = useState<string | null>(null);

  const openDoc = (docId: string, title: string) => {
    setTabs((prev) => (prev.some((t) => t.docId === docId) ? prev : [...prev, { docId, title }]));
    setActiveTabId(docId);
  };
  const closeTab = (docId: string) =>
    setTabs((prev) => {
      const next = prev.filter((t) => t.docId !== docId);
      if (activeTabId === docId) setActiveTabId(next[next.length - 1]?.docId ?? null);
      return next;
    });

  const s = useChatSession({
    loaded,
    matterId,
    onFirstChat: (chatId) =>
      void navigate({
        to: "/matters/$id/assistant/$chatId",
        params: { id: matterId, chatId },
        replace: true,
      }),
  });

  // When the assistant creates/edits documents, refresh the explorer so the new
  // files appear without a manual reload. Keyed by the set of generated doc ids.
  const docSignature = s.turns
    .flatMap((t) => t.documents ?? [])
    .map((d) => d.id)
    .sort()
    .join(",");
  useEffect(() => {
    if (!docSignature) return;
    void qc.invalidateQueries({ queryKey: ["folders", matterId] });
    void qc.invalidateQueries({
      predicate: (q) => Array.isArray(q.queryKey) && q.queryKey[0] === "matter-docs",
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [docSignature]);

  const firstName =
    session?.user.name?.split(" ")[0] || session?.user.email?.split("@")[0] || "there";
  const chatTitle = loaded?.title || "New chat";

  const composer = (
    <Composer
      input={s.input}
      setInput={s.setInput}
      model={s.model}
      setModel={s.setModel}
      reasoning={s.reasoning}
      setReasoning={s.setReasoning}
      attachments={s.attachments}
      onAdd={s.addAttachment}
      onRemove={s.removeAttachment}
      busy={s.busy}
      onSend={s.send}
    />
  );

  return (
    <div className="flex h-full min-h-0 flex-col gap-stack">
      <div className="shrink-0">
        <PageHeader
          breadcrumbs={[
            { label: "Matters", to: "/matters" },
            { label: matter?.name ?? "…", to: "/matters/$id", params: { id: matterId } },
            { label: chatTitle },
          ]}
          actions={[
            <Button
              key="new"
              variant="outline"
              size="sm"
              onClick={() =>
                void navigate({ to: "/matters/$id/assistant", params: { id: matterId } })
              }
            >
              <MessageSquarePlus className="size-4" /> New chat
            </Button>,
          ]}
        />
      </div>

      <div className="flex min-h-0 flex-1 overflow-hidden rounded-lg border border-border">
        {/* LEFT — Explorer */}
        {explorerCollapsed ? (
          <div className="flex shrink-0 flex-col border-e border-border">
            <div className="flex h-10 items-center justify-center px-1">
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip="Expand explorer"
                onClick={() => setExplorerCollapsed(false)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={{ width: explorerWidth }} className="shrink-0 border-e border-border">
              <MatterExplorer
                matterId={matterId}
                canEdit={canEdit}
                selectedDocId={activeTabId}
                onOpenDoc={(d: Doc) => openDoc(d.id, d.title)}
                onCollapse={() => setExplorerCollapsed(true)}
              />
            </div>
            <Divider onDrag={(dx) => setExplorerWidth((w) => Math.max(EXPLORER_MIN, w + dx))} />
          </>
        )}

        {/* CENTER — Document viewer */}
        <DocViewerTabs
          tabs={tabs}
          activeId={activeTabId}
          onSwitch={setActiveTabId}
          onClose={closeTab}
        />

        <Divider onDrag={(dx) => setChatWidth((w) => Math.max(CHAT_MIN, w - dx))} />

        {/* RIGHT — Assistant */}
        <div style={{ width: chatWidth }} className="flex shrink-0 flex-col">
          <div className="flex h-10 shrink-0 items-center border-b border-border px-4">
            <span className="text-xs text-muted-foreground">Matter Assistant</span>
          </div>
          {s.turns.length === 0 ? (
            <div className="flex flex-1 flex-col items-center justify-center px-4">
              <h1 className="flex items-center gap-2.5 font-heading text-2xl font-light tracking-tight">
                <span className="grid size-7 place-items-center rounded-md bg-primary font-serif text-base text-primary-foreground">
                  g
                </span>
                Hi, {firstName}
              </h1>
            </div>
          ) : (
            <Conversation className="min-h-0 flex-1">
              <ConversationContent className="gap-6 px-4">
                <ChatTurns turns={s.turns} busy={s.busy} onOpenDocument={openDoc} />
              </ConversationContent>
              <ConversationScrollButton />
            </Conversation>
          )}
          <div className="shrink-0 px-4 pb-4">{composer}</div>
        </div>
      </div>
    </div>
  );
}
