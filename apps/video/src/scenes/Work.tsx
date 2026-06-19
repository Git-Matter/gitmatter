import { AbsoluteFill } from "remotion";
import { theme, fonts } from "../theme";
import { Eyebrow, Rise } from "../components";

// Step two — the agent drives gitmatter's tools. Compressed to a fast montage:
// a lawyer doesn't buy on watching the plumbing, so the calls fly in quickly and
// the scene hands its time to the Finding and the Record.
const steps = [
  { name: "gitmatter.open_matter", note: "Acme Corp · Delaware" },
  { name: "gitmatter.add_documents", note: "3 NDAs ingested" },
  { name: "gitmatter.review_documents", note: "clause-by-clause" },
  { name: "gitmatter.flag_clauses", note: "1 issue found" },
];

export const Work: React.FC = () => (
  <AbsoluteFill
    style={{ backgroundColor: theme.ink, padding: 96, flexDirection: "column", gap: 30 }}
  >
    <Rise at={4}>
      <Eyebrow>step two · the work</Eyebrow>
    </Rise>
    <Rise at={12}>
      <div style={{ fontFamily: fonts.heading, fontSize: 40, color: theme.text }}>
        The agent drives gitmatter's tools.
      </div>
    </Rise>
    <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 16 }}>
      {steps.map((s, i) => (
        <Rise key={s.name} at={10 + i * 8} dur={10}>
          <StepRow {...s} />
        </Rise>
      ))}
    </div>
    <Rise at={52} style={{ marginTop: 20 }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 20, color: theme.muted }}>
        running on the firm's own key · zero data retention
      </div>
    </Rise>
  </AbsoluteFill>
);

const StepRow: React.FC<{ name: string; note: string }> = ({ name, note }) => (
  <div
    style={{
      display: "flex",
      alignItems: "center",
      gap: 18,
      backgroundColor: theme.panel,
      border: `1px solid ${theme.border}`,
      borderRadius: 12,
      padding: "18px 24px",
    }}
  >
    <span style={{ color: theme.green, fontFamily: fonts.mono, fontSize: 22 }}>✓</span>
    <span style={{ fontFamily: fonts.mono, fontSize: 24, color: theme.text }}>{name}</span>
    <span style={{ marginLeft: "auto", fontFamily: fonts.mono, fontSize: 18, color: theme.muted }}>
      {note}
    </span>
  </div>
);
