import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";
import Eyebrow from "@/marketing/components/Eyebrow";

// The trust band. Harvey shows certification badges here; we show the
// guarantees that are true of gitmatter today, each verifiable in the product
// or the code. When real certifications land, they join this grid.
const GUARANTEES = [
  {
    title: "Encrypted LLM keys",
    body: "Your provider key is stored encrypted, never logged, never sent to the browser.",
  },
  {
    title: "Zero data retention",
    body: "AI runs on your own provider account, configured so nothing is kept or used for training.",
  },
  {
    title: "Field-level audit trail",
    body: "Every change carries an author, a reason, and the exact before and after. No write path around it.",
  },
  {
    title: "Scoped agent access",
    body: "A connected AI acts as the member who connected it — that member's matters, nothing more.",
  },
  {
    title: "Open source",
    body: "The code is public. Your security team can read exactly what happens to client documents.",
  },
  {
    title: "Self-hostable",
    body: "Run the whole system on your own infrastructure when a client or policy requires it.",
  },
];

export default function TrustBand() {
  return (
    <section className="border-y border-border bg-secondary/60">
      <div className="mx-auto max-w-7xl px-6 py-24">
        <Eyebrow>security &amp; control</Eyebrow>
        <h2 className="mt-stack max-w-[22ch] font-heading text-4xl tracking-tight text-balance">
          Guarantees you can check, not badges to take on faith.
        </h2>
        <div className="mt-12 grid gap-x-10 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
          {GUARANTEES.map((g) => (
            <div key={g.title} className="flex flex-col gap-1.5 border-t border-border pt-4">
              <h3 className="font-heading text-lg tracking-tight">{g.title}</h3>
              <p className="text-sm leading-relaxed text-muted-foreground">{g.body}</p>
            </div>
          ))}
        </div>
        <Link
          to="/security"
          className="mt-10 inline-flex items-center gap-1.5 text-sm font-medium text-foreground hover:text-bronze"
        >
          Read the security page
          <ArrowRight className="size-4" />
        </Link>
      </div>
    </section>
  );
}
