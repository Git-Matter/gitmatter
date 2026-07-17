import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { TransitionSeries, linearTiming } from "@remotion/transitions";
import { fade } from "@remotion/transitions/fade";
import { slide } from "@remotion/transitions/slide";
import { fonts, theme } from "./theme";
import {
  AgentClip,
  AssistantClip,
  AuditClip,
  CLIP,
  LibraryClip,
  LegalResearchClip,
  RedlineClip,
  ReviewClip,
  WorkflowClip,
} from "./clips";

// Platform overview: every feature clip in one reel with transitions, for the
// header "Platform" menu card and anywhere a single at-a-glance tour is
// needed. Renders at the shared CLIP size (1200x900 @30fps) to
// apps/web/public/features/overview.mp4.

const SCENE = 80; // frames each feature is on screen
const T = 14; // transition length
const CARD = 70; // intro/outro cards

const FEATURES: { tag: string; component: React.FC }[] = [
  { tag: "Legal research", component: LegalResearchClip },
  { tag: "Assistant", component: AssistantClip },
  { tag: "Tabular review", component: ReviewClip },
  { tag: "Redline & drafting", component: RedlineClip },
  { tag: "Workflows", component: WorkflowClip },
  { tag: "Clause library & playbooks", component: LibraryClip },
  { tag: "Audit trail", component: AuditClip },
  { tag: "Bring your own agent", component: AgentClip },
];

// 2 cards + 7 scenes, 8 transitions overlapping.
export const OVERVIEW_FRAMES = CARD * 2 + SCENE * FEATURES.length - T * (FEATURES.length + 1);

const ease = (f: number, a: number, b: number, c = 0, d = 1) =>
  interpolate(f, [a, b], [c, d], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut((t) => Easing.cubic(t)),
  });

function TitleCard({ title, sub }: { title: string; sub: string }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill
      style={{
        background: theme.ink,
        alignItems: "center",
        justifyContent: "center",
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: fonts.heading,
          fontSize: 64,
          color: theme.text,
          letterSpacing: -1,
          opacity: ease(f, 4, 22),
          transform: `translateY(${ease(f, 4, 22, 14, 0)}px)`,
        }}
      >
        {title}
      </div>
      <div
        style={{
          fontFamily: fonts.body,
          fontSize: 26,
          color: theme.muted,
          opacity: ease(f, 14, 32),
          transform: `translateY(${ease(f, 14, 32, 12, 0)}px)`,
        }}
      >
        {sub}
      </div>
    </AbsoluteFill>
  );
}

// A feature clip with its name pinned as a quiet kicker along the top.
function Scene({ tag, children }: { tag: string; children: React.ReactNode }) {
  const f = useCurrentFrame();
  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      {children}
      <div
        style={{
          position: "absolute",
          top: 34,
          left: 0,
          right: 0,
          display: "flex",
          justifyContent: "center",
          opacity: ease(f, 6, 24),
        }}
      >
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 19,
            fontWeight: 600,
            letterSpacing: 4,
            textTransform: "uppercase",
            color: theme.muted,
            background: theme.panel,
            border: `1px solid ${theme.border}`,
            borderRadius: 999,
            padding: "10px 22px",
          }}
        >
          {tag}
        </div>
      </div>
    </AbsoluteFill>
  );
}

export const Overview: React.FC = () => {
  return (
    <AbsoluteFill style={{ background: theme.ink }}>
      <TransitionSeries>
        <TransitionSeries.Sequence durationInFrames={CARD}>
          <TitleCard title="gitmatter" sub="The whole platform, in one pass." />
        </TransitionSeries.Sequence>
        {FEATURES.map(({ tag, component: Feature }, i) => (
          <React.Fragment key={tag}>
            <TransitionSeries.Transition
              presentation={i % 2 ? slide({ direction: "from-right" }) : fade()}
              timing={linearTiming({ durationInFrames: T })}
            />
            <TransitionSeries.Sequence durationInFrames={SCENE}>
              <Scene tag={tag}>
                <Feature />
              </Scene>
            </TransitionSeries.Sequence>
          </React.Fragment>
        ))}
        <TransitionSeries.Transition
          presentation={fade()}
          timing={linearTiming({ durationInFrames: T })}
        />
        <TransitionSeries.Sequence durationInFrames={CARD}>
          <TitleCard title="Every step on the record." sub="gitmatter.com" />
        </TransitionSeries.Sequence>
      </TransitionSeries>
    </AbsoluteFill>
  );
};

export { CLIP };
