import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import Wordmark from "@/components/Wordmark";

export function LegalPage({
  title,
  lastUpdated,
  children,
}: {
  title: string;
  lastUpdated?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-2xl px-6">
      <header className="flex flex-wrap items-center justify-between gap-4 py-4">
        <Link to="/" className="inline-flex min-h-11 items-center">
          <Wordmark />
        </Link>
        <nav aria-label="Service" className="flex items-center gap-6 text-sm">
          <a href="/docs" className="inline-flex min-h-11 items-center underline">
            Docs
          </a>
          <Link to="/login" className="inline-flex min-h-11 items-center underline">
            Log in
          </Link>
        </nav>
      </header>
      <main className="py-section">
        <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
        {lastUpdated ? (
          <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
        ) : null}
        <div className="mt-stack flex flex-col gap-4 text-sm text-muted-foreground [&_h2]:mt-2 [&_h2]:font-heading [&_h2]:text-base [&_h2]:text-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5">
          {children}
        </div>
      </main>
      <footer className="pb-section">
        <nav aria-label="Legal" className="flex gap-6 text-sm">
          <Link to="/privacy" className="inline-flex min-h-11 items-center underline">
            Privacy
          </Link>
          <Link to="/terms" className="inline-flex min-h-11 items-center underline">
            Terms
          </Link>
        </nav>
      </footer>
    </div>
  );
}
