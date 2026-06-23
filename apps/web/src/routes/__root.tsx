import { HeadContent, Scripts, createRootRoute, useRouterState } from "@tanstack/react-router";
import { QueryClientProvider } from "@tanstack/react-query";
import { Suspense, lazy } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { ErrorState } from "../components/ErrorState";
import { queryClient } from "../lib/data/query";

import appCss from "@/styles/globals.css?url";

const Toaster = lazy(() => import("@/components/ui/sonner").then((m) => ({ default: m.Toaster })));

export const Route = createRootRoute({
  // Session is resolved per route group, not here: the `_auth` layout resolves
  // it (and renders the authed chrome), while public/marketing/login pages stay
  // session-free so they prerender to static HTML without a database.
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "gitmatter" },
    ],
    links: [
      { rel: "stylesheet", href: appCss },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "16x16", href: "/favicon-16.png" },
      { rel: "icon", href: "/favicon.ico", sizes: "any" },
      { rel: "icon", type: "image/svg+xml", href: "/favicon.svg" },
    ],
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
  // Plain document background. Each route group owns its own chrome: `_auth`
  // renders the sidebar + app container, `_unauth` the centered auth container,
  // and marketing its full-bleed MarketingLayout.
  return <div className="min-h-dvh bg-background">{children}</div>;
}

function RootDocument({ children }: { children: React.ReactNode }) {
  // The marketing site is always light (warm-paper editorial). Force it at the
  // root provider so next-themes' pre-paint script emits light — no dark flash
  // for visitors whose product theme is dark. Detected from the matched route
  // group, not the pathname, so it stays correct on client navigation.
  const isMarketing = useRouterState({
    select: (s) => s.matches.some((m) => m.routeId.includes("(marketing)")),
  });
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
            forcedTheme={isMarketing ? "light" : undefined}
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
