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
  BookMarked,
  Check,
  ChevronsUpDown,
  FolderOpen,
  Library,
  LogOut,
  Monitor,
  Moon,
  Plus,
  Settings as SettingsIcon,
  Sun,
  Table2,
} from "lucide-react";
import { cn } from "@/lib/util/utils";
import BrandMark from "@/components/BrandMark";
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
import type { ServerSession } from "../lib/auth/session";
import { ChatNavPanel } from "./sidebar/ChatNavPanel";
import {
  Sidebar,
  SidebarContent,
  SidebarFooter,
  SidebarHeader,
  SidebarMenu,
  SidebarMenuItem,
  SidebarMenuButton,
  SidebarTrigger,
  useSidebar,
} from "@/components/ui/sidebar";

// "New chat" leads the rail (ChatGPT-style); the rest are the app sections.
const NEW_CHAT = { href: "/assistant", label: "New chat", icon: Plus } as const;
const NAV_ITEMS = [
  { href: "/reviews", label: "Reviews", icon: Table2 },
  { href: "/workflows", label: "Workflows", icon: Library },
  { href: "/library", label: "Library", icon: BookMarked },
  { href: "/documents", label: "Documents", icon: FolderOpen },
  { href: "/clients", label: "Clients", icon: Building2 },
  { href: "/matters", label: "Matters", icon: Briefcase },
] as const;

type AppRouterState = RouterState<RegisteredRouter["routeTree"]>;

export function AppSidebar({ session }: { session: NonNullable<ServerSession> }) {
  const { open, isMobile, setOpenMobile } = useSidebar();
  const pathname = useRouterState({ select: (state: AppRouterState) => state.location.pathname });
  const expanded = isMobile || open;
  const closeMobile = () => {
    if (isMobile) setOpenMobile(false);
  };
  return (
    <Sidebar collapsible="icon">
      <SidebarHeader>
        <div className="flex min-h-10 items-center justify-between gap-2">
          {expanded && (
            <Link
              to="/assistant"
              onClick={closeMobile}
              className="flex min-w-0 items-center gap-2 px-2"
            >
              <BrandMark className="size-5 shrink-0" />
              <span className="font-serif text-xl">gitmatter</span>
            </Link>
          )}
          <SidebarTrigger aria-label={expanded ? "Collapse sidebar" : "Expand sidebar"} />
        </div>
      </SidebarHeader>
      <SidebarContent>
        <nav aria-label="Workspace sections" className="px-2">
          <SidebarMenu>
            {[NEW_CHAT, ...NAV_ITEMS].map(({ href, label, icon: Icon }) => (
              <SidebarMenuItem key={href}>
                <SidebarMenuButton
                  render={<Link to={href} onClick={closeMobile} />}
                  isActive={pathname === href || pathname.startsWith(`${href}/`)}
                  aria-current={
                    pathname === href || pathname.startsWith(`${href}/`) ? "page" : undefined
                  }
                  tooltip={label}
                  variant={href === NEW_CHAT.href ? "outline" : "default"}
                >
                  <Icon />
                  <span>{label}</span>
                </SidebarMenuButton>
              </SidebarMenuItem>
            ))}
          </SidebarMenu>
        </nav>
        {expanded && <ChatNavPanel onNavigate={closeMobile} />}
      </SidebarContent>
      <SidebarFooter>
        <SidebarMenu>
          <SidebarMenuItem>
            <SidebarMenuButton
              render={<Link to="/settings" onClick={closeMobile} />}
              tooltip="Settings"
              isActive={pathname.startsWith("/settings")}
            >
              <SettingsIcon />
              <span>Settings</span>
            </SidebarMenuButton>
          </SidebarMenuItem>
        </SidebarMenu>
        <UserMenu session={session} open={expanded} />
      </SidebarFooter>
    </Sidebar>
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
        <DropdownMenuItem
          render={<Link to="/sign-out" preload={false} state={{ signOutRequested: true }} />}
        >
          <LogOut className="size-4" />
          Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
