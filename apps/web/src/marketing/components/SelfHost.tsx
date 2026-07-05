import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";

// "Runs on your terms" band: warm editorial, full-bleed sunken paper with
// hairline rules — not a generic dark SaaS block. Plain language, no jargon.
// Two paths, each its own anchor: self-host the docs, or run on our cloud.
const POINTS: {
  title: string;
  body: string;
  cta: string;
  href?: string;
  to?: string;
}[] = [
  {
    title: "Install it yourself",
    body: "Set it up on your own computer or server in minutes. Nothing locked to one company's cloud.",
    cta: "Read the setup guide",
    href: `${SITE.docs}/admin/self-hosting`,
  },
  {
    title: "Run on our cloud",
    body: "Skip the setup and start with a hosted walkthrough. Your files are never kept or used to train anyone's model.",
    cta: "Book demo",
    href: SITE.bookDemo,
  },
];

const ctaClass =
  "mt-2 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-bronze";

export default function SelfHost() {
  return (
    <section className="border-y border-border bg-secondary/60">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <Eyebrow>runs on your terms</Eyebrow>
        <h2 className="mt-stack max-w-[18ch] font-heading text-4xl tracking-tight text-balance">
          Install it, or run on our cloud.
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-2 md:gap-16">
          {POINTS.map((p) => (
            <div key={p.title} className="flex flex-col gap-1 border-t border-border pt-4">
              <h3 className="font-heading text-lg tracking-tight">{p.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              {p.href ? (
                <a href={p.href} target="_blank" rel="noreferrer" className={ctaClass}>
                  {p.cta}
                  <ArrowRight className="size-4" />
                </a>
              ) : (
                <Link to={p.to} className={ctaClass}>
                  {p.cta}
                  <ArrowRight className="size-4" />
                </Link>
              )}
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
