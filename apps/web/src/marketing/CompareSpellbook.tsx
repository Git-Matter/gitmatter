import ComparePage, { type CompareRow } from "@/marketing/components/ComparePage";

// Cloud-only comparison for "spellbook alternative" intent. Spellbook leads on
// in-Word drafting and clause benchmarking; gitmatter leads on the audit spine,
// bring-your-own-agent/key, and open source. Facts reflect public positioning
// as of mid-2026.
const ROWS: CompareRow[] = [
  { point: "Contract redline, review, and drafting", gitmatter: true, them: true },
  {
    point: "Native Microsoft Word add-in",
    gitmatter: false,
    them: true,
    note: "Spellbook works inside Word",
  },
  {
    point: "Clause benchmarking across a large contract library",
    gitmatter: false,
    them: true,
    note: "2,300+ contract types",
  },
  {
    point: "Audit trail — author, message, diff, blame per change",
    gitmatter: true,
    them: false,
  },
  {
    point: "Bring your own agent — drive it from ChatGPT or Claude over MCP",
    gitmatter: true,
    them: false,
  },
  {
    point: "Bring your own LLM key — Claude, Gemini, OpenAI, OpenRouter",
    gitmatter: true,
    them: false,
  },
  { point: "Open source — self-host on your own server", gitmatter: true, them: false },
];

export default function CompareSpellbook() {
  return (
    <ComparePage
      competitor="Spellbook"
      eyebrow="spellbook alternative"
      title="How gitmatter compares to Spellbook."
      intro={
        <>
          Spellbook lives inside Microsoft Word, where many lawyers draft and redline, with clause
          benchmarking against a large contract library. gitmatter takes a different angle: an
          auditable backend your own AI agent drives, on your own key, that you can run yourself.
        </>
      }
      rows={ROWS}
      pickThemTitle="Pick Spellbook when"
      pickThemBody="You draft and redline primarily inside Microsoft Word and want clause benchmarking against a large library of contract types."
      pickUsBody="You want every change on the record, your own AI agent driving the work over MCP, your own LLM key, and the option to run it all on your own server."
    />
  );
}
