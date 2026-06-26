import { Navigate, Outlet, createFileRoute, useLocation } from "@tanstack/react-router";
import { useSession } from "../../lib/auth/auth-client";

// Guest-only layout for login/signup. These pages are prerendered to static
// HTML (cloud build), so they must not resolve the session on the server —
// that would need a database at build time. Instead a logged-in visitor is
// bounced to the app client-side after hydration.
export const Route = createFileRoute("/_unauth")({
  component: UnauthLayout,
});

function UnauthLayout() {
  const { data: session } = useSession();
  const location = useLocation();
  const isVerificationStep = location.pathname === "/verify-email";
  if (session && !isVerificationStep) {
    return <Navigate to="/assistant" />;
  }
  return (
    <main className="container mx-auto px-6 pt-page pb-12">
      <Outlet />
    </main>
  );
}
