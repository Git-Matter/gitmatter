import { useEffect } from "react";
import { Link } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Wordmark from "@/marketing/components/Wordmark";

// Shared chrome for the cloud-only marketing site: top nav + footer around the
// page outlet. Cloud-only — bundled solely when DEPLOYMENT=cloud.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  // The marketing site is always warm-paper editorial — pin it to light even if
  // the visitor's product theme is dark. Restore their theme on the way out.
  useEffect(() => {
    const root = document.documentElement;
    const wasDark = root.classList.contains("dark");
    root.classList.remove("dark");
    return () => {
      if (wasDark) root.classList.add("dark");
    };
  }, []);

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" aria-label="gitmatter home">
          <Wordmark />
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/about"
            className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            About
          </Link>
          <a
            href={SITE.docs}
            className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            Docs
          </a>
          <a
            href={SITE.github}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1.5 rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            <GitBranch className="size-4" />
            GitHub
          </a>
          <Link to="/login" className="rounded-md px-3 py-2 hover:text-foreground">
            Log in
          </Link>
          <Link to="/signup" className="ml-1">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-section border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <Wordmark />
            <span className="text-xs">
              Built on{" "}
              <a
                href={SITE.mikeoss}
                target="_blank"
                rel="noreferrer"
                className="text-bronze underline-offset-4 hover:underline"
              >
                mikeoss.com
              </a>
            </span>
          </div>
          <nav className="flex flex-wrap items-center gap-4">
            <a href={SITE.docs} className="hover:text-foreground">
              Docs
            </a>
            <a
              href={SITE.github}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 hover:text-foreground"
            >
              <GitBranch className="size-4" />
              GitHub
            </a>
            <Link to="/privacy" className="hover:text-foreground">
              Privacy
            </Link>
            <Link to="/terms" className="hover:text-foreground">
              Terms
            </Link>
            <Link to="/security" className="hover:text-foreground">
              Security
            </Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
