import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { MattersProvider } from "../../lib/context/matters-context";
import { getServerSession, getServerTenant } from "../../lib/auth/session";

// Authed-only chrome, lazy-loaded so its weight (base-ui Popover, lucide icons,
// the chats query, sonner) leaves the shared entry chunk — the logged-out /
// login path ships none of it.
const AppSidebar = lazy(() =>
  import("../../components/AppSidebar").then((m) => ({ default: m.AppSidebar }))
);

// Pathless layout that gates every route nested under it. Session is resolved
// here (not in the root) so public/marketing/login pages stay session-free and
// prerender without a database. This runs at request time for real authed
// traffic — cookies and DB available — so the protected shell renders directly
// in the SSR HTML with no blank-screen wait.
export const Route = createFileRoute("/_auth")({
  beforeLoad: async ({ location }) => {
    const session = await getServerSession();
    if (!session) {
      throw redirect({ to: "/login", search: { next: location.href } });
    }
    const tenant = await getServerTenant();
    if (tenant && !tenant.storageRegion && location.pathname !== "/onboarding") {
      throw redirect({ to: "/onboarding" });
    }
    if (tenant?.storageRegion && location.pathname === "/onboarding") {
      throw redirect({ to: "/assistant" });
    }
    // Narrow session to non-null for every route nested under this guard.
    return { session };
  },
  component: AuthLayout,
});

function AuthLayout() {
  const { session } = Route.useRouteContext();
  return (
    <MattersProvider>
      <div className="flex h-dvh bg-background">
        <Suspense
          fallback={
            <div className="fixed top-0 bottom-0 left-0 z-40 m-2 h-[calc(100dvh-1rem)] w-14 rounded-2xl glass-panel md:static md:z-auto md:my-3 md:mr-0 md:ml-3 md:h-[calc(100dvh-1.5rem)] md:w-64 md:shrink-0" />
          }
        >
          <AppSidebar session={session} />
        </Suspense>
        <main className="min-h-0 flex-1 overflow-hidden">
          <div className="container mx-auto flex h-full min-h-0 flex-col px-6 pt-page pb-12">
            <Outlet />
          </div>
        </main>
      </div>
    </MattersProvider>
  );
}
