import Eyebrow from "@/marketing/components/Eyebrow";

// Three differentiators, calm. No boxes — whitespace separates, big serif
// numerals carry the hierarchy. Shorter copy than a feature dump.
const POINTS = [
  {
    n: "01",
    title: "Bring your own agent",
    body: "Connect the AI client your firm already uses over MCP. It drives gitmatter's tools; every action is recorded.",
  },
  {
    n: "02",
    title: "Bring your own key",
    body: "Runs on your firm's LLM key — Claude, Gemini, OpenAI, OpenRouter — encrypted, zero data retention.",
  },
  {
    n: "03",
    title: "Built for how firms work",
    body: "Client → Matter → artifacts, a team per matter, every change traceable to a member.",
  },
];

export default function Manifesto() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <Eyebrow>what makes it different</Eyebrow>
      <div className="mt-12 grid gap-12 md:grid-cols-3 md:gap-16">
        {POINTS.map((p) => (
          <div key={p.n} className="flex flex-col gap-3">
            <span className="font-heading text-3xl text-bronze/60">{p.n}</span>
            <h3 className="font-heading text-2xl tracking-tight">{p.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{p.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
