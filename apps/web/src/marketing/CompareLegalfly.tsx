import ComparePage, { type CompareRow } from "@/marketing/components/ComparePage";

// Cloud-only comparison for "legalfly alternative" intent. LegalFly is the
// closest in shape — agentic, LLM-agnostic, on-prem option — and leads on
// automatic anonymisation and regulatory horizon scanning. gitmatter's edge is the
// git-style audit spine, bring-your-own-agent over MCP, and open source. Facts
// reflect public positioning as of mid-2026.
const ROWS: CompareRow[] = [
  {
    point: "Agentic contract review and auto-redlining",
    gitmatter: true,
    them: true,
  },
  { point: "On-premises / self-host option", gitmatter: true, them: true },
  {
    point: "LLM-agnostic — multiple model providers",
    gitmatter: true,
    them: true,
  },
  {
    point: "Automatic anonymisation of personal data before processing",
    gitmatter: false,
    them: true,
    note: "built into LegalFly",
  },
  {
    point: "Legal research — US case law and Australian IP search",
    gitmatter: true,
    them: true,
  },
  {
    point: "Regulatory horizon scanning",
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
  { point: "Open source", gitmatter: true, them: false },
];

export default function CompareLegalfly() {
  return (
    <ComparePage
      competitor="LegalFly"
      eyebrow="legalfly alternative"
      title="How gitmatter compares to LegalFly."
      intro={
        <>
          LegalFly is close in shape — agentic, LLM-agnostic, with an on-prem option — and leads on
          automatic anonymisation and regulatory scanning. Both products offer legal research;
          gitmatter provides US case law and Australian IP search through jurisdiction-gated tools.
          gitmatter's edge is the audit spine, driving the work from your own AI agent over MCP, and
          being open source.
        </>
      }
      rows={ROWS}
      pickThemTitle="Pick LegalFly when"
      pickThemBody="You need automatic anonymisation of personal data before processing, plus regulatory scanning in a European-built platform."
      pickUsBody="You want every change on the record, your own AI agent driving the work over MCP, and a fully open-source backend you can run yourself."
    />
  );
}
