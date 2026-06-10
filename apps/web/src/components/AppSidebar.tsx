import { useEffect, useState } from "react";
import { Link, useRouterState, useRouter } from "@tanstack/react-router";
import {
  Briefcase,
  Building2,
  Check,
  ChevronsUpDown,
  FileText,
  FolderOpen,
  Library,
  MessageSquare,
  PanelLeft,
  Settings as SettingsIcon,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { signOut, useSession } from "../lib/auth-client";
import { useMatters } from "../lib/matters-context";

const NAV_ITEMS = [
  { href: "/", label: "Reviews", icon: Table2, exact: true },
  { href: "/contracts", label: "Contracts", icon: FileText },
  { href: "/workflows", label: "Workflows", icon: Library },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/matters", label: "Matters", icon: Briefcase },
  { href: "/settings", label: "Settings", icon: SettingsIcon },
] as const;

export function AppSidebar() {
  const { data: session } = useSession();
  const router = useRouter();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const saved = typeof window !== "undefined" ? localStorage.getItem("sidebarOpen") : null;
    if (saved !== null) setOpen(saved === "true");
  }, []);

  function toggle() {
    setOpen((v) => {
      const next = !v;
      localStorage.setItem("sidebarOpen", String(next));
      return next;
    });
  }

  if (!session) return null;

  const initial = (session.user.name || session.user.email).charAt(0).toUpperCase();

  return (
    <div
      className={cn(
        open ? "w-64" : "w-14",
        "my-2 mr-0 ml-2 flex flex-col rounded-2xl border border-sidebar-border bg-sidebar text-sidebar-foreground shadow-xs md:my-3 md:ml-3",
        "h-[calc(100dvh-1.5rem)] transition-all duration-300"
      )}
    >
      {/* Logo + toggle */}
      <div
        className={cn("flex items-center px-2.5 py-3", open ? "justify-between" : "justify-center")}
      >
        {open && (
          <Link
            to="/"
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
      <nav className="flex flex-col">
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
                {open && <span className="text-sm font-medium">{label}</span>}
              </Link>
            </div>
          );
        })}
      </nav>

      <div className="flex-1" />

      {/* User footer */}
      <div className="border-t border-sidebar-border p-2">
        <div
          className={cn("flex items-center gap-2 rounded-md px-2 py-2", !open && "justify-center")}
        >
          <span className="grid size-7 shrink-0 place-items-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
            {initial}
          </span>
          {open && (
            <div className="flex min-w-0 flex-1 flex-col">
              <span className="truncate text-xs font-medium">{session.user.email}</span>
              <button
                onClick={() => signOut().then(() => router.navigate({ to: "/login" }))}
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
              <span className="truncate text-[11px] text-muted-foreground">
                {current.client.name}
              </span>
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
                  <span className="shrink-0 text-[11px] text-muted-foreground">
                    {ROLE_LABEL[role]}
                  </span>
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
