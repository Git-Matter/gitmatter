import type { ReactNode } from "react";

// Shared shell for the legal pages: a heading and prose styling for the body.
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
    <div className="mx-auto max-w-2xl px-6 py-section">
      <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
      {lastUpdated ? (
        <p className="mt-2 text-sm text-muted-foreground">Last updated: {lastUpdated}</p>
      ) : null}
      <div className="mt-stack flex flex-col gap-4 text-sm text-muted-foreground [&_h2]:mt-2 [&_h2]:font-heading [&_h2]:text-base [&_h2]:text-foreground [&_ul]:flex [&_ul]:list-disc [&_ul]:flex-col [&_ul]:gap-1 [&_ul]:pl-5">
        {children}
      </div>
    </div>
  );
}
