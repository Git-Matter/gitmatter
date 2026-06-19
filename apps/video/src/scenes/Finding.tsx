import { AbsoluteFill } from "remotion";
import { theme, fonts } from "../theme";
import { Eyebrow, Rise } from "../components";

// Step three — the payoff of the review. gitmatter surfaces the one clause that
// needs a human, in context inside the document.
export const Finding: React.FC = () => (
  <AbsoluteFill
    style={{ backgroundColor: theme.ink, padding: 96, flexDirection: "column", gap: 28 }}
  >
    <Rise at={4}>
      <Eyebrow>step three · the finding</Eyebrow>
    </Rise>
    <Rise at={12}>
      <div style={{ fontFamily: fonts.heading, fontSize: 40, color: theme.text }}>
        gitmatter surfaces what needs a human.
      </div>
    </Rise>
    <Rise at={26} style={{ marginTop: 12 }}>
      <div
        style={{
          backgroundColor: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          padding: 36,
          display: "flex",
          flexDirection: "column",
          gap: 18,
        }}
      >
        <div style={{ fontFamily: fonts.mono, fontSize: 18, color: theme.muted, letterSpacing: 1 }}>
          Acme NDA #2 · Section 7 — Indemnification
        </div>
        <Line w="92%" />
        <Line w="78%" />
        <Rise at={56}>
          <div
            style={{
              backgroundColor: theme.ink,
              border: `2px solid ${theme.text}`,
              borderRadius: 10,
              padding: "18px 22px",
              fontFamily: fonts.body,
              fontSize: 26,
              lineHeight: 1.5,
              color: theme.text,
            }}
          >
            “…shall indemnify without limitation and irrespective of fault…”
            <div
              style={{ marginTop: 10, fontFamily: fonts.mono, fontSize: 18, color: theme.muted }}
            >
              ⚑ flagged · non-standard indemnity — uncapped liability
            </div>
          </div>
        </Rise>
        <Line w="84%" />
        <Line w="64%" />
      </div>
    </Rise>
    <Rise at={110} style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
        <span style={{ fontFamily: fonts.body, fontSize: 26, color: theme.text }}>
          gitmatter surfaces it. <span style={{ color: theme.muted }}>Jane decides:</span>
        </span>
        <span
          style={{
            fontFamily: fonts.mono,
            fontSize: 22,
            color: theme.text,
            border: `1px solid ${theme.text}`,
            borderRadius: 999,
            padding: "10px 22px",
          }}
        >
          reject clause · request mutual cap
        </span>
      </div>
    </Rise>
  </AbsoluteFill>
);

const Line: React.FC<{ w: string }> = ({ w }) => (
  <div style={{ height: 14, width: w, borderRadius: 4, backgroundColor: theme.border }} />
);
