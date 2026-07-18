import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import Eyebrow from "@/marketing/components/Eyebrow";

const GUIDES = [
  {
    to: "/legal-ai" as const,
    title: "Legal AI for contract work",
    body: "What legal AI can help a team do, and where a lawyer still needs to decide.",
  },
  {
    to: "/legal-ai-audit-trail" as const,
    title: "Legal AI with an audit trail",
    body: "Keep the author, reason, and exact before and after for every change.",
  },
  {
    to: "/self-hosted-legal-ai" as const,
    title: "Self-hosted legal AI",
    body: "Run the stack on infrastructure you control and use your own model account.",
  },
];

export default function LegalAiCategory() {
  return (
    <section className="border-y border-border bg-secondary/60">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <Eyebrow>legal AI, explained</Eyebrow>
        <div className="mt-stack grid gap-8 lg:grid-cols-[1fr_1.2fr] lg:gap-20">
          <div>
            <h2 className="max-w-[15ch] font-heading text-4xl tracking-tight text-balance sm:text-5xl">
              Legal AI for work a team can check.
            </h2>
          </div>
          <p className="max-w-[55ch] text-lg leading-relaxed text-muted-foreground">
            gitmatter helps legal teams review, redline, extract, draft, and research contract work
            with AI. It is built for the part that follows the first answer: checking the source,
            making the decision, and keeping a record of what changed.
          </p>
        </div>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {GUIDES.map((guide) => (
            <Link
              key={guide.to}
              to={guide.to}
              className="group flex flex-col gap-3 rounded-lg border border-border bg-background p-5 transition-colors hover:border-bronze"
            >
              <span className="inline-flex items-center gap-1.5 font-heading text-xl tracking-tight">
                {guide.title}
                <ArrowRight className="size-4 text-bronze transition-transform group-hover:translate-x-0.5" />
              </span>
              <span className="text-sm leading-relaxed text-muted-foreground">{guide.body}</span>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}
