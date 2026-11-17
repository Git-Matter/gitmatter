import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
  Link,
  type AnyRoute,
} from "@tanstack/react-router";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { AppFrame } from "@/components/AppFrame";
import { MattersProvider } from "@/lib/context/matters-context";
import type { ServerSession } from "@/lib/auth/session";
import { Route as Settings } from "@/routes/_auth/settings/index";
import { Route as Unauth } from "@/routes/_unauth/route";
import { Route as Login } from "@/routes/_unauth/login";
import { Route as Signup } from "@/routes/_unauth/signup";
import { Route as Forgot } from "@/routes/_unauth/forgot-password";
import { Route as Reset } from "@/routes/_unauth/reset-password";
import { Route as Verify } from "@/routes/_unauth/verify-email";
import { Route as TwoFactor } from "@/routes/_unauth/2fa";
import { Route as SignOut } from "@/routes/sign-out";
import "@/styles/globals.css";

const session = {
  user: {
    id: "fictional-user",
    name: "Fictional Reviewer",
    email: "reviewer@example.invalid",
    emailVerified: true,
    image: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  },
  session: {
    id: "fictional-session",
    token: "not-a-real-session",
    userId: "fictional-user",
    expiresAt: new Date("2099-01-01"),
    createdAt: new Date(),
    updatedAt: new Date(),
  },
} as NonNullable<ServerSession>;
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
let resetting = false;
window.addEventListener(
  "beforeunload",
  (event) => {
    if (resetting) event.stopImmediatePropagation();
  },
  { capture: true }
);

function Root() {
  return (
    <QueryClientProvider client={client}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <TooltipProvider>
          <Outlet />
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
function Shell() {
  return (
    <MattersProvider>
      <AppFrame session={session}>
        <Outlet />
      </AppFrame>
    </MattersProvider>
  );
}

const root = createRootRoute({ component: Root });
const auth = createRoute({
  getParentRoute: () => root,
  id: "_auth",
  beforeLoad: () => ({ session }),
  component: Shell,
});
Settings.update({ id: "/settings/", path: "/settings/", getParentRoute: () => auth } as never);
Unauth.update({ id: "_unauth", getParentRoute: () => root } as never);
SignOut.update({ id: "/sign-out", path: "/sign-out", getParentRoute: () => root } as never);
for (const [route, path] of [
  [Login, "/login"],
  [Signup, "/signup"],
  [Forgot, "/forgot-password"],
  [Reset, "/reset-password"],
  [Verify, "/verify-email"],
  [TwoFactor, "/2fa"],
] as const)
  route.update({ id: path, path, getParentRoute: () => Unauth } as never);
const destinations = [
  "/assistant",
  "/reviews",
  "/workflows",
  "/library",
  "/documents",
  "/clients",
  "/matters",
  "/onboarding",
].map((path) =>
  createRoute({
    getParentRoute: () => auth,
    path,
    component: () => (
      <div>
        <p>Fictional destination. No product operation was performed.</p>
        <Link to="/settings">Open settings</Link>
      </div>
    ),
  })
);
const router = createRouter({
  routeTree: root.addChildren([
    SignOut as AnyRoute,
    auth.addChildren([Settings, ...destinations] as AnyRoute[]),
    Unauth.addChildren([Login, Signup, Forgot, Reset, Verify, TwoFactor] as AnyRoute[]),
    createRoute({
      getParentRoute: () => root,
      path: "/",
      component: () => <Link to="/login">Log in</Link>,
    }),
  ]),
  history: createMemoryHistory({ initialEntries: [location.pathname + location.search] }),
});
declare global {
  interface Window {
    accountFixture: {
      location: () => string;
      back: () => void;
      forward: () => void;
      invalidate: (key: string) => Promise<void>;
      resetForNavigation: () => void;
    };
  }
}
window.accountFixture = {
  location: () => router.state.location.href,
  back: () => router.history.back(),
  forward: () => router.history.forward(),
  invalidate: async (key) => {
    await client.invalidateQueries({ queryKey: [key] });
  },
  resetForNavigation: () => {
    resetting = true;
  },
};
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
