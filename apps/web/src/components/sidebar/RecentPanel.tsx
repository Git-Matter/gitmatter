import type { ReactNode } from "react";
import {
  Link,
  useRouterState,
  type RegisteredRouter,
  type RouterState,
} from "@tanstack/react-router";
import { cn } from "@/lib/utils";
import { useMatters } from "@/lib/matters-context";
import { useClients, useDocuments } from "@/lib/queries";

const RECENT_LIMIT = 12;

type AppRouterState = RouterState<RegisteredRouter["routeTree"]>;

export function RecentPanel({ section, onNavigate }: { section: string; onNavigate?: () => void }) {
  if (section === "/matters") return <RecentMatters onNavigate={onNavigate} />;
  if (section === "/documents") return <RecentDocuments onNavigate={onNavigate} />;
  if (section === "/clients") return <RecentClients onNavigate={onNavigate} />;
  return null;
}

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
  children: ReactNode;
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

function RecentMatters({ onNavigate }: { onNavigate?: () => void }) {
  const { matters } = useMatters();
  const activeId = useRouterState({
    select: (s: AppRouterState) => /^\/matters\/(.+)$/.exec(s.location.pathname)?.[1],
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
            onClick={onNavigate}
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

function RecentDocuments({ onNavigate }: { onNavigate?: () => void }) {
  const { data: docs = [] } = useDocuments();
  const activeId = useRouterState({
    select: (s: AppRouterState) => /^\/documents\/(.+)$/.exec(s.location.pathname)?.[1],
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
            onClick={onNavigate}
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

function RecentClients({ onNavigate }: { onNavigate?: () => void }) {
  const { data: clients = [] } = useClients();
  const activeId = useRouterState({
    select: (s: AppRouterState) =>
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
            onClick={onNavigate}
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
