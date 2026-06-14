import { Outlet, createFileRoute, redirect } from "@tanstack/react-router";

// Pathless layout that gates every route nested under it. The session is
// resolved on the server in the root beforeLoad and threaded through context,
// so this guard runs correctly during SSR (cookies are available) and renders
// the protected content directly — no blank-screen wait for client hydration.
export const Route = createFileRoute("/_auth")({
  beforeLoad: ({ context, location }) => {
    if (!context.session) {
      throw redirect({ to: "/login", search: { next: location.href } });
    }
    // Narrow session to non-null for every route nested under this guard.
    return { session: context.session };
  },
  component: AuthLayout,
});

function AuthLayout() {
  return <Outlet />;
}
