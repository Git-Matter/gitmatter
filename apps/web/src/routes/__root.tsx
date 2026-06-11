import {
  HeadContent,
  Link,
  Scripts,
  createRootRoute,
  useRouter,
  useRouterState,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { Toaster } from "@/components/ui/sonner";
import { AppSidebar } from "../components/AppSidebar";
import { useSession } from "../lib/auth-client";
import { MattersProvider } from "../lib/matters-context";

// Pages a logged-out visitor may see. Everything else redirects to /login.
const PUBLIC_PATHS = new Set(["/", "/login", "/signup"]);

import appCss from "@/styles/globals.css?url";

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1" },
      { title: "gitcounsel" },
    ],
    links: [{ rel: "stylesheet", href: appCss }],
  }),
  notFoundComponent: () => (
    <main className="container mx-auto p-4 pt-16">
      <h1 className="text-lg font-medium">404</h1>
      <p className="text-muted-foreground">The requested page could not be found.</p>
    </main>
  ),
  shellComponent: RootDocument,
});

function AuthRedirect({ next }: { next: string }) {
  const router = useRouter();
  useEffect(() => {
    void router.navigate({ to: "/login", search: { next } });
  }, [router, next]);
  return <div className="min-h-dvh bg-background" />;
}

function Shell({ children }: { children: React.ReactNode }) {
  const { data: session, isPending } = useSession();
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  // Still resolving the session: don't mount route children yet, so hooks that
  // need a logged-in provider (useMatters) never run without one.
  if (isPending) return <div className="min-h-dvh bg-background" />;

  // Logged out: gate protected routes, then render bare chrome (no sidebar,
  // no MattersProvider) for the public pages.
  if (!session) {
    if (!PUBLIC_PATHS.has(pathname)) return <AuthRedirect next={pathname} />;
    return (
      <div className="min-h-dvh bg-background">
        <header className="flex h-12 items-center justify-end gap-3 px-4 text-sm">
          <Link to="/login" className="text-muted-foreground hover:text-foreground">
            Log in
          </Link>
          <Link to="/signup" className="text-muted-foreground hover:text-foreground">
            Sign up
          </Link>
        </header>
        <main className="container mx-auto px-6 pt-page pb-12">{children}</main>
      </div>
    );
  }

  return (
    <MattersProvider>
      <div className="flex h-dvh bg-background">
        <AppSidebar />
        <main className="h-dvh flex-1 overflow-y-auto">
          <div className="container mx-auto px-6 pt-page pb-12">{children}</div>
        </main>
      </div>
    </MattersProvider>
  );
}

function RootDocument({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        <Shell>{children}</Shell>
        <Toaster />
        <Scripts />
      </body>
    </html>
  );
}
