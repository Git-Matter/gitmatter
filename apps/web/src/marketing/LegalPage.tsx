import type { ReactNode } from "react";

// Shared shell for the DRAFT legal pages: a heading, a prominent draft notice,
// and prose styling for the body.
export function LegalPage({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mx-auto max-w-2xl px-6 py-section">
      <h1 className="font-heading text-3xl tracking-tight">{title}</h1>
      <p className="mt-stack rounded-md border border-bronze/40 bg-bronze-tint p-3 text-sm">
        <strong>Draft.</strong> Placeholder text pending review by counsel — not legally binding.
      </p>
      <div className="mt-stack flex flex-col gap-4 text-sm text-muted-foreground [&_h2]:mt-2 [&_h2]:font-heading [&_h2]:text-base [&_h2]:text-foreground">
        {children}
      </div>
    </div>
  );
}
