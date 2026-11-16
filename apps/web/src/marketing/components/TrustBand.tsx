import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

// Describe current controls without implying certification or provider guarantees.
const GUARANTEES = [
  {
    title: "Encrypted LLM keys",
    body: "Your provider key is stored encrypted, never logged, never sent to the browser.",
  },
  {
    title: "Provider retention controls",
    body: "AI runs on your provider account, with zero-data-retention handling where supported. Review your provider's settings and terms.",
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
    <section className="bg-secondary">
      <div className="page-container py-band">
        <h2 className="max-w-[24ch] text-section">Check how your work is handled.</h2>
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
