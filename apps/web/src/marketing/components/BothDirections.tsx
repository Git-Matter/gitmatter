import Eyebrow from "@/marketing/components/Eyebrow";

// The thesis: gitmatter builds on mike with connectivity in BOTH directions.
// Inbound (MCP): outside agents drive our audited tools. Outbound (SDK): our
// engine runs on the firm's own key. Two clean columns — no boxes.
const FLOWS = [
  {
    tag: "Inbound",
    title: "Your agent drives our tools.",
    body: "Any AI client your firm already uses connects over MCP and drives gitmatter's review, extraction, and drafting — every action recorded as a commit.",
  },
  {
    tag: "Outbound",
    title: "Our engine runs on your key.",
    body: "gitmatter's own features call out to the firm's LLM key — multi-provider, encrypted, zero data retention. Your AI on the front, our audited engine behind.",
  },
];

export default function BothDirections() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <Eyebrow>connectivity, both directions</Eyebrow>
      <h2 className="mt-stack max-w-[22ch] font-heading text-3xl tracking-tight text-balance sm:text-4xl">
        We build on mike — and wire it up both ways.
      </h2>
      <div className="mt-12 grid gap-12 sm:grid-cols-2 md:gap-16">
        {FLOWS.map((f) => (
          <div key={f.tag} className="flex flex-col gap-3 border-t border-border pt-6">
            <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">
              {f.tag}
            </span>
            <h3 className="font-heading text-xl tracking-tight">{f.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{f.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
