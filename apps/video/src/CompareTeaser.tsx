import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Pop } from "./kinetic";
import { ease, lin } from "./clips";

// Concept 6 — comparison teaser: the same answer twice. Left card gives it
// with nothing behind it; right card gives it with its history. Left dims.
// No competitor named. 1920×1080 @30fps, ~20s.

const T = {
  cards: 20,
  answer: 60,
  history: 170,
  dim: 300,
  outro: 460,
  end: 600,
};
export const COMPARE_FRAMES = T.end;

const ANSWER = "The indemnity in §4 is uncapped and survives termination.";

const HISTORY = [
  "AI assistant · ran “Indemnity capped?” · gpt-5.5",
  "Source: acme-nda-007.docx §4.2",
  "M. Reyes · confirmed flag · 2:14 PM",
];

const cardStyle: React.CSSProperties = {
  position: "absolute",
  top: 220,
  width: 780,
  minHeight: 540,
  background: kc.paper,
  border: `1px solid ${kc.line}`,
  borderRadius: 20,
  boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
  padding: "40px 46px",
  display: "flex",
  flexDirection: "column",
  gap: 26,
};

export const CompareTeaser: React.FC = () => {
  const f = useCurrentFrame();
  const dim = ease(f, T.dim, T.dim + 24, 1, 0.35);
  const outroIn = ease(f, T.outro, T.outro + 18);
  return (
    <AbsoluteFill style={{ background: kc.panel }}>
      <AbsoluteFill style={{ opacity: 1 - outroIn }}>
        {/* the black box */}
        <Pop delay={T.cards} style={{ position: "absolute", left: 120, top: 0 }}>
          <div style={{ ...cardStyle, left: 0, opacity: dim }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 22, color: kc.muted }}>
              a black box
            </span>
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 32,
                lineHeight: 1.6,
                color: kc.text,
                opacity: lin(f, T.answer, T.answer + 14),
              }}
            >
              {ANSWER}
            </span>
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 26,
                color: kc.muted,
                marginTop: "auto",
                opacity: lin(f, T.dim, T.dim + 16),
              }}
            >
              Where did that come from? You can&rsquo;t ask.
            </span>
          </div>
        </Pop>

        {/* gitmatter */}
        <Pop delay={T.cards + 10} style={{ position: "absolute", left: 1020, top: 0 }}>
          <div style={{ ...cardStyle, left: 0 }}>
            <span style={{ fontFamily: fonts.mono, fontSize: 22, color: kc.text }}>
              git<b>matter</b>
            </span>
            <span
              style={{
                fontFamily: fonts.body,
                fontSize: 32,
                lineHeight: 1.6,
                color: kc.text,
                opacity: lin(f, T.answer + 10, T.answer + 24),
              }}
            >
              {ANSWER}
            </span>
            <div
              style={{
                borderTop: `1px solid ${kc.line}`,
                paddingTop: 20,
                display: "flex",
                flexDirection: "column",
                gap: 14,
              }}
            >
              {HISTORY.map((h, i) => (
                <span
                  key={h}
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 21,
                    color: kc.muted,
                    display: "flex",
                    alignItems: "center",
                    gap: 12,
                    opacity: lin(f, T.history + i * 26, T.history + i * 26 + 12),
                  }}
                >
                  <span style={{ width: 8, height: 8, borderRadius: 99, background: kc.text }} />
                  {h}
                </span>
              ))}
            </div>
          </div>
        </Pop>
      </AbsoluteFill>

      {outroIn > 0.001 && (
        <AbsoluteFill
          style={{
            background: kc.paper,
            alignItems: "center",
            justifyContent: "center",
            gap: 22,
            opacity: outroIn,
          }}
        >
          <BigText delay={T.outro + 8} size={104}>
            See the work. Skip the black box.
          </BigText>
          <div style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 52, color: kc.text }}>
            git<span style={{ color: kc.muted }}>matter</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
