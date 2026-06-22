import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChevronLeft, ChevronRight, MessageSquarePlus } from "lucide-react";
import BrandMark from "@/components/BrandMark";
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
import { DocViewerTabs } from "./DocViewerTabs";
import { api, type ChatDetail, type Doc } from "../../../../lib/data/api";
import { useSession } from "../../../../lib/auth/auth-client";
import {
  closeDocTab,
  openDocTab,
  setActiveDocTab,
  viewerStore,
  type ViewerState,
} from "../-hooks/viewer-store";

const EMPTY_VIEW = { tabs: [], activeTabId: null } as const;

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
  const [chatCollapsed, setChatCollapsed] = useState(false);

  // Open document tabs live in a matter-keyed store (not component state) so they
  // survive the remount when the first message navigates /assistant →
  // /assistant/$chatId — otherwise the open document would unselect.
  const { tabs, activeTabId } =
    useStore(viewerStore, (st: ViewerState) => st[matterId]) ?? EMPTY_VIEW;
  const openDoc = (docId: string, title: string) => openDocTab(matterId, docId, title);
  const closeTab = (docId: string) => closeDocTab(matterId, docId);

  const s = useChatSession({
    loaded,
    matterId,
    activeDocumentId: activeTabId ?? undefined,
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

  // When the assistant proposes tracked-change edits, the edited document gains a
  // new version. Reload that document so the open viewer shows the redlines
  // without a manual refresh. Keyed by the set of edited doc ids.
  const editSignature = [
    ...new Set(s.turns.flatMap((t) => (t.edits ?? []).map((e) => e.documentId))),
  ]
    .sort()
    .join(",");
  useEffect(() => {
    if (!editSignature) return;
    for (const docId of editSignature.split(","))
      void qc.invalidateQueries({ queryKey: ["document", docId] });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editSignature]);

  const firstName =
    session?.user.name?.split(" ")[0] || session?.user.email?.split("@")[0] || "there";
  const chatTitle = loaded?.title || "New chat";

  const composer = (
    <Composer
      matterId={matterId}
      input={s.input}
      setInput={s.setInput}
      model={s.model}
      setModel={s.setModel}
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
          onSwitch={(docId) => setActiveDocTab(matterId, docId)}
          onClose={closeTab}
        />

        {/* RIGHT — Assistant (collapsible like the Explorer) */}
        {chatCollapsed ? (
          <div className="flex shrink-0 flex-col border-s border-border">
            <div className="flex h-10 items-center justify-center px-1">
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip="Expand assistant"
                onClick={() => setChatCollapsed(false)}
              >
                <ChevronLeft className="size-3.5" />
              </Button>
            </div>
          </div>
        ) : (
          <>
            <Divider onDrag={(dx) => setChatWidth((w) => Math.max(CHAT_MIN, w - dx))} />
            <div style={{ width: chatWidth }} className="flex shrink-0 flex-col">
              <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
                <span className="text-xs text-muted-foreground">Matter Assistant</span>
                <Button
                  variant="ghost"
                  size="icon-sm"
                  tooltip="Collapse assistant"
                  onClick={() => setChatCollapsed(true)}
                >
                  <ChevronRight className="size-3.5" />
                </Button>
              </div>
              {s.turns.length === 0 ? (
                <div className="flex flex-1 flex-col items-center justify-center px-4">
                  <h1 className="flex items-center gap-2.5 font-heading text-2xl font-light tracking-tight">
                    <span className="grid size-7 place-items-center rounded-md bg-primary text-primary-foreground">
                      <BrandMark className="size-5" />
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
          </>
        )}
      </div>
    </div>
  );
}
