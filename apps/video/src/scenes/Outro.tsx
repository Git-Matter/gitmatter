import { AbsoluteFill } from "remotion";
import { theme, fonts } from "../theme";
import { Rise } from "../components";

export const Outro: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.ink,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "column",
      gap: 20,
    }}
  >
    <Rise at={4}>
      <div style={{ fontFamily: fonts.heading, fontSize: 64, color: theme.text }}>
        git<span style={{ color: theme.bronze }}>counsel</span>
      </div>
    </Rise>
    <Rise at={16}>
      <div style={{ fontFamily: fonts.body, fontSize: 24, color: theme.muted }}>
        Audited legal AI. Every step provable, reversible, yours.
      </div>
    </Rise>
    <Rise at={28}>
      <div style={{ fontFamily: fonts.mono, fontSize: 20, color: theme.bronze, letterSpacing: 1 }}>
        github.com/your-org/gitmatter
      </div>
    </Rise>
  </AbsoluteFill>
);
