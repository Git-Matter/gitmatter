import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";

// Shared chrome for the cloud-only marketing site: top nav + footer around the
// page outlet. Cloud-only — bundled solely when DEPLOYMENT=cloud.
export default function MarketingLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="flex items-center justify-between px-6 py-4">
        <Link to="/" className="font-heading text-xl font-semibold tracking-tight">
          gitcounsel
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link
            to="/about"
            className="rounded-md px-3 py-2 text-muted-foreground hover:text-foreground"
          >
            About
          </Link>
          <Link to="/login" className="rounded-md px-3 py-2 hover:text-foreground">
            Log in
          </Link>
          <Link to="/signup" className="ml-1">
            <Button size="sm">Get started</Button>
          </Link>
        </nav>
      </header>

      <main className="flex-1">{children}</main>

      <footer className="flex flex-col items-center gap-2 px-6 py-8 text-center text-sm text-muted-foreground">
        <nav className="flex items-center gap-4">
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
        <span>© gitcounsel — the audited legal backend any AI agent plugs into.</span>
      </footer>
    </div>
  );
}
