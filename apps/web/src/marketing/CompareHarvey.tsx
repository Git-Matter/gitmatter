import ComparePage, { type CompareRow } from "@/marketing/components/ComparePage";

// Cloud-only comparison page for "harvey ai alternative" intent. Honest and
// two-sided: Harvey is a strong, mature enterprise suite (research, data-room
// review, deep integrations). gitmatter is a different shape — an auditable
// backend your own agent drives, on your own key, open source. Harvey facts
// reflect its public positioning as of mid-2026; verify current terms.
const ROWS: CompareRow[] = [
  {
    point: "Contract redline, extraction, and drafting",
    gitmatter: true,
    them: true,
  },
  { point: "Reusable multi-step workflows", gitmatter: true, them: true },
  {
    point: "Multiple model providers — Claude, Gemini, OpenAI",
    gitmatter: true,
    them: true,
  },
  {
    point: "Legal research — US case law and Australian IP search",
    gitmatter: true,
    them: true,
    note: "Jurisdiction-gated research tools",
  },
  {
    point: "Bulk M&A due diligence at data-room scale",
    gitmatter: false,
    them: true,
    note: "Harvey Vault",
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
    point: "Bring your own LLM key — your provider contract, encrypted",
    gitmatter: true,
    them: false,
  },
  {
    point: "Open source — self-host on your own server",
    gitmatter: true,
    them: false,
  },
  {
    point: "Transparent pricing, no per-seat minimum",
    gitmatter: true,
    them: false,
  },
];

export default function CompareHarvey() {
  return (
    <ComparePage
      competitor="Harvey"
      eyebrow="harvey ai alternative"
      title="How gitmatter compares to Harvey."
      intro={
        <>
          Harvey is a strong, mature suite for large firms — data-room-scale review and enterprise
          integrations. Both products offer legal research; gitmatter provides US case law and
          Australian IP search through jurisdiction-gated tools. gitmatter is a different shape: an
          auditable backend your own AI agent drives, on your own key, that you can run yourself.
          Here is the honest side-by-side.
        </>
      }
      rows={ROWS}
      pickThemTitle="Pick Harvey when"
      pickThemBody="You need broad regulatory research, or bulk M&A due diligence across large data rooms, backed by enterprise integrations."
      pickUsBody="You want every change on the record, your own AI agent driving the work over MCP, your own LLM key, and the option to run it all on your own server."
    />
  );
}
