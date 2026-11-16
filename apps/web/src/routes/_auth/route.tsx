import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";
import { Suspense, lazy } from "react";
import { MattersProvider } from "../../lib/context/matters-context";
import { getServerSession, getServerTenant } from "../../lib/auth/session";

// Authed-only chrome, lazy-loaded so its weight (base-ui Popover, lucide icons,
// the chats query, sonner) leaves the shared entry chunk — the logged-out /
// login path ships none of it.
const AppFrame = lazy(() =>
  import("../../components/AppFrame").then((m) => ({ default: m.AppFrame }))
);

// Pathless layout that gates every route nested under it. Session is resolved
// here (not in the root) so legal and login pages stay session-free and
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
      throw redirect({ to: "/first-review" });
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
      <Suspense fallback={<div className="h-dvh bg-sidebar" />}>
        <AppFrame session={session}>
          <Outlet />
        </AppFrame>
      </Suspense>
    </MattersProvider>
  );
}
