import { SITE } from "@/marketing/site";

// Cloud-only marketing About page: what gitmatter is, that it's built in the
// open, and credit to mikeoss — the project it builds on.
export default function About() {
  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-section px-6 py-section">
      <header className="flex flex-col gap-stack">
        <span className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
          About
        </span>
        <h1 className="font-heading text-4xl tracking-tight text-balance">
          An audit spine under AI-assisted legal review.
        </h1>
        <p className="text-lg text-muted-foreground">
          gitmatter does contract redline, tabular extraction, document generation, and reusable
          workflows — and puts a git-style audit spine underneath. Every change, human or agent, is
          a commit with author, message, field-level diff, and blame, in one history.
        </p>
      </header>

      <section className="flex flex-col gap-stack">
        <h2 className="font-heading text-2xl tracking-tight">Built in the open</h2>
        <p className="text-muted-foreground">
          gitmatter is open source and self-hostable. Run the whole stack yourself with Docker,
          bring your own LLM key, and keep zero data retention. Any AI client your firm already uses
          can drive the same audited tools over MCP — your AI on the front, gitmatter's audited
          engine behind.
        </p>
        <p className="text-muted-foreground">
          The source lives on{" "}
          <a
            href={SITE.github}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            GitHub
          </a>
          .
        </p>
      </section>

      <section className="flex flex-col gap-stack">
        <h2 className="font-heading text-2xl tracking-tight">Credits</h2>
        <p className="text-muted-foreground">
          gitmatter is heavily inspired by{" "}
          <a
            href={SITE.mikeoss}
            target="_blank"
            rel="noreferrer"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            mikeoss
          </a>{" "}
          — the legal-document AI assistant whose review surfaces this project builds on. gitmatter
          adapts mikeoss's contract redline, tabular review, workflows, and chat, and ports several
          of its libraries. On top of that it adds the two things mikeoss does not have: a git-style
          audit spine, and agent connectivity in both directions over MCP. Full credit to mikeoss
          for the original product and approach.
        </p>
      </section>
    </div>
  );
}
