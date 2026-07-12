import { ArrowRight } from "lucide-react";
import { SITE } from "@/marketing/site";
import Eyebrow from "@/marketing/components/Eyebrow";
import CommitPanel from "@/marketing/components/CommitPanel";
import CTASection from "@/marketing/components/CTASection";

// Cloud-only marketing page walking the product surface feature by feature —
// the Harvey/Legora "platform" page in gitmatter's register. Each feature is a
// two-column row: plain-language copy on one side, a small code-drawn panel of
// the real UI shape on the other (the CommitPanel pattern). No screenshots to
// go stale; the figures are the product's own shapes.

// ---- figures: small product-shaped panels, one per feature ----

const panelClass = "overflow-hidden rounded-lg border border-border bg-card shadow-xs";
const panelHeadClass =
  "flex items-center justify-between border-b border-border px-4 py-2.5 text-xs text-muted-foreground";

function AssistantFigure() {
  return (
    <figure className={`m-0 ${panelClass}`}>
      <div className={panelHeadClass}>
        <span className="font-medium text-foreground">Acme Acquisition · Assistant</span>
        <span className="text-bronze">On your key</span>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 text-sm">
        <p className="self-end rounded-lg bg-secondary px-3 py-2">
          Does the NDA survive termination?
        </p>
        <div className="flex flex-col gap-2">
          <p className="leading-relaxed text-muted-foreground">
            Yes — confidentiality obligations survive for three years after termination.
          </p>
          <p className="flex flex-wrap gap-1.5 text-xs">
            <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
              NDA.docx §7.2
            </span>
            <span className="rounded border border-border px-1.5 py-0.5 text-muted-foreground">
              MSA §14.1
            </span>
          </p>
        </div>
      </div>
    </figure>
  );
}

const REVIEW_ROWS = [
  { doc: "acme-nda-038.docx", capped: "Yes", law: "Delaware", flagged: false },
  { doc: "acme-nda-039.docx", capped: "Yes", law: "Delaware", flagged: false },
  { doc: "acme-nda-040.docx", capped: "No", law: "Delaware", flagged: true },
  { doc: "acme-nda-041.docx", capped: "Yes", law: "New York", flagged: false },
];

function ReviewFigure() {
  return (
    <figure className={`m-0 ${panelClass}`}>
      <div className={panelHeadClass}>
        <span className="font-medium text-foreground">Contract review · 100 documents</span>
        <span className="text-destructive">3 flagged</span>
      </div>
      <div className="px-4 py-3 text-xs">
        <div className="grid grid-cols-[1.6fr_1fr_1fr] gap-2 pb-2 text-muted-foreground">
          <span>Document</span>
          <span>Indemnity capped?</span>
          <span>Governing law</span>
        </div>
        <ul className="divide-y divide-border text-sm">
          {REVIEW_ROWS.map((r) => (
            <li key={r.doc} className="grid grid-cols-[1.6fr_1fr_1fr] items-center gap-2 py-2">
              <span className="truncate">{r.doc}</span>
              <span className={r.flagged ? "font-medium text-destructive" : ""}>{r.capped}</span>
              <span className="text-muted-foreground">{r.law}</span>
            </li>
          ))}
        </ul>
      </div>
    </figure>
  );
}

function RedlineFigure() {
  return (
    <figure className={`m-0 ${panelClass}`}>
      <div className={panelHeadClass}>
        <span className="font-medium text-foreground">Services Agreement · §9 Liability</span>
        <span className="text-bronze">2 suggestions</span>
      </div>
      <p className="px-4 py-4 text-sm leading-7 text-muted-foreground">
        Liability under this Agreement is{" "}
        <span className="text-destructive line-through">unlimited</span>{" "}
        <span className="rounded bg-bronze/10 px-1 text-bronze">
          capped at fees paid in the prior 12 months
        </span>
        , except for breach of confidentiality. Either party may terminate on{" "}
        <span className="text-destructive line-through">10</span>{" "}
        <span className="rounded bg-bronze/10 px-1 text-bronze">30</span> days' written notice.
      </p>
    </figure>
  );
}

const WORKFLOW_STEPS = [
  "Pull indemnity, cap, and governing law into a table",
  "Redline off-playbook clauses",
  "Draft the summary memo",
];

function WorkflowFigure() {
  return (
    <figure className={`m-0 ${panelClass}`}>
      <div className={panelHeadClass}>
        <span className="font-medium text-foreground">Workflow · NDA intake</span>
        <span className="rounded bg-foreground px-2 py-0.5 font-medium text-background">Run</span>
      </div>
      <ol className="divide-y divide-border text-sm">
        {WORKFLOW_STEPS.map((s, i) => (
          <li key={s} className="flex items-center gap-3 px-4 py-3">
            <span className="font-heading text-lg text-bronze/60">0{i + 1}</span>
            <span className="text-muted-foreground">{s}</span>
          </li>
        ))}
      </ol>
    </figure>
  );
}

const CLAUSES = [
  { name: "Limitation of liability — mutual cap", status: "Approved" },
  { name: "Confidentiality — 3-year survival", status: "Approved" },
  { name: "Indemnity — fees-paid cap", status: "Fallback" },
];

function LibraryFigure() {
  return (
    <figure className={`m-0 ${panelClass}`}>
      <div className={panelHeadClass}>
        <span className="font-medium text-foreground">Clause library</span>
        <span className="text-bronze">Shared with the firm</span>
      </div>
      <ul className="divide-y divide-border text-sm">
        {CLAUSES.map((c) => (
          <li key={c.name} className="flex items-center justify-between gap-3 px-4 py-3">
            <span className="truncate">{c.name}</span>
            <span
              className={`shrink-0 rounded border px-1.5 py-0.5 text-xs ${
                c.status === "Approved"
                  ? "border-border text-muted-foreground"
                  : "border-bronze/40 text-bronze"
              }`}
            >
              {c.status}
            </span>
          </li>
        ))}
      </ul>
    </figure>
  );
}

function AgentFigure() {
  return (
    <figure className={`m-0 ${panelClass}`}>
      <div className={panelHeadClass}>
        <span className="font-medium text-foreground">Connected agents</span>
        <span className="text-bronze">Over MCP</span>
      </div>
      <div className="flex flex-col gap-3 px-4 py-4 text-sm">
        <div className="flex flex-wrap items-center gap-2">
          <span className="rounded border border-border px-2 py-1">ChatGPT</span>
          <span className="rounded border border-border px-2 py-1">Claude</span>
          <span className="text-muted-foreground">→</span>
          <span className="rounded bg-foreground px-2 py-1 font-medium text-background">
            gitmatter
          </span>
        </div>
        <p className="text-xs text-muted-foreground">
          The agent drives the tools. gitmatter does the work — and records every action.
        </p>
      </div>
    </figure>
  );
}

// ---- the features ----

const FEATURES = [
  {
    tag: "Assistant",
    title: "Ask about the matter. Get answers with sources.",
    body: "Chat grounded in the matter's own documents. Every answer cites the exact passage it came from, so checking the AI takes one click, not a re-read. Runs on your firm's LLM key.",
    figure: <AssistantFigure />,
  },
  {
    tag: "Tabular review",
    title: "A hundred contracts. One pass.",
    body: "Ask the same questions of every document in a stack and get the answers back as a table. Each cell links to the spot it came from and to who ran it. The outliers surface themselves.",
    figure: <ReviewFigure />,
  },
  {
    tag: "Redline & drafting",
    title: "The first pass is done before you open the file.",
    body: "Mark up agreements against your own playbook. Suggestions land as tracked changes you accept, reject, or trace back — and drafts start from your templates, not a blank page.",
    figure: <RedlineFigure />,
  },
  {
    tag: "Workflows",
    title: "Turn good process into a button.",
    body: "Capture review, extraction, and drafting as simple, repeatable steps. Run them on the next stack of documents, share them across the team, and stop re-explaining the same job.",
    figure: <WorkflowFigure />,
  },
  {
    tag: "Clause library & playbooks",
    title: "Your standard positions, in one place.",
    body: "Approved clauses, fallbacks, and the playbooks the AI reviews against — shared across the firm, so every markup starts from the positions you've already decided on.",
    figure: <LibraryFigure />,
  },
  {
    tag: "Audit trail",
    title: "Every change is on the record.",
    body: "Person or AI, every edit is a commit with an author, a message, and the exact before and after. Open any clause and see how it got there. Read it, share it, or undo it.",
    figure: <CommitPanel />,
  },
  {
    tag: "Bring your own agent",
    title: "ChatGPT and Claude plug straight in.",
    body: "Connect the assistant your firm already pays for over MCP — no new chatbot, no second login. The agent drives gitmatter's tools; gitmatter records every step it takes.",
    figure: <AgentFigure />,
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
            <div className={`mx-auto w-full max-w-md ${i % 2 ? "lg:order-1" : ""}`}>{f.figure}</div>
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
