import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Kicker, Pop } from "./kinetic";
import { ease, lin } from "./clips";

// Concept 7 — BYOK / security explainer: your key → encrypted at rest →
// provider with zero data retention; the "training" path is crossed out.
// 1920×1080 @30fps, ~30s.

const T = {
  introEnd: 100,
  n1: 130,
  wire1: 190,
  n2: 220,
  wire2: 290,
  n3: 320,
  zdr: 400,
  train: 470, // training node appears crossed out
  caption: 560,
  outro: 740,
  end: 900,
};
export const BYOK_FRAMES = T.end;

const Node: React.FC<{
  at: number;
  x: number;
  y: number;
  title: string;
  sub: string;
  dark?: boolean;
}> = ({ at, x, y, title, sub, dark }) => (
  <Pop delay={at} style={{ position: "absolute", left: x, top: y }}>
    <div
      style={{
        width: 400,
        background: dark ? kc.ink : kc.paper,
        border: `1px solid ${dark ? kc.ink : kc.line}`,
        borderRadius: 18,
        boxShadow: "0 24px 60px rgba(0,0,0,0.12)",
        padding: "28px 34px",
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <span
        style={{
          fontFamily: fonts.body,
          fontWeight: 600,
          fontSize: 30,
          color: dark ? "#fff" : kc.text,
        }}
      >
        {title}
      </span>
      <span style={{ fontFamily: fonts.mono, fontSize: 21, color: dark ? "#9a9aa2" : kc.muted }}>
        {sub}
      </span>
    </div>
  </Pop>
);

const Wire: React.FC<{ at: number; x: number; y: number; w: number }> = ({ at, x, y, w }) => {
  const f = useCurrentFrame();
  const p = ease(f, at, at + 24);
  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width: w * p,
        height: 2,
        background: kc.text,
      }}
    />
  );
};

export const Byok: React.FC = () => {
  const f = useCurrentFrame();
  const introOut = ease(f, T.introEnd - 16, T.introEnd + 4);
  const outroIn = ease(f, T.outro, T.outro + 18);
  const trainIn = lin(f, T.train, T.train + 14);
  return (
    <AbsoluteFill style={{ background: kc.paper }}>
      {introOut < 1 && (
        <AbsoluteFill
          style={{
            alignItems: "center",
            justifyContent: "center",
            gap: 26,
            opacity: 1 - introOut,
            transform: `translateY(${introOut * -50}px)`,
          }}
        >
          <Kicker delay={10}>bring your own key</Kicker>
          <BigText delay={26} size={104}>
            Where does your data go?
          </BigText>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ opacity: (1 - outroIn) * ease(f, T.n1 - 10, T.n1) }}>
        <Node
          at={T.n1}
          x={140}
          y={400}
          title="Your LLM key"
          sub="Claude · Gemini · OpenAI · OpenRouter"
        />
        <Wire at={T.wire1} x={550} y={470} w={110} />
        <Node
          at={T.n2}
          x={670}
          y={400}
          title="gitmatter"
          sub="key encrypted at rest — never logged"
          dark
        />
        <Wire at={T.wire2} x={1080} y={470} w={110} />
        <Node
          at={T.n3}
          x={1200}
          y={400}
          title="Your provider"
          sub="zero data retention, enforced"
        />

        {/* ZDR seal */}
        <Pop delay={T.zdr} style={{ position: "absolute", left: 1300, top: 320 }}>
          <span
            style={{
              fontFamily: fonts.mono,
              fontSize: 22,
              color: kc.green,
              border: `1px solid ${kc.green}`,
              borderRadius: 999,
              padding: "8px 22px",
              background: kc.paper,
            }}
          >
            ZDR ✓
          </span>
        </Pop>

        {/* the path that doesn't exist */}
        <div style={{ position: "absolute", left: 1290, top: 620, opacity: trainIn }}>
          <div
            style={{
              width: 400,
              border: `1px dashed ${kc.line}`,
              borderRadius: 18,
              padding: "26px 34px",
              position: "relative",
            }}
          >
            <span style={{ fontFamily: fonts.body, fontSize: 28, color: kc.muted }}>
              Model training
            </span>
            <div
              style={{
                position: "absolute",
                left: 20,
                right: 20,
                top: "50%",
                height: 3,
                background: kc.red,
                transform: `scaleX(${ease(f, T.train + 10, T.train + 26)})`,
                transformOrigin: "left",
              }}
            />
          </div>
        </div>

        <div
          style={{
            position: "absolute",
            left: 140,
            top: 700,
            fontFamily: fonts.body,
            fontSize: 32,
            lineHeight: 1.6,
            color: kc.muted,
            maxWidth: 900,
            opacity: lin(f, T.caption, T.caption + 16),
          }}
        >
          gitmatter&rsquo;s own features run on the key your firm already trusts. Nothing is kept,
          nothing trains anyone&rsquo;s model.
        </div>
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
          <BigText delay={T.outro + 8} size={110}>
            Your data stays yours.
          </BigText>
          <div style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 52, color: kc.text }}>
            git<span style={{ color: kc.muted }}>matter</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
