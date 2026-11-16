import ComparePage, { type CompareRow } from "@/marketing/components/ComparePage";

// Cloud-only comparison for "legalon alternative" intent. LegalOn leads on
// pre-built attorney-written playbooks for fast in-house review; gitmatter leads
// on the audit spine, bring-your-own-agent/key, and open source. Facts reflect
// public positioning as of mid-2026.
const ROWS: CompareRow[] = [
  { point: "Contract review, redline, and drafting", gitmatter: true, them: true },
  { point: "Matter management", gitmatter: true, them: true },
  {
    point: "Pre-built attorney-written playbooks",
    gitmatter: false,
    them: true,
    note: "50+ playbooks, 10,000+ legal issues",
  },
  {
    point: "Native Microsoft Word add-in",
    gitmatter: false,
    them: true,
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
  { point: "Transparent pricing, no seat minimum", gitmatter: true, them: false },
];

export default function CompareLegalon() {
  return (
    <ComparePage
      competitor="LegalOn"
      eyebrow="legalon alternative"
      title="How gitmatter compares to LegalOn."
      intro={
        <>
          LegalOn ships pre-built, attorney-written playbooks covering thousands of legal issues —
          fast in-house contract review out of the box. gitmatter takes a different angle: an
          auditable backend your own AI agent drives, on your own key, that you can run yourself.
        </>
      }
      rows={ROWS}
      pickThemTitle="Pick LegalOn when"
      pickThemBody="You want pre-built, attorney-written playbooks covering thousands of legal issues for fast in-house contract review without configuration."
      pickUsBody="You want every change on the record, your own AI agent driving the work over MCP, your own LLM key, and the option to run it all on your own server."
    />
  );
}
