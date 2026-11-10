import Eyebrow from "@/marketing/components/Eyebrow";

// The "how" — the two ways a firm plugs its own AI in. This is the single home
// for bring-your-own-agent and bring-your-own-key; the agent card folds in both
// the chatbot users and the builders who wire it up over MCP.
const WAYS = [
  {
    tag: "Bring your own agent",
    title: "Use the AI you already have.",
    body: "Connect your practice's approved ChatGPT or Claude account over MCP. Your assistant can work with gitmatter's tools, and gitmatter records its actions here. Conversations held in that assistant remain subject to its own account terms and settings.",
  },
  {
    tag: "Bring your own key",
    title: "Run on your own key.",
    body: "Use gitmatter's built-in assistant and review features with your configured AI-provider API account. Keys are encrypted at rest. Provider retention, processing locations, and any zero-retention agreement must be checked for your account; supplying a key does not establish them.",
  },
];

export default function BringYourOwn() {
  return (
    <section className="mx-auto max-w-7xl px-6 py-24">
      <Eyebrow>how it plugs in</Eyebrow>
      <h2 className="mt-stack max-w-[22ch] font-heading text-3xl tracking-tight text-balance sm:text-4xl">
        Your agent. Your key.
      </h2>
      <div className="mt-12 grid gap-12 sm:grid-cols-2 md:gap-16">
        {WAYS.map((w) => (
          <div key={w.tag} className="flex flex-col gap-3 border-t border-border pt-6">
            <span className="text-xs font-medium tracking-[0.2em] text-bronze uppercase">
              {w.tag}
            </span>
            <h3 className="font-heading text-xl tracking-tight">{w.title}</h3>
            <p className="leading-relaxed text-muted-foreground">{w.body}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
