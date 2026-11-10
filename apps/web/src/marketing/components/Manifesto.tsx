import Eyebrow from "@/marketing/components/Eyebrow";

// The control thesis. Left-rail label + a right stack of three pillars — a
// distinct layout from the full-width sections, so hierarchy reads at a glance.
// No boxes; hairline rules and big serif numerals carry the rhythm.
const POINTS = [
  {
    n: "01",
    title: "Start with the file",
    body: "Bring the source documents together on a matter. Prepare a briefing that separates supported facts from missing information and questions for your judgment.",
  },
  {
    n: "02",
    title: "Prepare work you can check",
    body: "Review an agreement or draft a client update using repeatable instructions. Check each source and proposed change before using the output.",
  },
  {
    n: "03",
    title: "Return to a clear record",
    body: "See the changes made in gitmatter, who made them, and the before and after. AI actions remain distinguishable from a practitioner's own review.",
  },
];

export default function Manifesto() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-32">
      <div className="grid gap-section lg:grid-cols-[0.6fr_1.4fr] lg:gap-24">
        <div className="flex flex-col gap-stack lg:sticky lg:top-24 lg:self-start">
          <Eyebrow>why firms choose it</Eyebrow>
          <h2 className="max-w-[14ch] font-heading text-4xl tracking-tight text-balance">
            From the file to your next piece of work.
          </h2>
        </div>
        <div className="flex flex-col">
          {POINTS.map((p, i) => (
            <div
              key={p.n}
              className={`grid gap-4 py-8 sm:grid-cols-[auto_1fr] sm:gap-8 ${i > 0 ? "border-t border-border" : ""}`}
            >
              <span className="font-heading text-3xl text-bronze/60">{p.n}</span>
              <div className="flex flex-col gap-2">
                <h3 className="font-heading text-2xl tracking-tight">{p.title}</h3>
                <p className="max-w-[52ch] leading-relaxed text-muted-foreground">{p.body}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
