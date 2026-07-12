import { ArrowRight } from "lucide-react";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only marketing page walking the product surface feature by feature —
// the Harvey/Legora "platform" page in gitmatter's register. Each feature is a
// two-column row: plain-language copy on one side, a short looping product clip
// on the other. Clips are rendered from apps/video (the Remotion project that
// also produces the hero /demo.mp4) into /public/features/*.mp4.

function ClipFigure({ src, label }: { src: string; label: string }) {
  return (
    <figure className="m-0 overflow-hidden rounded-lg border border-border bg-card shadow-xs">
      <video
        className="aspect-[4/3] w-full"
        src={src}
        autoPlay
        muted
        loop
        playsInline
        preload="metadata"
        aria-label={label}
      />
    </figure>
  );
}

const FEATURES = [
  {
    tag: "Assistant",
    title: "Ask about the matter. Get answers with sources.",
    body: "Chat grounded in the matter's own documents. Every answer cites the exact passage it came from, so checking the AI takes one click, not a re-read. Runs on your firm's LLM key.",
    clip: "/features/assistant.mp4",
  },
  {
    tag: "Tabular review",
    title: "A hundred contracts. One pass.",
    body: "Ask the same questions of every document in a stack and get the answers back as a table. Each cell links to the spot it came from and to who ran it. The outliers surface themselves.",
    clip: "/features/review.mp4",
  },
  {
    tag: "Redline & drafting",
    title: "The first pass is done before you open the file.",
    body: "Mark up agreements against your own playbook. Suggestions land as tracked changes you accept, reject, or trace back — and drafts start from your templates, not a blank page.",
    clip: "/features/redline.mp4",
  },
  {
    tag: "Workflows",
    title: "Turn good process into a button.",
    body: "Capture review, extraction, and drafting as simple, repeatable steps. Run them on the next stack of documents, share them across the team, and stop re-explaining the same job.",
    clip: "/features/workflow.mp4",
  },
  {
    tag: "Clause library & playbooks",
    title: "Your standard positions, in one place.",
    body: "Approved clauses, fallbacks, and the playbooks the AI reviews against — shared across the firm, so every markup starts from the positions you've already decided on.",
    clip: "/features/library.mp4",
  },
  {
    tag: "Audit trail",
    title: "Every change is on the record.",
    body: "Person or AI, every edit is a commit with an author, a message, and the exact before and after. Open any clause and see how it got there. Read it, share it, or undo it.",
    clip: "/features/audit.mp4",
  },
  {
    tag: "Bring your own agent",
    title: "ChatGPT and Claude plug straight in.",
    body: "Connect the assistant your firm already pays for over MCP — no new chatbot, no second login. The agent drives gitmatter's tools; gitmatter records every step it takes.",
    clip: "/features/agent.mp4",
  },
];

// The quieter guarantees under the headline features.
const FOUNDATIONS = [
  {
    title: "Your own key",
    body: "Claude, Gemini, OpenAI, or OpenRouter — stored encrypted, set for zero data retention, never used to train anyone's model.",
  },
  {
    title: "Install it, or run on our cloud",
    body: "Set it up on your own computer or server in minutes, or skip the setup with a hosted walkthrough.",
  },
  {
    title: "Clients, matters, and teams",
    body: "Work is organized client → matter, staffed per matter, and every change traces to a member.",
  },
];

export default function Features() {
  return (
    <div className="flex flex-col">
      <header className="mx-auto flex max-w-3xl flex-col gap-stack px-6 pt-section pb-24 text-center">
        <Eyebrow>features</Eyebrow>
        <h1 className="font-heading text-4xl tracking-tight text-balance sm:text-5xl">
          Everything the work needs. Nothing off the record.
        </h1>
        <p className="mx-auto max-w-[56ch] text-lg leading-relaxed text-muted-foreground">
          Review, redline, extract, and draft with the AI your firm already trusts — every step
          saved with who did it, what changed, and when.
        </p>
      </header>

      <div className="mx-auto flex w-full max-w-7xl flex-col px-6">
        {FEATURES.map((f, i) => (
          <section
            key={f.tag}
            className="grid items-center gap-10 border-t border-border py-16 md:gap-16 lg:grid-cols-2"
          >
            <div className={`flex flex-col gap-3 ${i % 2 ? "lg:order-2" : ""}`}>
              <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">
                {f.tag}
              </span>
              <h2 className="max-w-[24ch] font-heading text-3xl tracking-tight text-balance">
                {f.title}
              </h2>
              <p className="max-w-[52ch] leading-relaxed text-muted-foreground">{f.body}</p>
            </div>
            <div className={`mx-auto w-full max-w-md ${i % 2 ? "lg:order-1" : ""}`}>
              <ClipFigure src={f.clip} label={`${f.tag} demo`} />
            </div>
          </section>
        ))}
      </div>

      <section className="border-y border-border bg-secondary/60">
        <div className="mx-auto max-w-7xl px-6 py-24">
          <Eyebrow>the foundations</Eyebrow>
          <h2 className="mt-stack max-w-[18ch] font-heading text-4xl tracking-tight text-balance">
            Built to be trusted.
          </h2>
          <div className="mt-12 grid gap-10 sm:grid-cols-3 md:gap-16">
            {FOUNDATIONS.map((p) => (
              <div key={p.title} className="flex flex-col gap-1 border-t border-border pt-4">
                <h3 className="font-heading text-lg tracking-tight">{p.title}</h3>
                <p className="text-sm leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            ))}
          </div>
          <a
            href={`${SITE.docs}/admin/self-hosting`}
            target="_blank"
            rel="noreferrer"
            className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-bronze"
          >
            Read the setup guide
            <ArrowRight className="size-4" />
          </a>
        </div>
      </section>

      <CTASection />
    </div>
  );
}
