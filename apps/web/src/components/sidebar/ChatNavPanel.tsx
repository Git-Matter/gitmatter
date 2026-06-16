import { useEffect, useRef, useState } from "react";
import {
  Link,
  useRouterState,
  type RegisteredRouter,
  type RouterState,
} from "@tanstack/react-router";
import { ChevronDown, Folder, MoreHorizontal, Pin, PinOff, Plus, SquarePen } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAllChats, useSetChatPin } from "@/lib/queries";
import { useMatters } from "@/lib/matters-context";
import type { ChatSummary } from "@/lib/api";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

type AppRouterState = RouterState<RegisteredRouter["routeTree"]>;

// Per-project recent chats shown before "Show more" (matches ChatGPT).
const PROJECT_CHAT_LIMIT = 5;

type Organize = "by-project" | "one-list";

// A ChatGPT "__menu-item": fixed height, snug padding, lg radius, hover fill.
const itemCls = (active = false) =>
  cn(
    "group/item relative flex h-9 items-center gap-1.5 rounded-lg px-2 text-sm transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/80 hover:bg-sidebar-accent/60"
  );

const iconBtnCls =
  "grid size-6 place-items-center rounded-md text-muted-foreground hover:bg-sidebar-accent hover:text-foreground focus-visible:outline-none";

// A row-trailing icon button (pin / open-home), revealed on row hover.
function TrailingButton({
  label,
  onClick,
  href,
  params,
  children,
}: {
  label: string;
  onClick?: () => void;
  href?: "/matters/$id" | "/matters/$id/assistant";
  params?: { id: string };
  children: React.ReactNode;
}) {
  const cls = cn(
    iconBtnCls,
    "opacity-0 transition-opacity group-hover/item:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
  );
  if (href && params)
    return (
      <Link to={href} params={params} title={label} aria-label={label} className={cls}>
        {children}
      </Link>
    );
  return (
    <button type="button" title={label} aria-label={label} onClick={onClick} className={cls}>
      {children}
    </button>
  );
}

function SectionHeader({
  title,
  collapsed,
  onToggle,
  actions,
}: {
  title: string;
  collapsed: boolean;
  onToggle: () => void;
  actions?: React.ReactNode;
}) {
  return (
    <div className="group/sec flex items-center justify-between pe-1.5">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={!collapsed}
        className="flex flex-1 items-center gap-0.5 px-3 py-1.5 text-left"
      >
        <h2 className="text-sm font-semibold text-foreground">{title}</h2>
        <ChevronDown
          className={cn(
            "size-3 shrink-0 text-muted-foreground transition-transform",
            "invisible group-hover/sec:visible",
            collapsed && "-rotate-90"
          )}
        />
      </button>
      {actions && (
        <div className="flex shrink-0 items-center gap-0.5 text-muted-foreground opacity-0 transition-opacity group-hover/sec:opacity-100 focus-within:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}

/** The chat-row link target depends on scope: matter-scoped vs. global assistant. */
function chatLink(chat: ChatSummary) {
  return chat.matterId
    ? ({
        to: "/matters/$id/assistant/$chatId",
        params: { id: chat.matterId, chatId: chat.id },
      } as const)
    : ({ to: "/assistant/$id", params: { id: chat.id } } as const);
}

function ChatRow({
  chat,
  active,
  indent,
  onNavigate,
}: {
  chat: ChatSummary;
  active: boolean;
  indent?: boolean;
  onNavigate?: () => void;
}) {
  const pin = useSetChatPin();
  const title = chat.title ?? "Untitled";

  return (
    <div className={cn(itemCls(active), indent && "ps-8")}>
      <Link
        {...chatLink(chat)}
        onClick={onNavigate}
        title={title}
        className="min-w-0 flex-1 truncate"
      >
        {title}
      </Link>
      <div className="flex shrink-0 items-center gap-0.5">
        <TrailingButton
          label={chat.pinned ? "Unpin" : "Pin"}
          onClick={() => pin.mutate({ id: chat.id, pinned: !chat.pinned })}
        >
          {chat.pinned ? <PinOff className="size-3.5" /> : <Pin className="size-3.5" />}
        </TrailingButton>
        <DropdownMenu>
          <DropdownMenuTrigger
            title="Chat options"
            aria-label="Chat options"
            className="grid size-6 shrink-0 place-items-center rounded-md text-muted-foreground opacity-0 transition-opacity group-hover/item:opacity-100 hover:bg-sidebar-accent hover:text-foreground focus-visible:opacity-100 data-[state=open]:opacity-100"
          >
            <MoreHorizontal className="size-4" />
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="min-w-32">
            <DropdownMenuItem onClick={() => pin.mutate({ id: chat.id, pinned: !chat.pinned })}>
              {chat.pinned ? <PinOff className="size-4" /> : <Pin className="size-4" />}
              {chat.pinned ? "Unpin" : "Pin"}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </div>
  );
}

function ProjectRow({
  matterId,
  name,
  chats,
  activeChatId,
  expandable,
  onNavigate,
}: {
  matterId: string;
  name: string;
  chats: ChatSummary[];
  activeChatId?: string;
  expandable: boolean;
  onNavigate?: () => void;
}) {
  // A project with chats expands inline; an empty one (or one-list mode) is a link
  // to its home. An expanded project's home is reached via the open-home button.
  const hasChats = expandable && chats.length > 0;
  const [open, setOpen] = useState(() => chats.some((c) => c.id === activeChatId));
  const [showAll, setShowAll] = useState(false);
  // Reveal the active chat: a freshly-created matter chat lands here after the row
  // has already mounted (open=false), so open on demand when it becomes active.
  useEffect(() => {
    if (chats.some((c) => c.id === activeChatId)) setOpen(true);
  }, [activeChatId, chats]);
  const shown = showAll ? chats : chats.slice(0, PROJECT_CHAT_LIMIT);

  const label = (
    <>
      <Folder className="size-4 shrink-0 text-muted-foreground" />
      <span className="min-w-0 flex-1 truncate text-left">{name}</span>
    </>
  );

  return (
    <div>
      <div className={itemCls(false)}>
        {hasChats ? (
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            title={name}
            aria-expanded={open}
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            {label}
          </button>
        ) : (
          <Link
            to="/matters/$id"
            params={{ id: matterId }}
            onClick={onNavigate}
            title={name}
            className="flex min-w-0 flex-1 items-center gap-1.5"
          >
            {label}
          </Link>
        )}
        <TrailingButton label="New chat" href="/matters/$id/assistant" params={{ id: matterId }}>
          <SquarePen className="size-3.5" />
        </TrailingButton>
      </div>

      {hasChats && open && (
        <div>
          {shown.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              active={chat.id === activeChatId}
              indent
              onNavigate={onNavigate}
            />
          ))}
          {chats.length > PROJECT_CHAT_LIMIT && (
            <button
              type="button"
              onClick={() => setShowAll((v) => !v)}
              className={cn(itemCls(false), "ps-8 text-muted-foreground")}
            >
              {showAll ? "Show less" : "Show more"}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function usePersistentState<T extends string | boolean>(key: string, fallback: T) {
  // Always start from fallback so server and first client render match. Read the
  // stored value after mount, then persist on change.
  const [value, setValue] = useState<T>(fallback);
  const hydrated = useRef(false);
  useEffect(() => {
    const raw = localStorage.getItem(key);
    if (raw != null) setValue((typeof fallback === "boolean" ? raw === "true" : raw) as T);
    hydrated.current = true;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  useEffect(() => {
    if (hydrated.current) localStorage.setItem(key, String(value));
  }, [key, value]);
  return [value, setValue] as const;
}

/**
 * ChatGPT-style chat navigator: Pinned, Projects (matters with nested chats), and
 * Chats — from one `listAllChats` query. The Projects header carries controls to
 * create a matter and to switch grouping (by project vs. one flat list).
 */
export function ChatNavPanel({ onNavigate }: { onNavigate?: () => void }) {
  // Query and localStorage data only exist on the client. Render empty until
  // mounted so the server HTML and first client render match (no hydration
  // mismatch); the real lists fill in after mount.
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const { data: chatsData = [] } = useAllChats();
  const { matters: mattersData } = useMatters();
  const chats = mounted ? chatsData : [];
  const matters = mounted ? mattersData : [];
  const [organize, setOrganize] = usePersistentState<Organize>("sidebarOrganize", "by-project");
  const [projectsCollapsed, setProjectsCollapsed] = usePersistentState<boolean>(
    "sidebarProjectsCollapsed",
    false
  );
  const [chatsCollapsed, setChatsCollapsed] = usePersistentState<boolean>(
    "sidebarChatsCollapsed",
    false
  );

  const activeChatId = useRouterState({
    select: (s: AppRouterState) =>
      /^\/(?:assistant|matters\/[^/]+\/assistant)\/(.+)$/.exec(s.location.pathname)?.[1],
  });

  const byProject = organize === "by-project";
  const pinned = chats.filter((c) => c.pinned);
  const projectChats = (id: string) => chats.filter((c) => c.matterId === id && !c.pinned);
  // By project: the Chats section holds only global chats. One list: every chat.
  const flatChats = chats.filter((c) => !c.pinned && (byProject ? c.matterId == null : true));

  const sortedMatters = [...matters].sort((a, b) =>
    b.matter.updatedAt.localeCompare(a.matter.updatedAt)
  );

  return (
    <nav className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
      {pinned.length > 0 && (
        <div className="mb-1">
          <SectionHeader title="Pinned" collapsed={false} onToggle={() => {}} />
          {pinned.map((chat) => (
            <ChatRow
              key={chat.id}
              chat={chat}
              active={chat.id === activeChatId}
              onNavigate={onNavigate}
            />
          ))}
        </div>
      )}

      <div className="mb-1">
        <SectionHeader
          title="Matters"
          collapsed={projectsCollapsed}
          onToggle={() => setProjectsCollapsed((v) => !v)}
          actions={
            <>
              <Link
                to="/matters"
                onClick={onNavigate}
                title="New matter"
                aria-label="New matter"
                className={iconBtnCls}
              >
                <Plus className="size-4" />
              </Link>
              <DropdownMenu>
                <DropdownMenuTrigger
                  title="Organize chats"
                  aria-label="Organize chats"
                  className={iconBtnCls}
                >
                  <MoreHorizontal className="size-4" />
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="min-w-44">
                  <DropdownMenuRadioGroup
                    value={organize}
                    onValueChange={(v) => setOrganize(v as Organize)}
                  >
                    <DropdownMenuLabel>Organize chats</DropdownMenuLabel>
                    <DropdownMenuRadioItem value="one-list">In one list</DropdownMenuRadioItem>
                    <DropdownMenuRadioItem value="by-project">By matter</DropdownMenuRadioItem>
                  </DropdownMenuRadioGroup>
                </DropdownMenuContent>
              </DropdownMenu>
            </>
          }
        />
        {!projectsCollapsed &&
          (sortedMatters.length === 0 ? (
            <p className="px-3 py-1 text-xs text-muted-foreground">No matters yet.</p>
          ) : (
            sortedMatters.map(({ matter }) => (
              <ProjectRow
                key={matter.id}
                matterId={matter.id}
                name={matter.name}
                chats={projectChats(matter.id)}
                activeChatId={activeChatId}
                expandable={byProject}
                onNavigate={onNavigate}
              />
            ))
          ))}
      </div>

      <div>
        <SectionHeader
          title="Chats"
          collapsed={chatsCollapsed}
          onToggle={() => setChatsCollapsed((v) => !v)}
          actions={
            <Link
              to="/assistant"
              onClick={onNavigate}
              title="New chat"
              aria-label="New chat"
              className={iconBtnCls}
            >
              <SquarePen className="size-4" />
            </Link>
          }
        />
        {!chatsCollapsed &&
          (flatChats.length === 0 ? (
            <p className="px-3 py-1 text-xs text-muted-foreground">No conversations yet.</p>
          ) : (
            flatChats.map((chat) => (
              <ChatRow
                key={chat.id}
                chat={chat}
                active={chat.id === activeChatId}
                onNavigate={onNavigate}
              />
            ))
          ))}
      </div>
    </nav>
  );
}
