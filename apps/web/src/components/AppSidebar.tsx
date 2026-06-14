import { useEffect, useState } from "react";
import { Link, useRouterState } from "@tanstack/react-router";
import {
  Briefcase,
  Building2,
  Check,
  ChevronsUpDown,
  FolderOpen,
  Library,
  MessageSquare,
  PanelLeft,
  Plus,
  Settings as SettingsIcon,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ModeToggle } from "./ModeToggle";
import { signOut } from "../lib/auth-client";
import { useMatters } from "../lib/matters-context";
import { useChats, useClients, useDocuments } from "../lib/queries";
import type { ServerSession } from "../lib/session";

const NAV_ITEMS = [
  { href: "/assistant", label: "Assistant", icon: MessageSquare },
  { href: "/reviews", label: "Reviews", icon: Table2 },
  { href: "/workflows", label: "Workflows", icon: Library },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/matters", label: "Matters", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

// Sections that get a recent-activity sub-panel: a list of the actual items,
// newest first, linking straight to each one. `/assistant` is special (it shows
// real conversations).
const RECENT_SECTIONS = new Set(["/matters", "/documents", "/clients"]);

const RECENT_LIMIT = 12;

function activeSection(pathname: string): string | null {
  const hit = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return hit?.href ?? null;
}

export function AppSidebar({ session }: { session: NonNullable<ServerSession> }) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  // User's saved preference. Below md the sidebar force-collapses regardless.
  const [userOpen, setUserOpen] = useState(true);
  const [narrow, setNarrow] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("sidebarOpen") : null;
    if (saved !== null) setUserOpen(saved === "true");
  }, []);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  // Narrow viewport wins — collapsed and not togglable open.
  const open = userOpen && !narrow;

  function toggle() {
    setUserOpen((v) => {
      const next = !v;
      localStorage.setItem("sidebarOpen", String(next));
      return next;
    });
  }

  const initial = (session.user.name || session.user.email).charAt(0).toUpperCase();
  const subSection = activeSection(pathname);
  // The assistant shows real conversations; document/client/matter sections show a
  // filter sub-nav. When a sub-panel exists, nav (top) and sub-panel (bottom) each
  // take half the height and scroll independently — otherwise nav sits at the top
  // and a spacer pushes the footer down.
  const showChats = open && subSection === "/assistant";
  const showSub = open && !!subSection && RECENT_SECTIONS.has(subSection);
  const hasSubPanel = showChats || showSub;

  return (
    <div
      className={cn(
        open ? "w-64" : "w-14",
        "my-2 mr-0 ml-2 flex flex-col rounded-2xl glass-panel text-sidebar-foreground md:my-3 md:ml-3",
        "h-[calc(100dvh-1.5rem)] transition-all duration-300"
      )}
    >
      {/* Logo + toggle */}
      <div
        className={cn("flex items-center px-2.5 py-3", open ? "justify-between" : "justify-center")}
      >
        {open && (
          <Link
            to="/assistant"
            className="flex items-center gap-1.5 px-2 transition-opacity hover:opacity-80"
          >
            <span className="grid size-6 place-items-center rounded-md bg-primary font-serif text-sm font-medium text-primary-foreground">
              g
            </span>
            <span className="font-serif text-2xl font-light tracking-tight">gitcounsel</span>
          </Link>
        )}
        <button
          onClick={toggle}
          title={open ? "Collapse" : "Expand"}
          className="flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-sidebar-accent"
        >
          <PanelLeft className="size-4" />
        </button>
      </div>

      {/* Working-matter switcher */}
      <div className="px-2.5 pb-2">
        <MatterSwitcher open={open} />
      </div>

      {/* Nav */}
      <nav className={cn("flex flex-col", hasSubPanel && "min-h-0 flex-1 overflow-y-auto")}>
        {NAV_ITEMS.map((item) => {
          const { href, label, icon: Icon } = item;
          const exact = "exact" in item && item.exact;
          const active = exact
            ? pathname === href
            : pathname === href || pathname.startsWith(`${href}/`);
          return (
            <div key={href} className="px-2.5 py-0.5">
              <Link
                to={href}
                title={!open ? label : undefined}
                className={cn(
                  "flex h-9 items-center gap-3 rounded-md px-2.5 py-2 text-left transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60",
                  !open && "justify-center"
                )}
              >
                <Icon className="size-4 shrink-0" />
                {open && <span className="flex-1 text-sm font-medium">{label}</span>}
                {/* Bronze dot — the quiet "you are here" cue (DESIGN.md). */}
                {open && active && <span className="size-1.5 shrink-0 rounded-full bg-bronze" />}
              </Link>
            </div>
          );
        })}
      </nav>

      {/* Dynamic sub-context — bottom half when present. Keyed so it remounts fresh. */}
      {showChats && <ChatHistoryPanel />}
      {showSub && <RecentPanel key={subSection} section={subSection} />}

      {/* No sub-panel: a spacer pushes the footer to the bottom. */}
      {!hasSubPanel && <div className="flex-1" />}

      {/* User footer */}
      <div className="border-t border-sidebar-border p-2">
        <div className={cn("px-2.5 pb-1", !open && "flex justify-center px-0")}>
          <ModeToggle open={open} />
        </div>
        <div
          className={cn("flex items-center gap-2 rounded-md px-2 py-2", !open && "justify-center")}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </span>
          {open && (
            <div className="flex min-w-0 flex-1 flex-col">
              {session.user.name && (
                <span className="truncate text-xs font-medium">{session.user.name}</span>
              )}
              <span className="truncate text-xs text-muted-foreground">{session.user.email}</span>
              <button
                onClick={() => signOut().then(() => (window.location.href = "/login"))}
                className="self-start text-xs text-muted-foreground hover:text-foreground"
              >
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function RecentPanel({ section }: { section: string }) {
  if (section === "/matters") return <RecentMatters />;
  if (section === "/documents") return <RecentDocuments />;
  if (section === "/clients") return <RecentClients />;
  return null;
}

// Shared chrome + row styling for the recent lists.
const recentRowCls = (active: boolean) =>
  cn(
    "flex h-8 items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors",
    active
      ? "bg-sidebar-accent text-sidebar-accent-foreground"
      : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
  );

function RecentShell({
  title,
  empty,
  isEmpty,
  children,
}: {
  title: string;
  empty: string;
  isEmpty: boolean;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-sidebar-border py-2">
      <div className="px-5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        {title}
      </div>
      <nav className="min-h-0 flex-1 overflow-y-auto">
        {isEmpty ? <p className="px-5 py-2 text-xs text-muted-foreground">{empty}</p> : children}
      </nav>
    </div>
  );
}

function RecentMatters() {
  const { matters } = useMatters();
  const activeId = useRouterState({
    select: (s) => /^\/matters\/(.+)$/.exec(s.location.pathname)?.[1],
  });
  const items = [...matters]
    .sort((a, b) => b.matter.updatedAt.localeCompare(a.matter.updatedAt))
    .slice(0, RECENT_LIMIT);

  return (
    <RecentShell title="Recent matters" empty="No matters yet." isEmpty={items.length === 0}>
      {items.map(({ matter }) => (
        <div key={matter.id} className="px-2.5 py-0.5">
          <Link
            to="/matters/$id"
            params={{ id: matter.id }}
            title={matter.name}
            className={recentRowCls(matter.id === activeId)}
          >
            <span className="flex-1 truncate">{matter.name}</span>
            {matter.id === activeId && (
              <span className="size-1.5 shrink-0 rounded-full bg-bronze" />
            )}
          </Link>
        </div>
      ))}
    </RecentShell>
  );
}

function RecentDocuments() {
  const { data: docs = [] } = useDocuments();
  const activeId = useRouterState({
    select: (s) => /^\/documents\/(.+)$/.exec(s.location.pathname)?.[1],
  });
  const items = [...docs]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);

  return (
    <RecentShell title="Recent documents" empty="No documents yet." isEmpty={items.length === 0}>
      {items.map((doc) => (
        <div key={doc.id} className="px-2.5 py-0.5">
          <Link
            to="/documents/$id"
            params={{ id: doc.id }}
            title={doc.title}
            className={recentRowCls(doc.id === activeId)}
          >
            <span className="flex-1 truncate">{doc.title}</span>
            {doc.id === activeId && <span className="size-1.5 shrink-0 rounded-full bg-bronze" />}
          </Link>
        </div>
      ))}
    </RecentShell>
  );
}

function RecentClients() {
  const { data: clients = [] } = useClients();
  // Clients have no detail route — they open in a dialog on the list page driven
  // by the ?client param.
  const activeId = useRouterState({
    select: (s) =>
      s.location.pathname === "/clients"
        ? (s.location.search as { client?: string }).client
        : undefined,
  });
  const items = [...clients]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, RECENT_LIMIT);

  return (
    <RecentShell title="Recent clients" empty="No clients yet." isEmpty={items.length === 0}>
      {items.map((client) => (
        <div key={client.id} className="px-2.5 py-0.5">
          <Link
            to="/clients"
            search={{ client: client.id }}
            title={client.name}
            className={recentRowCls(client.id === activeId)}
          >
            <span className="flex-1 truncate">{client.name}</span>
            {client.id === activeId && (
              <span className="size-1.5 shrink-0 rounded-full bg-bronze" />
            )}
          </Link>
        </div>
      ))}
    </RecentShell>
  );
}

// Real conversation list for the assistant section. "New chat" starts a fresh
// thread; each row resumes a conversation.
function ChatHistoryPanel() {
  const { data: chats = [] } = useChats();
  const activeChat = useRouterState({
    select: (s) => /^\/assistant\/(.+)$/.exec(s.location.pathname)?.[1],
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-sidebar-border py-2">
      <div className="px-5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Conversations
      </div>
      <div className="px-2.5 py-0.5">
        <Link
          to="/assistant"
          className="flex h-9 items-center gap-3 rounded-md px-2.5 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent/60"
        >
          <Plus className="size-4 shrink-0" />
          <span className="flex-1">New chat</span>
        </Link>
      </div>
      <nav className="mt-1 min-h-0 flex-1 overflow-y-auto">
        {chats.length === 0 && (
          <p className="px-5 py-2 text-xs text-muted-foreground">No conversations yet.</p>
        )}
        {chats.map((chat) => {
          const active = chat.id === activeChat;
          return (
            <div key={chat.id} className="px-2.5 py-0.5">
              <Link
                to="/assistant/$id"
                params={{ id: chat.id }}
                title={chat.title ?? "Untitled"}
                className={cn(
                  "flex h-8 items-center gap-3 rounded-md px-2.5 text-left text-sm transition-colors",
                  active
                    ? "bg-sidebar-accent text-sidebar-accent-foreground"
                    : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60"
                )}
              >
                <span className="flex-1 truncate">{chat.title ?? "Untitled"}</span>
                {active && <span className="size-1.5 shrink-0 rounded-full bg-bronze" />}
              </Link>
            </div>
          );
        })}
      </nav>
    </div>
  );
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

function MatterSwitcher({ open }: { open: boolean }) {
  const { matters, current, setCurrent } = useMatters();
  const [pop, setPop] = useState(false);

  if (!current) {
    // No matters loaded yet (or none accessible) — show a quiet placeholder.
    return open ? (
      <div className="rounded-lg border border-dashed border-sidebar-border px-2.5 py-2 text-xs text-muted-foreground">
        No matter selected
      </div>
    ) : null;
  }

  return (
    <Popover open={pop} onOpenChange={setPop}>
      <PopoverTrigger
        title={!open ? `${current.client.name} · ${current.matter.name}` : undefined}
        className={cn(
          "flex w-full items-center gap-2 rounded-lg border border-sidebar-border bg-background/60 px-2.5 py-2 text-left transition-colors hover:bg-sidebar-accent/60",
          !open && "justify-center px-0"
        )}
      >
        <Briefcase className="size-4 shrink-0 text-muted-foreground" />
        {open && (
          <>
            <span className="flex min-w-0 flex-1 flex-col leading-tight">
              <span className="truncate text-xs font-medium">{current.matter.name}</span>
              <span className="truncate text-xs text-muted-foreground">{current.client.name}</span>
            </span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 gap-0 p-0">
        <div className="border-b px-3 py-2 text-xs font-medium text-muted-foreground">
          Working matter
        </div>
        <ul className="max-h-72 overflow-y-auto py-1">
          {matters.map(({ matter, client, role }) => {
            const active = matter.id === current.matter.id;
            return (
              <li key={matter.id}>
                <button
                  onClick={() => {
                    setCurrent(matter.id);
                    setPop(false);
                  }}
                  className="flex w-full items-center gap-2 px-3 py-2 text-left hover:bg-accent/60"
                >
                  <Check className={cn("size-4 shrink-0", active ? "opacity-100" : "opacity-0")} />
                  <span className="flex min-w-0 flex-1 flex-col leading-tight">
                    <span className="truncate text-sm">{matter.name}</span>
                    <span className="truncate text-xs text-muted-foreground">{client.name}</span>
                  </span>
                  <span className="shrink-0 text-xs text-muted-foreground">{ROLE_LABEL[role]}</span>
                </button>
              </li>
            );
          })}
        </ul>
        <Link
          to="/matters"
          onClick={() => setPop(false)}
          className="block border-t px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Manage matters →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
