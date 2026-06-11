import { Link } from "@tanstack/react-router";

// Centered layout for the logged-out auth pages (login, signup): wordmark on
// top, a short heading, then the form card.
export function AuthShell({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex min-h-[calc(100dvh-8rem)] items-center justify-center">
      <div className="flex w-full max-w-sm flex-col gap-section">
        <div className="flex flex-col items-center gap-2 text-center">
          <Link to="/" className="font-heading text-2xl font-semibold tracking-tight">
            gitcounsel
          </Link>
          <h1 className="font-heading text-xl">{title}</h1>
          <p className="text-sm text-muted-foreground">{subtitle}</p>
        </div>
        {children}
      </div>
    </div>
  );
}
