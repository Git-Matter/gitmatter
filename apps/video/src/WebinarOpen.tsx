import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Kicker } from "./kinetic";
import { ease } from "./clips";

// Concept 8 — webinar cold opens: 15s branded intros for segment-targeted
// live demos. One component, one composition per segment. 1920×1080 @30fps.

export const WEBINAR_FRAMES = 450;

const Open: React.FC<{ segment: string }> = ({ segment }) => {
  const f = useCurrentFrame();
  const ruleW = ease(f, 150, 200);
  const holdOut = 1 - ease(f, WEBINAR_FRAMES - 20, WEBINAR_FRAMES - 4);
  return (
    <AbsoluteFill
      style={{
        background: kc.paper,
        alignItems: "center",
        justifyContent: "center",
        gap: 28,
        opacity: holdOut,
      }}
    >
      <Kicker delay={10}>live demo</Kicker>
      <BigText delay={30} size={110}>
        gitmatter
      </BigText>
      <BigText delay={80} size={72} color={kc.muted}>
        {segment}
      </BigText>
      <div style={{ width: 560, height: 2, background: kc.line, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            inset: 0,
            width: `${ruleW * 100}%`,
            background: kc.ink,
          }}
        />
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 30,
          color: kc.muted,
          opacity: ease(f, 210, 230),
        }}
      >
        Every change on the record — see it live.
      </div>
    </AbsoluteFill>
  );
};

export const WebinarInHouse: React.FC = () => <Open segment="for in-house teams" />;
export const WebinarTransactional: React.FC = () => <Open segment="for transactional practices" />;
