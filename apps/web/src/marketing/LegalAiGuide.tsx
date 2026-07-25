import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import CTASection from "@/marketing/components/CTASection";
import Eyebrow from "@/marketing/components/Eyebrow";
import { AUDIT_TRAIL_GUIDE, LEGAL_AI_GUIDE, SELF_HOSTED_GUIDE } from "@/marketing/legalAiGuides";

export type LegalAiGuideContent = {
  eyebrow: string;
  title: string;
  lead: string;
  explanation: string;
  checks: { title: string; body: string }[];
  related: { to: "/legal-ai" | "/legal-ai-audit-trail" | "/self-hosted-legal-ai"; title: string }[];
};

const GUIDES = {
  "legal-ai": LEGAL_AI_GUIDE,
  "legal-ai-audit-trail": AUDIT_TRAIL_GUIDE,
  "self-hosted-legal-ai": SELF_HOSTED_GUIDE,
};

export type LegalAiGuideProps = { guide: keyof typeof GUIDES };

export default function LegalAiGuide({ guide }: LegalAiGuideProps) {
  const content = GUIDES[guide];
  return (
    <div className="flex flex-col">
      <header className="mx-auto w-full max-w-3xl px-6 pt-section pb-20">
        <Eyebrow>{content.eyebrow}</Eyebrow>
        <h1 className="mt-stack max-w-[18ch] font-heading text-4xl tracking-tight text-balance sm:text-5xl">
          {content.title}
        </h1>
        <p className="mt-stack max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
          {content.lead}
        </p>
      </header>

      <section className="border-y border-border bg-secondary/60">
        <div className="mx-auto max-w-3xl px-6 py-16">
          <h2 className="max-w-[22ch] font-heading text-3xl tracking-tight text-balance">
            The practical standard
          </h2>
          <p className="mt-stack max-w-[60ch] leading-relaxed text-muted-foreground">
            {content.explanation}
          </p>
        </div>
      </section>

      <section className="mx-auto w-full max-w-3xl px-6 py-20">
        <Eyebrow>what to check</Eyebrow>
        <h2 className="mt-stack max-w-[22ch] font-heading text-3xl tracking-tight text-balance">
          Before relying on legal AI output.
        </h2>
        <div className="mt-10 flex flex-col">
          {content.checks.map((check, index) => (
            <div
              key={check.title}
              className={`grid gap-4 py-6 sm:grid-cols-[auto_1fr] sm:gap-8 ${index ? "border-t border-border" : ""}`}
            >
              <span className="font-heading text-2xl text-bronze/60">0{index + 1}</span>
              <div>
                <h3 className="font-heading text-xl tracking-tight">{check.title}</h3>
                <p className="mt-2 leading-relaxed text-muted-foreground">{check.body}</p>
              </div>
            </div>
          ))}
        </div>
      </section>

      <section className="border-t border-border">
        <div className="mx-auto w-full max-w-3xl px-6 py-16">
          <Eyebrow>keep reading</Eyebrow>
          <div className="mt-6 grid gap-3 sm:grid-cols-2">
            {content.related.map((guide) => (
              <Link
                key={guide.to}
                to={guide.to}
                className="group inline-flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm font-medium hover:border-bronze"
              >
                {guide.title}
                <ArrowRight className="size-4 text-bronze transition-transform group-hover:translate-x-0.5" />
              </Link>
            ))}
            <Link
              to="/platform"
              className="group inline-flex items-center justify-between gap-3 rounded-lg border border-border px-4 py-3 text-sm font-medium hover:border-bronze"
            >
              Explore the platform
              <ArrowRight className="size-4 text-bronze transition-transform group-hover:translate-x-0.5" />
            </Link>
          </div>
        </div>
      </section>

      <CTASection />
    </div>
  );
}
