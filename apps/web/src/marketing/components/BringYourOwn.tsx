// The "how" — the two ways a firm plugs its own AI in. This is the single home
// for bring-your-own-agent and bring-your-own-key; the agent card folds in both
// the chatbot users and the builders who wire it up over MCP.
const WAYS = [
  {
    tag: "Bring your own agent",
    title: "Use the AI you already have.",
    body: "Connect the assistant your firm already pays for — ChatGPT or Claude, nothing to learn. Builders can wire their own tools in over MCP. Either way it drives gitmatter, and gitmatter records every step.",
  },
  {
    tag: "Bring your own key",
    title: "Run on your own key.",
    body: "gitmatter's own features run on your AI key, stored encrypted and set for zero data retention. Pick the provider you trust — your data stays yours.",
  },
];

export default function BringYourOwn() {
  return (
    <section className="page-container py-band">
      <h2 className="max-w-[22ch] text-section">Your agent. Your key.</h2>
      <div className="mt-12 grid gap-12 sm:grid-cols-2 md:gap-16">
        {WAYS.map((w) => (
          <div key={w.tag} className="flex flex-col gap-3 border-t border-border pt-6">
            <h3 className="font-heading text-xl tracking-tight">{w.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{w.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
