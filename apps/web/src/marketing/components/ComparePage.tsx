import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Minus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";
import CTASection from "@/marketing/components/CTASection";

// One row of the capability table. `them` is the competitor's column. `note`
// adds a small product-name hint, e.g. "(Harvey Vault)".
export type CompareRow = { point: string; gitmatter: boolean; them: boolean; note?: string };

// Shared layout for every "/compare/<competitor>" marketing page. Pages supply
// only the competitor name and the honest, two-sided data; the chrome (header,
// table, pick-when blocks, CTA) lives here so the pages stay copy-only and the
// comparison format never drifts between competitors.
export default function ComparePage(props: {
  competitor: string;
  eyebrow: string;
  title: string;
  intro: ReactNode;
  rows: CompareRow[];
  pickThemTitle: string;
  pickThemBody: ReactNode;
  pickUsBody: ReactNode;
}) {
  return (
    <div className="flex flex-col">
      <header className="mx-auto flex max-w-3xl flex-col gap-stack px-6 pt-section pb-24 text-center">
        <Eyebrow>{props.eyebrow}</Eyebrow>
        <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-5xl">
          {props.title}
        </h1>
        <p className="mx-auto max-w-[58ch] text-lg leading-relaxed text-muted-foreground">
          {props.intro}
        </p>
      </header>

      <section className="mx-auto w-full max-w-3xl px-6 pb-24">
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-left text-sm">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="px-4 py-3 font-medium">Capability</th>
                <th className="px-4 py-3 text-center font-medium">gitmatter</th>
                <th className="px-4 py-3 text-center font-medium text-muted-foreground">
                  {props.competitor}
                </th>
              </tr>
            </thead>
            <tbody>
              {props.rows.map((r) => (
                <tr key={r.point} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 text-muted-foreground">
                    {r.point}
                    {r.note ? (
                      <span className="ml-1.5 text-xs text-muted-foreground/60">({r.note})</span>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Cell on={r.gitmatter} />
                  </td>
                  <td className="px-4 py-3 text-center">
                    <Cell on={r.them} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="mt-4 text-xs text-muted-foreground/70">
          {props.competitor} details reflect public positioning as of mid-2026 and may change. Check
          each vendor's current terms before deciding.
        </p>

        <div className="mt-section grid gap-8 sm:grid-cols-2">
          <div className="flex flex-col gap-2 border-t border-border pt-6">
            <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">
              {props.pickThemTitle}
            </span>
            <p className="leading-relaxed text-muted-foreground">{props.pickThemBody}</p>
          </div>
          <div className="flex flex-col gap-2 border-t border-border pt-6">
            <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">
              Pick gitmatter when
            </span>
            <p className="leading-relaxed text-muted-foreground">{props.pickUsBody}</p>
          </div>
        </div>

        <div className="mt-section flex flex-wrap items-center gap-3">
          <Link to="/solutions">
            <Button>See the solutions</Button>
          </Link>
          <a href={SITE.docs}>
            <Button variant="outline">Read docs</Button>
          </a>
        </div>
      </section>

      <CTASection />
    </div>
  );
}

function Cell({ on }: { on: boolean }) {
  return on ? (
    <Check className="mx-auto size-4 text-bronze" aria-label="yes" />
  ) : (
    <Minus className="mx-auto size-4 text-muted-foreground/40" aria-label="no" />
  );
}
