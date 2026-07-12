import { Link } from "@tanstack/react-router";
import { GitBranch } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Wordmark from "@/marketing/components/Wordmark";

// Shared chrome for the cloud-only marketing site: top nav + footer around the
// page outlet. Cloud-only — bundled solely when DEPLOYMENT=cloud. The site is
// pinned to light via forcedTheme in __root (pre-paint, no flash).
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="relative mx-auto flex w-full max-w-7xl items-center justify-between px-6 py-5">
        <Link to="/" aria-label="gitmatter home">
          <Wordmark />
        </Link>
        <nav className="absolute left-1/2 flex -translate-x-1/2 items-center gap-1 text-sm">
          <Link
            to="/features"
            className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            Features
          </Link>
          <Link
            to="/use-cases"
            className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            Use cases
          </Link>
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
        </nav>
        <a href={SITE.bookDemo} target="_blank" rel="noreferrer">
          <Button size="sm">Book demo</Button>
        </a>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="mt-section border-t border-border">
        <div className="mx-auto flex w-full max-w-7xl flex-col gap-4 px-6 py-10 text-sm text-muted-foreground sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-col gap-2">
            <Wordmark />
          </div>
          <nav className="flex flex-wrap items-center gap-4">
            <Link to="/features" className="hover:text-foreground">
              Features
            </Link>
            <Link to="/use-cases" className="hover:text-foreground">
              Use cases
            </Link>
            <Link to="/compare" className="hover:text-foreground">
              Compare
            </Link>
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
