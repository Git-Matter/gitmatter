import { useEffect, useRef, useState, type CSSProperties } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useStore } from "@tanstack/react-store";
import { ChevronLeft, ChevronRight, MessageSquarePlus } from "lucide-react";
import { UnsavedNavigationGuard } from "@/components/UnsavedChangesGuard";
import { ResponseNotice } from "../../assistant/-components/ResponseNotice";
import { canRetainSnapshotAfterError } from "@/lib/data/snapshot-refresh";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { PageHeader } from "@/components/PageHeader";
import {
  Conversation,
  ConversationContent,
  ConversationScrollButton,
} from "@/components/ai-elements/conversation";
import { Composer } from "../../assistant/-components/Composer";
import { ChatTurns } from "../../assistant/-components/ChatTurns";
import { ActivityPanel } from "../../assistant/-components/ActivityPanel";
import { ActivityPanelProvider } from "../../assistant/-components/activity-context";
import { useChatSession } from "../../assistant/-components/useChatSession";
import { MatterFileExplorer } from "./MatterFileExplorer";
import { DocViewerTabs } from "./DocViewerTabs";
import { api, type ChatDetail, type Doc, type SourceCard } from "../../../../lib/data/api";
import { useSession } from "@/lib/auth/auth-client";
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
function Divider({
  onDrag,
  label,
  value,
  minimum,
  maximum,
}: {
  onDrag: (dx: number) => void;
  label: string;
  value: number;
  minimum: number;
  maximum: number;
}) {
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
      tabIndex={0}
      aria-label={label}
      aria-valuenow={value}
      aria-valuemin={minimum}
      aria-valuemax={Math.max(value, maximum)}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onDrag(event.key === "ArrowLeft" ? -16 : 16);
        }
      }}
      className="relative hidden w-1 shrink-0 cursor-col-resize before:absolute before:inset-y-0 before:left-1/2 before:w-px before:bg-border hover:before:bg-ring focus-visible:outline focus-visible:outline-2 focus-visible:outline-ring xl:block"
      role="separator"
      aria-orientation="vertical"
    />
  );
}

/**
 * The matter-scoped assistant — a 3-pane workspace (Explorer · Document Viewer ·
 * Assistant). The chat is filed under the matter; the explorer and viewer give
 * the assistant a document working surface.
 */
export function MatterChatWorkspace({
  matterId,
  loaded,
  current = true,
}: {
  matterId: string;
  loaded: ChatDetail | null;
  current?: boolean;
}) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: session } = useSession();

  const matterQuery = useQuery({
    queryKey: ["matter", matterId],
    queryFn: () => api.getMatter(matterId),
    retry: false,
  });
  const matter = matterQuery.data;
  const {
    data: members = [],
    isSuccess: membershipReady,
    isFetching: checkingMembership,
  } = useQuery({
    queryKey: ["matter-people", matterId],
    queryFn: () => api.getMatterPeople(matterId),
  });
  const member = members.find((m) => m.userId === session?.user?.id);
  const canEdit = membershipReady && !checkingMembership && !!member && member.role !== "viewer";

  // Panel sizing + explorer collapse.
  const [explorerWidth, setExplorerWidth] = useState(260);
  const [chatWidth, setChatWidth] = useState(400);
  const [explorerCollapsed, setExplorerCollapsed] = useState(false);
  const [chatCollapsed, setChatCollapsed] = useState(false);
  const [mobilePane, setMobilePane] = useState<"conversation" | "files" | "document">(
    "conversation"
  );
  const bodyRef = useRef<HTMLDivElement>(null);
  const documentRef = useRef<HTMLElement>(null);
  const [bodyWidth, setBodyWidth] = useState(0);
  const pendingNavigation = useRef<string | null>(null);
  useEffect(() => {
    const element = bodyRef.current;
    if (!element) return;
    const observer = new ResizeObserver((entries) => setBodyWidth(entries[0].contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  const explorerMaximum = Math.max(EXPLORER_MIN, bodyWidth - chatWidth - CHAT_MIN - 8);
  const chatMaximum = Math.max(CHAT_MIN, bodyWidth - explorerWidth - CHAT_MIN - 8);

  // Open document tabs live in a matter-keyed store (not component state) so they
  // survive the remount when the first message navigates /assistant →
  // /assistant/$chatId — otherwise the open document would unselect.
  const { tabs, activeTabId } =
    useStore(viewerStore, (st: ViewerState) => st[matterId]) ?? EMPTY_VIEW;
  const openDoc = (docId: string, title: string) => {
    openDocTab(matterId, docId, title);
    setMobilePane("document");
    requestAnimationFrame(() => documentRef.current?.focus());
  };
  const closeTab = (docId: string) => closeDocTab(matterId, docId);
  // Activity-drawer source cards: in-app artifacts open as a viewer tab; external
  // sources (web/court/IP links) open in a new tab.
  const openSource = (card: SourceCard) => {
    if (card.docId) openDoc(card.docId, card.title);
    else if (card.url && /^https?:/.test(card.url)) window.open(card.url, "_blank", "noreferrer");
  };

  const s = useChatSession({
    loaded,
    matterId,
    activeDocumentId: activeTabId ?? undefined,
    current: current && matterQuery.isSuccess,
    onFirstChat: (chatId) => {
      pendingNavigation.current = chatId;
    },
  });

  useEffect(() => {
    if (
      !s.busy &&
      s.outcome === "completed" &&
      !s.input.trim() &&
      !s.attachments.length &&
      pendingNavigation.current
    ) {
      const chatId = pendingNavigation.current;
      pendingNavigation.current = null;
      void navigate({
        to: "/matters/$id/assistant/$chatId",
        params: { id: matterId, chatId },
        replace: true,
      });
    }
  }, [s.busy, s.outcome, s.input, s.attachments.length, navigate, matterId]);

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

  const chatTitle = loaded?.title || (s.chatId ? "Matter conversation" : "New matter conversation");

  const composer = (
    <Composer
      matterId={matterId}
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
      allowUpload={canEdit}
      hasProcessing={s.hasProcessingAttachment}
      busy={s.busy}
      onSend={s.send}
      onStop={s.stop}
      canSend={s.modelReady && !s.hasFailedAttachment}
      modelSetupNeeded={s.modelSetupNeeded}
      onRetryModel={s.modelCheckFailed ? s.retryModel : undefined}
      availabilityMessage={
        s.hasFailedAttachment
          ? "Remove or replace failed attachments before sending."
          : s.modelMessage
      }
      contextLabel={
        activeTabId
          ? `Current document: ${tabs.find((tab) => tab.docId === activeTabId)?.title ?? "Selected document"}`
          : undefined
      }
      scopeLabel={`Current matter: ${matter?.name ?? "Loading matter…"}`}
    />
  );

  if (matterQuery.error && !canRetainSnapshotAfterError(matterQuery.error))
    return (
      <Alert>
        <AlertTitle>Matter unavailable</AlertTitle>
        <AlertDescription>
          The matter context could not be loaded.
          <Button variant="outline" onClick={() => void matterQuery.refetch()}>
            Retry matter context
          </Button>
        </AlertDescription>
      </Alert>
    );
  return (
    <ActivityPanelProvider>
      <UnsavedNavigationGuard
        isDirty={() => !!s.input.trim() || !!s.attachments.length}
        title="Keep your message draft?"
        description="Your unsent message and context are still here. Keep editing, or discard this local draft before leaving."
      />
      <div className="flex h-full min-h-0 flex-col gap-stack">
        <div className="flex min-h-chrome shrink-0 flex-col justify-center border-b border-border pb-4">
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

        {matterQuery.error && (
          <Alert>
            <AlertTitle>Matter could not be refreshed</AlertTitle>
            <AlertDescription>
              Check the current matter before sending.
              <Button onClick={() => void matterQuery.refetch()}>Retry matter context</Button>
            </AlertDescription>
          </Alert>
        )}
        <div role="group" className="flex flex-wrap gap-2 xl:hidden" aria-label="Workspace view">
          {(["conversation", "files", "document"] as const).map((pane) => (
            <Button
              key={pane}
              variant={mobilePane === pane ? "secondary" : "ghost"}
              aria-pressed={mobilePane === pane}
              onClick={() => setMobilePane(pane)}
            >
              {pane === "conversation" ? "Conversation" : pane === "files" ? "Files" : "Document"}
            </Button>
          ))}
        </div>
        <div ref={bodyRef} className="flex min-h-0 flex-1 overflow-hidden">
          {explorerCollapsed && (
            <div className="hidden shrink-0 border-e border-border xl:flex">
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip="Expand explorer"
                onClick={() => setExplorerCollapsed(false)}
              >
                <ChevronRight />
              </Button>
            </div>
          )}
          <div
            style={{ "--explorer-width": `${explorerWidth}px` } as CSSProperties}
            className={`${mobilePane === "files" ? "block" : "hidden"} ${explorerCollapsed ? "xl:hidden" : "xl:block"} min-h-0 w-full shrink-0 border-e border-border xl:w-(--explorer-width)`}
          >
            <MatterFileExplorer
              matterId={matterId}
              canEdit={canEdit}
              selectedDocId={activeTabId}
              onOpenDoc={(doc: Doc) => openDoc(doc.id, doc.title)}
              onCollapse={() => {
                if (window.matchMedia("(min-width: 1280px)").matches) setExplorerCollapsed(true);
                else setMobilePane("conversation");
              }}
            />
          </div>
          {!explorerCollapsed && (
            <Divider
              label="Resize files pane"
              value={explorerWidth}
              minimum={EXPLORER_MIN}
              maximum={explorerMaximum}
              onDrag={(dx) =>
                setExplorerWidth((width) =>
                  Math.max(EXPLORER_MIN, Math.min(Math.max(explorerMaximum, width), width + dx))
                )
              }
            />
          )}
          <section
            ref={documentRef}
            tabIndex={-1}
            aria-label="Document workspace"
            className={`${mobilePane === "document" ? "flex" : "hidden"} min-h-0 min-w-0 flex-1 bg-background outline-none xl:flex`}
          >
            <DocViewerTabs
              tabs={tabs}
              activeId={activeTabId}
              onSwitch={(docId) => setActiveDocTab(matterId, docId)}
              onClose={closeTab}
            />
          </section>

          {chatCollapsed && (
            <div className="hidden shrink-0 border-s border-border xl:flex">
              <Button
                variant="ghost"
                size="icon-sm"
                tooltip="Expand assistant"
                onClick={() => setChatCollapsed(false)}
              >
                <ChevronLeft />
              </Button>
            </div>
          )}
          {!chatCollapsed && (
            <Divider
              label="Resize conversation pane"
              value={chatWidth}
              minimum={CHAT_MIN}
              maximum={chatMaximum}
              onDrag={(dx) =>
                setChatWidth((width) =>
                  Math.max(CHAT_MIN, Math.min(Math.max(chatMaximum, width), width - dx))
                )
              }
            />
          )}
          <div
            style={{ "--chat-width": `${chatWidth}px` } as CSSProperties}
            className={`${mobilePane === "conversation" ? "flex" : "hidden"} ${chatCollapsed ? "xl:hidden" : "xl:flex"} min-h-0 w-full min-w-0 shrink-0 flex-col xl:w-(--chat-width)`}
          >
            <div className="flex h-10 shrink-0 items-center justify-between border-b border-border px-4">
              <span className="text-sm font-medium">Assistant</span>
              <Button
                variant="ghost"
                size="icon-sm"
                className="hidden xl:inline-flex"
                tooltip="Collapse assistant"
                onClick={() => setChatCollapsed(true)}
              >
                <ChevronRight className="size-3.5" />
              </Button>
            </div>
            {s.turns.length === 0 ? (
              <div className="flex flex-1 flex-col gap-2 px-4 pt-8">
                <h2 className="font-sans text-sm font-medium">Ask about this matter</h2>
                <p className="max-w-[30ch] text-sm leading-relaxed text-muted-foreground">
                  Add a question about this matter or the selected document.
                </p>
              </div>
            ) : (
              <Conversation className="min-h-0 flex-1">
                <ConversationContent className="gap-6 px-4">
                  <ChatTurns
                    turns={s.turns}
                    busy={s.busy}
                    onOpenDocument={openDoc}
                    onOpenSource={openSource}
                  />
                </ConversationContent>
                <ConversationScrollButton />
              </Conversation>
            )}
            <div className="shrink-0 px-4 pb-4">
              <ResponseNotice outcome={s.outcome} error={s.responseError} />
              {composer}
            </div>
          </div>

          {/* FAR RIGHT — Activity panel (pushes the panes when open) */}
          <ActivityPanel forceOverlay />
        </div>
      </div>
    </ActivityPanelProvider>
  );
}
