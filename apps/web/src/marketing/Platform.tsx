import ProductVideo from "@/marketing/components/ProductVideo";
import { Link } from "@tanstack/react-router";
import { ArrowRight, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SITE } from "@/marketing/site";
import { FEATURES } from "@/marketing/catalog";
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
    body: "The record distinguishes the person or AI agent that acted. Check proposed changes and record your own review; an AI accepting an edit is not evidence of practitioner sign-off.",
  },
  {
    title: "Who changed this clause?",
    body: "The record says. Person or AI, each edit is saved with an author, a reason, and the exact before and after. Any clause's history is one click away.",
  },
  {
    title: "Where did the documents go?",
    body: "The selected AI route receives the content needed for the task. Its account terms, retention, processing locations, and intermediaries need to be checked separately from gitmatter's document storage.",
  },
];

const WORKS_WITH = {
  agents: ["ChatGPT", "Claude Desktop", "Claude web", "Claude Code", "Codex CLI"],
  providers: ["Anthropic Claude", "Google Gemini", "OpenAI", "OpenRouter"],
};

function MobileTableOfContents() {
  return (
    <aside className="mx-auto w-full max-w-7xl px-6 pt-6 lg:hidden">
      <details className="group rounded-lg border border-border bg-card">
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-sm font-medium [&::-webkit-details-marker]:hidden">
          On this page
          <ChevronDown className="size-4 text-muted-foreground transition-transform duration-150 group-open:rotate-180" />
        </summary>
        <nav aria-label="Table of contents" className="border-t border-border p-2 text-sm">
          <a href="#overview" className="block rounded-md px-3 py-2 hover:bg-muted">
            Overview
          </a>
          <a href="#why-gitmatter" className="block rounded-md px-3 py-2 hover:bg-muted">
            Why gitmatter
          </a>
          <a href="#platform-tools" className="block rounded-md px-3 py-2 hover:bg-muted">
            Platform tools
          </a>
          <div className="ml-3 border-l border-border py-1">
            {FEATURES.map((feature) => (
              <a
                key={feature.slug}
                href={`#${feature.slug}`}
                className="block rounded-md px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground"
              >
                {feature.tag}
              </a>
            ))}
          </div>
          <a href="#works-with" className="block rounded-md px-3 py-2 hover:bg-muted">
            Works with
          </a>
        </nav>
      </details>
    </aside>
  );
}

export default function Platform() {
  return (
    <div className="flex flex-col">
      {/* Hero: oversized statement left, positioning + CTA right, demo below. */}
      <header id="overview" className="mx-auto w-full max-w-7xl scroll-mt-20 px-6 pt-16">
        <div className="grid gap-10 py-10 lg:grid-cols-[1.2fr_1fr] lg:gap-16">
          <h1 className="max-w-[14ch] font-heading text-5xl tracking-tight text-balance sm:text-6xl">
            Review legal work. Keep every change.
          </h1>
          <div className="flex flex-col items-start gap-6 lg:pt-3">
            <p className="max-w-[46ch] text-lg leading-relaxed text-muted-foreground">
              Review, redline, extract, and draft with the AI your firm already trusts — every step
              saved with who did it, what changed, and when.
            </p>
            <Button
              size="lg"
              nativeButton={false}
              render={<a href={SITE.bookDemo} target="_blank" rel="noreferrer" />}
            >
              Book demo
            </Button>
          </div>
        </div>
        <ProductVideo
          src="/demo.mp4"
          poster="/demo-poster.png"
          label="gitmatter platform overview"
          className="aspect-video"
        />
      </header>

      <MobileTableOfContents />

      {/* Why gitmatter — three value cards, all verifiable. */}
      <section id="why-gitmatter" className="mx-auto w-full max-w-7xl scroll-mt-20 px-6 pt-24">
        <h2 className="mt-stack max-w-[22ch] font-heading text-4xl tracking-tight text-balance">
          Know who changed the work.
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
      <section id="platform-tools" className="mx-auto w-full max-w-7xl scroll-mt-20 px-6 pt-24">
        <h2 className="max-w-[24ch] font-heading text-4xl tracking-tight text-balance">
          {FEATURES.length} tools. A shared history.
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
              className={`grid scroll-mt-20 items-center gap-10 border-t border-border py-16 md:gap-16 ${f.clip ? "lg:grid-cols-2" : ""}`}
            >
              <div className={`flex flex-col gap-3 ${i % 2 ? "lg:order-2" : ""}`}>
                <h3 className="max-w-[24ch] font-heading text-3xl tracking-tight text-balance">
                  {f.title}
                </h3>
                <p className="max-w-[52ch] leading-relaxed text-muted-foreground">{f.body}</p>
                <Button
                  variant="outline"
                  size="sm"
                  nativeButton={false}
                  render={<Link to="/platform/$slug" params={{ slug: f.slug }} className="mt-2" />}
                >
                  Learn more
                </Button>
              </div>
              {f.clip ? (
                <div className={`mx-auto w-full max-w-md ${i % 2 ? "lg:order-1" : ""}`}>
                  <ClipFigure src={f.clip} label={`${f.tag} demo`} />
                </div>
              ) : null}
            </section>
          ))}
        </div>
      </section>

      {/* Works with the AI your team already uses. */}
      <section id="works-with" className="scroll-mt-20 border-y border-border bg-secondary/60">
        <div className="mx-auto max-w-7xl px-6 py-20">
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
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                {WORKS_WITH.agents.map((a) => (
                  <li key={a} className="text-sm text-ink-secondary">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
            <div className="flex flex-col gap-1 border-t border-border pt-4">
              <h3 className="font-heading text-lg tracking-tight">Run on your own key</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">
                gitmatter's own features use the selected provider account. Keys are encrypted;
                retention depends on that account's terms, settings, and agreements.
              </p>
              <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2">
                {WORKS_WITH.providers.map((p) => (
                  <li key={p} className="text-sm text-ink-secondary">
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
