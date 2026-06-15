import {
  Link,
  useRouterState,
  type RegisteredRouter,
  type RouterState,
} from "@tanstack/react-router";
import { Plus } from "lucide-react";
import { cn } from "@/lib/utils";
import { useChats } from "@/lib/queries";

type AppRouterState = RouterState<RegisteredRouter["routeTree"]>;

export function ChatHistoryPanel({ onNavigate }: { onNavigate?: () => void }) {
  const { data: chats = [] } = useChats();
  const activeChat = useRouterState({
    select: (s: AppRouterState) => /^\/assistant\/(.+)$/.exec(s.location.pathname)?.[1],
  });

  return (
    <div className="flex min-h-0 flex-1 flex-col border-t border-sidebar-border py-2">
      <div className="px-5 pb-1 text-xs font-medium tracking-wide text-muted-foreground uppercase">
        Conversations
      </div>
      <div className="px-2.5 py-0.5">
        <Link
          to="/assistant"
          onClick={onNavigate}
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
                onClick={onNavigate}
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
