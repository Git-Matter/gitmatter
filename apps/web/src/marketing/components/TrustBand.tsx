import { Link } from "@tanstack/react-router";
import { ArrowRight } from "lucide-react";

// Describe current controls without implying certification or provider guarantees.
const GUARANTEES = [
  {
    title: "Encrypted LLM keys",
    body: "Saved provider keys are encrypted with AES-256-GCM. Settings shows their configured status, not their saved values.",
  },
  {
    title: "Provider data handling",
    body: "OpenAI requests disable response storage; OpenRouter requests filter data collection. Retention also depends on the service, model, account controls and agreement.",
  },
  {
    title: "Field-level audit trail",
    body: "Legal content changes through the shared engine keep their author, reason, and exact before and after.",
  },
  {
    title: "Scoped agent access",
    body: "A connected agent's authority is limited by current member permissions, selected matters and the token's role.",
  },
  {
    title: "Open source",
    body: "The code is public. Your security team can read exactly what happens to client documents.",
  },
  {
    title: "Self-hostable",
    body: "Host gitmatter on your infrastructure and configure storage, model providers and connected services for your deployment.",
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
