// The "how" — the two ways a firm plugs its own AI in. This is the single home
// for bring-your-own-agent and bring-your-own-key; the agent card folds in both
// the chatbot users and the builders who wire it up over MCP.
const WAYS = [
  {
    tag: "Bring your own agent",
    title: "Use the AI you already have.",
    body: "Connect ChatGPT, Claude or your own tools over MCP. The assistant receives the tool results it requests, under its own service terms. Content changes made through gitmatter tools keep their author and history.",
  },
  {
    tag: "Bring your own key",
    title: "Run on your own key.",
    body: "Built-in AI uses your encrypted saved provider key, then a server key if configured. Choose a provider your firm has approved, and verify the selected model, account controls and agreement for its retention and training terms.",
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
