import { useEffect, useState } from "react";
import {
  Link,
  useRouterState,
  type RegisteredRouter,
  type RouterState,
} from "@tanstack/react-router";
import { useTheme } from "next-themes";
import {
  Briefcase,
  Building2,
  Check,
  ChevronsUpDown,
  FolderOpen,
  Library,
  LogOut,
  MessageSquare,
  Monitor,
  Moon,
  PanelLeft,
  Settings as SettingsIcon,
  Sun,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { signOut } from "../lib/auth-client";
import { useMatters } from "../lib/matters-context";
import type { ServerSession } from "../lib/session";
import { ChatHistoryPanel } from "./sidebar/ChatHistoryPanel";
import { RecentPanel } from "./sidebar/RecentPanel";

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

const NARROW_QUERY = "(max-width: 767px)";
type AppRouterState = RouterState<RegisteredRouter["routeTree"]>;

function activeSection(pathname: string): string | null {
  const hit = NAV_ITEMS.find((i) => pathname === i.href || pathname.startsWith(`${i.href}/`));
  return hit?.href ?? null;
}

export function AppSidebar({ session }: { session: NonNullable<ServerSession> }) {
  // User's saved preference. Below md the sidebar force-collapses regardless.
  const [userOpen, setUserOpen] = useState(true);
  const [narrow, setNarrow] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("sidebarOpen") : null;
    if (saved !== null) setUserOpen(saved === "true");
  }, []);

  useEffect(() => {
    const mq = window.matchMedia(NARROW_QUERY);
    const sync = () => setNarrow(mq.matches);
    sync();
    mq.addEventListener("change", sync);
    return () => mq.removeEventListener("change", sync);
  }, []);

  useEffect(() => {
    if (!narrow) setMobileOpen(false);
  }, [narrow]);

  // Narrow viewport wins: keep the rail small and open the full sidebar as an overlay.
  const open = userOpen && !narrow;

  function toggle() {
    setUserOpen((v) => {
      const next = !v;
      localStorage.setItem("sidebarOpen", String(next));
      return next;
    });
  }

  if (narrow) {
    // Persistent collapsed rail stays in flow so content never sits behind it.
    // The full sidebar opens on top as a drawer: dimmed backdrop + slide-in.
    return (
      <>
        <SidebarPanel
          session={session}
          open={false}
          mode="inline"
          onToggle={() => setMobileOpen(true)}
        />
        <button
          type="button"
          aria-label="Close sidebar"
          tabIndex={mobileOpen ? 0 : -1}
          onClick={() => setMobileOpen(false)}
          className={cn(
            "fixed inset-0 z-40 bg-foreground/40 backdrop-blur-sm transition-opacity duration-300",
            mobileOpen ? "opacity-100" : "pointer-events-none opacity-0"
          )}
        />
        <div
          className={cn(
            "fixed top-0 bottom-0 left-0 z-50 m-2 transition-transform duration-300",
            mobileOpen ? "translate-x-0" : "-translate-x-[120%]"
          )}
        >
          <SidebarPanel
            session={session}
            open
            mode="drawer"
            onNavigate={() => setMobileOpen(false)}
            onToggle={() => setMobileOpen(false)}
          />
        </div>
      </>
    );
  }

  return <SidebarPanel session={session} open={open} mode="inline" onToggle={toggle} />;
}

type SidebarPanelProps = {
  session: NonNullable<ServerSession>;
  open: boolean;
  mode: "inline" | "drawer";
  onNavigate?: () => void;
  onToggle?: () => void;
};

function SidebarPanel({ session, open, mode, onNavigate, onToggle }: SidebarPanelProps) {
  const pathname = useRouterState({ select: (s: AppRouterState) => s.location.pathname });
  const subSection = activeSection(pathname);
  // The assistant shows real conversations; document/client/matter sections show a
  // filter sub-nav. When a sub-panel exists, nav (top) and sub-panel (bottom) each
  // take half the height and scroll independently — otherwise nav sits at the top
  // and a spacer pushes the footer down.
  const showChats = open && subSection === "/assistant";
  const showSub = open && !!subSection && RECENT_SECTIONS.has(subSection);
  const hasSubPanel = showChats || showSub;
  const size = open ? "w-64" : "w-14";

  return (
    <div
      className={cn(
        "flex flex-col rounded-2xl glass-panel text-sidebar-foreground",
        mode === "inline" &&
          `${size} my-2 mr-0 ml-2 h-[calc(100dvh-1.5rem)] transition-all duration-300 md:my-3 md:ml-3`,
        mode === "drawer" && "h-[calc(100dvh-1rem)] w-[min(16rem,calc(100vw-1rem))]"
      )}
    >
      {/* Logo + toggle */}
      <div
        className={cn("flex items-center px-2.5 py-3", open ? "justify-between" : "justify-center")}
      >
        {open && (
          <Link
            to="/assistant"
            onClick={onNavigate}
            className="flex items-center gap-1.5 px-2 transition-opacity hover:opacity-80"
          >
            <span className="grid size-6 place-items-center rounded-md bg-primary font-serif text-sm font-medium text-primary-foreground">
              g
            </span>
            <span className="font-serif text-2xl font-light tracking-tight">gitcounsel</span>
          </Link>
        )}
        <SidebarToggle open={open} onToggle={onToggle} />
      </div>

      {/* Working-matter switcher */}
      <div className="px-2.5 pb-2">
        <MatterSwitcher open={open} onNavigate={onNavigate} />
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
                onClick={onNavigate}
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
      {showChats && <ChatHistoryPanel onNavigate={onNavigate} />}
      {showSub && <RecentPanel key={subSection} section={subSection} onNavigate={onNavigate} />}

      {/* No sub-panel: a spacer pushes the footer to the bottom. */}
      {!hasSubPanel && <div className="flex-1" />}

      {/* User footer */}
      <div className="border-t border-sidebar-border p-2">
        <UserMenu session={session} open={open} />
      </div>
    </div>
  );
}

const THEME_OPTIONS = [
  { value: "light", label: "Light", icon: Sun },
  { value: "dark", label: "Dark", icon: Moon },
  { value: "system", label: "System", icon: Monitor },
] as const;

function UserMenu({ session, open }: { session: NonNullable<ServerSession>; open: boolean }) {
  const { theme = "system", setTheme } = useTheme();
  const name = session.user.name?.trim() || "User";
  const initial = name.charAt(0).toUpperCase();

  function logOut() {
    void signOut().then(() => {
      window.location.href = "/login";
    });
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        title={!open ? name : undefined}
        aria-label="Open user menu"
        className={cn(
          "flex w-full items-center gap-2 rounded-md px-2 py-2 text-left transition-colors hover:bg-sidebar-accent/60",
          !open && "justify-center px-0"
        )}
      >
        <Avatar size="sm" className="bg-primary text-primary-foreground">
          <AvatarImage src={session.user.image ?? undefined} alt="" />
          <AvatarFallback className="bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </AvatarFallback>
        </Avatar>
        {open && (
          <>
            <span className="min-w-0 flex-1 truncate text-xs font-medium">{name}</span>
            <ChevronsUpDown className="size-3.5 shrink-0 text-muted-foreground" />
          </>
        )}
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" side="top" className="w-44">
        <DropdownMenuSub>
          <DropdownMenuSubTrigger>
            <Sun className="size-4" />
            Theme
          </DropdownMenuSubTrigger>
          <DropdownMenuSubContent className="w-36">
            {THEME_OPTIONS.map(({ value, label, icon: Icon }) => (
              <DropdownMenuItem key={value} onClick={() => setTheme(value)}>
                <Icon className="size-4" />
                <span className="flex-1">{label}</span>
                <Check className={cn("size-4", theme === value ? "opacity-100" : "opacity-0")} />
              </DropdownMenuItem>
            ))}
          </DropdownMenuSubContent>
        </DropdownMenuSub>
        <DropdownMenuSeparator />
        <DropdownMenuItem onClick={logOut}>
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function SidebarToggle({ open, onToggle }: { open: boolean; onToggle?: () => void }) {
  const label = open ? "Collapse" : "Expand";
  const className =
    "flex size-9 items-center justify-center rounded-xl transition-colors hover:bg-sidebar-accent";

  return (
    <button onClick={onToggle} title={label} className={className}>
      <PanelLeft className="size-4" />
    </button>
  );
}

const ROLE_LABEL: Record<string, string> = { owner: "Owner", editor: "Editor", viewer: "Viewer" };

function MatterSwitcher({ open, onNavigate }: { open: boolean; onNavigate?: () => void }) {
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
          onClick={() => {
            setPop(false);
            onNavigate?.();
          }}
          className="block border-t px-3 py-2 text-xs text-muted-foreground hover:text-foreground"
        >
          Manage matters →
        </Link>
      </PopoverContent>
    </Popover>
  );
}
