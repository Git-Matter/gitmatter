import { ActionFeedback } from "./ActionFeedback";
import { useEffect, useState, type ReactNode } from "react";
import type { ServerSession } from "@/lib/auth/session";
import { UnsavedChangesProvider } from "./UnsavedChangesGuard";
import { WorkspaceViewProvider } from "@/lib/hooks/state/useWorkspaceViewState";
import { AppSidebar } from "./AppSidebar";
import { SidebarProvider, SidebarTrigger } from "@/components/ui/sidebar";

/** One workspace frame for navigation, page context and the current work surface. */
export function AppFrame({
  session,
  children,
}: {
  session: NonNullable<ServerSession>;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(true);
  useEffect(() => {
    const saved = localStorage.getItem("sidebarOpen");
    if (saved !== null) setOpen(saved === "true");
  }, []);
  return (
    <UnsavedChangesProvider>
      <WorkspaceViewProvider scope={`${session.user.id}:${session.session.id}`}>
        <SidebarProvider
          data-app-frame
          className="h-dvh min-h-0 bg-card"
          open={open}
          onOpenChange={(next) => {
            setOpen(next);
            localStorage.setItem("sidebarOpen", String(next));
          }}
        >
          <AppSidebar session={session} />
          <main className="min-h-0 min-w-0 flex-1 overflow-hidden bg-card">
            <div className="flex h-full min-h-0 flex-col">
              <div className="flex h-10 shrink-0 items-center gap-2 px-3 md:hidden">
                <SidebarTrigger aria-label="Expand sidebar" />
                <span className="text-sm font-medium">gitmatter</span>
              </div>
              <div className="flex min-h-0 flex-1 flex-col px-4 py-4 md:px-work">
                <ActionFeedback key={`${session.user.id}:${session.session.id}`} />
                {children}
              </div>
            </div>
          </main>
        </SidebarProvider>
      </WorkspaceViewProvider>
    </UnsavedChangesProvider>
  );
}
