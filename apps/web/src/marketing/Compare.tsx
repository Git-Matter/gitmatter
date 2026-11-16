import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only hub for the comparison pages. Each entry is an honest one-liner on
// where that competitor leads, linking to the full side-by-side.
const COMPARISONS = [
  {
    to: "/compare/harvey" as const,
    name: "Harvey",
    blurb: "Enterprise suite with deep legal research and data-room-scale review.",
  },
  {
    to: "/compare/spellbook" as const,
    name: "Spellbook",
    blurb: "In-Word drafting and redlining with clause benchmarking.",
  },
  {
    to: "/compare/legalon" as const,
    name: "LegalOn",
    blurb: "Pre-built attorney-written playbooks for fast in-house review.",
  },
  {
    to: "/compare/legalfly" as const,
    name: "LegalFly",
    blurb: "Agentic review with automatic anonymisation and an on-prem option.",
  },
  {
    to: "/compare/gitlaw" as const,
    name: "git.law",
    blurb: "All-in-one drafting and eSign for startups and SMEs.",
  },
];

export default function Compare() {
  return (
    <div className="flex flex-col">
      <header className="mx-auto flex max-w-3xl flex-col gap-stack px-6 pt-section pb-24 text-center">
        <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-5xl">
          How gitmatter compares.
        </h1>
        <p className="mx-auto max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
          Honest side-by-sides with the legal AI tools firms shortlist most. Where each one leads,
          and where gitmatter's audit spine, bring-your-own-agent, and open source change the
          answer.
        </p>
      </header>

      <div className="mx-auto grid max-w-7xl gap-6 px-6 pb-24 sm:grid-cols-2">
        {COMPARISONS.map((c) => (
          <Link
            key={c.to}
            to={c.to}
            className="group flex flex-col gap-2 border-t border-border py-6 hover:text-ink-secondary"
          >
            <span className="inline-flex items-center gap-1.5 font-heading text-xl tracking-tight">
              gitmatter vs {c.name}
              <ArrowRight className="size-4 text-bronze transition-transform group-hover:translate-x-0.5" />
            </span>
            <p className="leading-relaxed text-muted-foreground">{c.blurb}</p>
          </Link>
        ))}
      </div>

      <CTASection />
    </div>
  );
}
