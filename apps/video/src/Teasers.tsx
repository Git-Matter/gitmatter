import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Kicker } from "./kinetic";
import { ease } from "./clips";

// Concept 5 — kinetic social teasers: 12s type-driven cuts, one line at a
// time, ending on the wordmark. 1920×1080 masters (crop variants later).

export const TEASER_FRAMES = 360;

const Wordmark: React.FC<{ at: number }> = ({ at }) => {
  const f = useCurrentFrame();
  const t = ease(f, at, at + 16);
  return (
    <div
      style={{
        fontFamily: fonts.heading,
        fontWeight: 700,
        fontSize: 64,
        color: kc.text,
        opacity: t,
        transform: `translateY(${(1 - t) * 16}px)`,
      }}
    >
      git<span style={{ color: kc.muted }}>matter</span>
    </div>
  );
};

// Lines stack in one after another, then the wordmark lands.
const Teaser: React.FC<{ kicker: string; lines: { t: string; at: number; muted?: boolean }[] }> = ({
  kicker,
  lines,
}) => (
  <AbsoluteFill
    style={{ background: kc.paper, alignItems: "center", justifyContent: "center", gap: 24 }}
  >
    <Kicker delay={8}>{kicker}</Kicker>
    {lines.map((l) => (
      <BigText key={l.t} delay={l.at} size={110} color={l.muted ? kc.muted : kc.text}>
        {l.t}
      </BigText>
    ))}
    <div style={{ height: 10 }} />
    <Wordmark at={lines[lines.length - 1].at + 60} />
  </AbsoluteFill>
);

export const TeaserLunch: React.FC = () => (
  <Teaser
    kicker="tabular review"
    lines={[
      { t: "100 contracts.", at: 30 },
      { t: "One deadline.", at: 90, muted: true },
      { t: "Reviewed before lunch.", at: 160 },
    ]}
  />
);

export const TeaserBlame: React.FC = () => (
  <Teaser
    kicker="a clear record"
    lines={[
      { t: "Who changed §9?", at: 30 },
      { t: "Ask the record.", at: 110 },
    ]}
  />
);

export const TeaserAgent: React.FC = () => (
  <Teaser
    kicker="bring your own"
    lines={[
      { t: "Your agent.", at: 30 },
      { t: "Your key.", at: 90, muted: true },
      { t: "Your record.", at: 150 },
    ]}
  />
);
