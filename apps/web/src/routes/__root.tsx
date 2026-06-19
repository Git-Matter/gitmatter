import { HeadContent, Scripts, createRootRoute } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorState } from "../components/ErrorState";
import { MattersProvider } from "../lib/context/matters-context";
import { queryClient } from "../lib/data/query";
import { getServerSession } from "../lib/auth/session";

import appCss from "@/styles/globals.css?url";

// Authed-only chrome, lazy-loaded so its weight (base-ui Popover, lucide icons,
// the chats query, sonner) leaves the shared entry chunk. The logged-out / login
// path — the cold-load case — then ships none of it, cutting hydration work
// (faster TTI/INP). On authed pages these load in parallel after first paint.
const AppSidebar = lazy(() =>
  import("../components/AppSidebar").then((m) => ({ default: m.AppSidebar }))
);
const Toaster = lazy(() => import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })));

export const Route = createRootRoute({
  // Resolve the session on the server so every route's beforeLoad (and the
  // shell below) can render the correct logged-in/out chrome in the SSR HTML,
  // instead of a blank screen that only fills in after client hydration.
  // Session changes (login/logout) do a full reload, so this stays accurate
  // for the lifetime of the loaded app.
  beforeLoad: async () => ({ session: await getServerSession() }),
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "gitmatter" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => (
    <ErrorState
      code="404"
      title="Page not found"
      message="The page you're looking for doesn't exist or may have moved."
    />
  ),
  errorComponent: ({ error, reset }) => (
    <ErrorState
      code="Error"
      title="Something went wrong"
      message={
        import.meta.env.DEV && error?.message
          ? error.message
          : "An unexpected error occurred. Try again, or head back home."
      }
      onRetry={reset}
    />
  ),
  shellComponent: RootDocument,
});

function Shell({ children }: { children: React.ReactNode }) {
  // Server-resolved (see root beforeLoad): known during SSR, so the shell
  // renders real chrome in the server HTML — no blank-screen wait.
  const { session } = Route.useRouteContext();

  // Logged out: bare chrome (no sidebar, no MattersProvider). Access control
  // for protected routes lives in the _auth pathless layout, not here.
  if (!session) {
    return (
      <div className="min-h-dvh bg-background">
        <main className="container mx-auto px-6 pt-page pb-12">{children}</main>
      </div>
    );
  }

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
            {children}
          </div>
        </main>
      </div>
    </MattersProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <QueryClientProvider client={queryClient}>
          <ThemeProvider
            attribute="class"
            defaultTheme="system"
            enableSystem
            disableTransitionOnChange
          >
            <TooltipProvider>
              <Shell>{children}</Shell>
            </TooltipProvider>
          </ThemeProvider>
        </QueryClientProvider>
        <Suspense fallback={null}>
          <Toaster />
        </Suspense>
        <Scripts />
      </body>
    </html>
  );
}
