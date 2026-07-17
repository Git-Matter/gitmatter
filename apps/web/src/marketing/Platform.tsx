import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import { FEATURES } from "@/marketing/catalog";
import Eyebrow from "@/marketing/components/Eyebrow";
import CTASection from "@/marketing/components/CTASection";
import ClipFigure from "@/marketing/components/ClipFigure";

// Cloud-only /platform index in the Harvey register: oversized hero with the
// product demo, a "why" band, the feature tour with per-feature child pages,
// and a works-with section. Copy states only what the product does.

// The three questions a firm actually asks before letting AI near a matter —
// answered plainly. Editorial register: quiet, declarative, no selling.
const WHY = [
  {
    title: "Who decided?",
    body: "A lawyer did. The AI makes the first pass — review, markup, extraction — and every suggestion waits for a named person's accept or reject. Nothing applies itself.",
  },
  {
    title: "Who changed this clause?",
    body: "The record says. Person or AI, each edit is saved with an author, a reason, and the exact before and after. Any clause's history is one click away.",
  },
  {
    title: "Where did the documents go?",
    body: "Through your own LLM account and back — Claude, Gemini, OpenAI, or OpenRouter, stored encrypted, set for zero data retention. Open source, self-hostable if a client requires it.",
  },
];

const WORKS_WITH = {
  agents: ["ChatGPT", "Claude Desktop", "Claude web", "Claude Code", "Codex CLI"],
  providers: ["Anthropic Claude", "Google Gemini", "OpenAI", "OpenRouter"],
};

export default function Platform() {
  return (
    <div className="flex flex-col">
      {/* Hero: oversized statement left, positioning + CTA right, demo below. */}
      <header className="mx-auto w-full max-w-7xl px-6 pt-16">
        <Eyebrow>platform overview</Eyebrow>
        <div className="grid gap-10 py-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <h1 className="max-w-[14ch] font-heading text-5xl tracking-tight text-balance sm:text-6xl">
            Everything the work needs. Nothing off the record.
          </h1>
          <div className="flex flex-col items-start gap-6 lg:pt-3">
            <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
              Review, redline, extract, and draft with the AI your firm already trusts — every step
              saved with who did it, what changed, and when.
            </p>
            <a href={SITE.bookDemo} target="_blank" rel="noreferrer">
              <Button size="lg">Book demo</Button>
            </a>
          </div>
        </div>
        <figure className="m-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
          <video
            className="aspect-video w-full"
            poster="/demo-poster.png"
            controls
            muted
            playsInline
            preload="metadata"
          >
            <source src="/demo.mp4" type="video/mp4" />
          </video>
        </figure>
      </header>

      {/* Why gitmatter — three value cards, all verifiable. */}
      <section className="mx-auto w-full max-w-7xl px-6 pt-24">
        <Eyebrow>why gitmatter</Eyebrow>
        <h2 className="mt-stack max-w-[22ch] font-heading text-4xl tracking-tight text-balance">
          The questions a firm asks first, answered by the system itself.
        </h2>
        <div className="mt-12 grid gap-10 sm:grid-cols-3 md:gap-16">
          {WHY.map((w) => (
            <div key={w.title} className="flex flex-col gap-2 border-t border-border pt-4">
              <h3 className="font-heading text-lg tracking-tight">{w.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{w.body}</p>
            </div>
          ))}
        </div>
      </section>

      {/* Feature tour — one platform, purpose-built tools. */}
      <section className="mx-auto w-full max-w-7xl px-6 pt-24">
        <h2 className="max-w-[24ch] font-heading text-4xl tracking-tight text-balance">
          Nine tools. One history underneath.
        </h2>
        <p className="mt-4 max-w-[52ch] leading-relaxed text-muted-foreground">
          Each tool does one job well. Research tools keep their queries, sources, and activity
          visible in the assistant session; the tools that change the matter write to the same
          record, so the work reads as one story no matter who — or what — did it.
        </p>
        <div className="mt-8 flex flex-col">
          {FEATURES.map((f, i) => (
            <section
              key={f.slug}
              id={f.slug}
              className="grid scroll-mt-20 items-center gap-10 border-t border-border py-16 md:gap-16 lg:grid-cols-2"
            >
              <div className={`flex flex-col gap-3 ${i % 2 ? "lg:order-2" : ""}`}>
                <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">
                  {f.tag}
                </span>
                <h3 className="max-w-[24ch] font-heading text-3xl tracking-tight text-balance">
                  {f.title}
                </h3>
                <p className="max-w-[52ch] leading-relaxed text-muted-foreground">{f.body}</p>
                <Link to="/platform/$slug" params={{ slug: f.slug }} className="mt-2">
                  <Button variant="outline" size="sm">
                    Learn more
                  </Button>
                </Link>
              </div>
              <div className={`mx-auto w-full max-w-md ${i % 2 ? "lg:order-1" : ""}`}>
                <ClipFigure src={f.clip} label={`${f.tag} demo`} />
              </div>
            </section>
          ))}
        </div>
      </section>

      {/* Works with the AI your team already uses. */}
      <section className="border-y border-border bg-secondary/60">
        <div className="mx-auto max-w-7xl px-6 py-20">
          <Eyebrow>works with</Eyebrow>
          <h2 className="mt-stack max-w-[22ch] font-heading text-4xl tracking-tight text-balance">
            The AI your team is already using.
          </h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-2 md:gap-16">
            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <h3 className="font-heading text-lg tracking-tight">Connect as an agent</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                Over MCP, with a secure sign-in — the agent drives gitmatter's tools and every
                action lands on the record.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {WORKS_WITH.agents.map((a) => (
                  <li
                    key={a}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <h3 className="font-heading text-lg tracking-tight">Run on your own key</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                gitmatter's own features run on the firm's LLM account — stored encrypted,
                configured for zero data retention.
              </p>
              <ul className="mt-4 flex flex-wrap gap-2">
                {WORKS_WITH.providers.map((p) => (
                  <li
                    key={p}
                    className="rounded-md border border-border bg-background px-3 py-1.5 text-sm"
                  >
                    {p}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <a
            href={`${SITE.docs}/ai-agents/connect-an-agent`}
            target="_blank"
            rel="noreferrer"
            className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-bronze"
          >
            Read the connection guide
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      <CTASection />
    </div>
  );
}
