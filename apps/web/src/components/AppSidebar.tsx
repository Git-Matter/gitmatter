import { useEffect, useState } from "react";
import { Link, useRouterState, useRouter } from "@tanstack/react-router";
import {
  FileText,
  FolderOpen,
  Library,
  MessageSquare,
  PanelLeft,
  Settings as SettingsIcon,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { signOut, useSession } from "../lib/auth-client";

const NAV_ITEMS = [
  { href: "/", label: "Reviews", icon: Table2, exact: true },
  { href: "/contracts", label: "Contracts", icon: FileText },
  { href: "/workflows", label: "Workflows", icon: Library },
  { href: "/chat", label: "Chat", icon: MessageSquare },
  { href: "/documents", label: "Documents", icon: FolderOpen },
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
            <span className="grid size-6 place-items-center rounded-md bg-primary text-xs font-bold text-primary-foreground">
              g
            </span>
            <span className="font-serif text-2xl font-light">gitcounsel</span>
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
