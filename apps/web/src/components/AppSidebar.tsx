import { useEffect, useState } from "react";
import {
  Link,
  useRouterState,
  type RegisteredRouter,
  type RouterState,
} from "@tanstack/react-router";
import { useTheme } from "next-themes";
import {
  BookOpen,
  Briefcase,
  Building2,
  Check,
  ChevronsUpDown,
  FolderOpen,
  Library,
  LogOut,
  Monitor,
  Moon,
  PanelLeft,
  Plus,
  Settings as SettingsIcon,
  Sun,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/util/utils";
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
import { signOut } from "../lib/auth/auth-client";
import type { ServerSession } from "../lib/auth/session";
import { ChatNavPanel } from "./sidebar/ChatNavPanel";

// "New chat" leads the rail (ChatGPT-style); the rest are the app sections.
const NEW_CHAT = { href: "/assistant", label: "New chat", icon: Plus } as const;
const NAV_ITEMS = [
  { href: "/reviews", label: "Reviews", icon: Table2 },
  { href: "/workflows", label: "Workflows", icon: Library },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/matters", label: "Matters", icon: Briefcase },
] as const;

const NARROW_QUERY = "(max-width: 767px)";
type AppRouterState = RouterState<RegisteredRouter["routeTree"]>;

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
            <span className="font-serif text-2xl font-light tracking-tight">gitmatter</span>
          </Link>
        )}
        <SidebarToggle open={open} onToggle={onToggle} />
      </div>

      {/* Nav — New chat leads, then the app sections (ChatGPT-style rail). */}
      <nav className="flex shrink-0 flex-col">
        {[NEW_CHAT, ...NAV_ITEMS].map(({ href, label, icon: Icon }) => {
          const active = pathname === href || pathname.startsWith(`${href}/`);
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

      {/* Chat navigator — Pinned / Matters / Chats. Collapsed rail stays icons-only. */}
      {open ? (
        <div className="mt-1 flex min-h-0 flex-1 flex-col">
          <ChatNavPanel onNavigate={onNavigate} />
        </div>
      ) : (
        <div className="flex-1" />
      )}

      {/* User footer */}
      <div className="p-2">
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
        <DropdownMenuItem render={<Link to="/settings" />}>
          <SettingsIcon className="size-4" />
          Settings
        </DropdownMenuItem>
        {/* Plain anchor: /docs is served by the separate docs app (reverse-proxied),
            not a route in this app, so it must be a full navigation. */}
        <DropdownMenuItem render={<a href="/docs" />}>
          <BookOpen className="size-4" />
          Documentation
        </DropdownMenuItem>
        <DropdownMenuSeparator />
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
