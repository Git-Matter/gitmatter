import {
  AbsoluteFill,
  Easing,
  interpolate,
  spring,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import { fonts } from "./theme";

// Eased 0..1 ramps — the difference between "moves" and "feels edited".
const eOut = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.out((t) => Easing.cubic(t)),
  });
const eIn = (f: number, a: number, b: number) =>
  interpolate(f, [a, b], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.in((t) => Easing.cubic(t)),
  });

// Accent palette for the kinetic reel — warmer + louder than the app chrome so
// callouts pop. Ground stays near-white; ink text; monochrome black accent (kept
// under the `bronze` key for back-compat) + signal red/green for the flag/ready.
export const kc = {
  ink: "#0d0d0f",
  paper: "#ffffff",
  panel: "#f5f5f4",
  line: "#e3e3e0",
  text: "#16161a",
  muted: "#85858c",
  bronze: "#16161a",
  red: "#e5484d",
  green: "#2f9e6f",
} as const;

// Snappy spring 0..1, gated by `delay` (frames). One knob for every entrance.
export const useIn = (delay = 0, damping = 200) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  return spring({ frame: frame - delay, fps, config: { damping, mass: 0.6, stiffness: 180 } });
};

// Scale + fade pop-in. The default workhorse for cards and chips.
export const Pop: React.FC<{
  delay?: number;
  from?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, from = 0.82, children, style }) => {
  const t = useIn(delay);
  return (
    <div style={{ opacity: t, transform: `scale(${from + (1 - from) * t})`, ...style }}>
      {children}
    </div>
  );
};

// Directional slide-in.
export const Slide: React.FC<{
  delay?: number;
  dx?: number;
  dy?: number;
  children: React.ReactNode;
  style?: React.CSSProperties;
}> = ({ delay = 0, dx = 0, dy = 0, children, style }) => {
  const t = useIn(delay);
  return (
    <div
      style={{
        opacity: t,
        transform: `translate(${dx * (1 - t)}px, ${dy * (1 - t)}px)`,
        ...style,
      }}
    >
      {children}
    </div>
  );
};

// Big montage callout — uppercase, tight, mask-wipes up into view.
export const BigText: React.FC<{
  delay?: number;
  children: React.ReactNode;
  size?: number;
  color?: string;
  accent?: string;
}> = ({ delay = 0, children, size = 120, color = kc.text }) => {
  const t = useIn(delay, 220);
  const y = interpolate(t, [0, 1], [40, 0]);
  return (
    <div style={{ overflow: "hidden", padding: "0 6px" }}>
      <div
        style={{
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: size,
          lineHeight: 1.02,
          letterSpacing: -2,
          color,
          transform: `translateY(${y}px)`,
          opacity: t,
        }}
      >
        {children}
      </div>
    </div>
  );
};

// Editorial kicker. A "NN — label" string renders as a print-style section
// marker: an italic serif index figure, a hairline rule, then a finely
// letterspaced cap label. A bare label (no number prefix) renders just the
// label. Replaces the old mono/terminal look.
export const Kicker: React.FC<{ delay?: number; children: React.ReactNode; color?: string }> = ({
  delay = 0,
  children,
  color = kc.bronze,
}) => {
  const t = useIn(delay);
  const match =
    typeof children === "string" ? children.trim().match(/^(\d+)\s*[—–-]\s*(.+)$/) : null;

  const label = (text: React.ReactNode) => (
    <span
      style={{
        fontFamily: fonts.body,
        fontSize: 15,
        fontWeight: 500,
        letterSpacing: 7,
        textTransform: "uppercase",
        color,
      }}
    >
      {text}
    </span>
  );

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 16,
        opacity: t,
        transform: `translateY(${interpolate(t, [0, 1], [12, 0])}px)`,
      }}
    >
      {match ? (
        <>
          <span
            style={{
              fontFamily: fonts.heading,
              fontStyle: "italic",
              fontSize: 27,
              lineHeight: 1,
              color,
            }}
          >
            {match[1]}
          </span>
          <span style={{ width: 28, height: 1, background: color, opacity: 0.45 }} />
          {label(match[2])}
        </>
      ) : (
        label(children)
      )}
    </div>
  );
};

// Oscillating attention pulse (0..1..0). Use for the flag highlight.
export const usePulse = (start: number, period = 26) => {
  const frame = useCurrentFrame();
  if (frame < start) return 0;
  const p = ((frame - start) % period) / period;
  return Math.sin(p * Math.PI * 2) * 0.5 + 0.5;
};

type Dir = "fade" | "left" | "right" | "up" | "down" | "scale";

// Connective scene wrapper. Sequences overlap by TT frames; the outgoing scene
// plays its `exit` while the incoming plays its `enter` over the same frames, so
// cuts read as edited transitions (push / dissolve / scale-through), not hard
// jumps.
const TT = 16;
export const Scene: React.FC<{
  dur: number;
  enter?: Dir;
  exit?: Dir;
  children: React.ReactNode;
  style?: React.CSSProperties;
  bg?: string;
}> = ({ dur, enter = "fade", exit = "fade", children, style, bg = kc.paper }) => {
  const frame = useCurrentFrame();
  const ep = eOut(frame, 0, TT);
  const xp = eIn(frame, dur - TT, dur);
  const SH = 90;

  const tf = (dir: Dir, p: number, sign: number) => {
    const d = sign * p;
    switch (dir) {
      case "left":
        return `translateX(${-d * SH}px)`;
      case "right":
        return `translateX(${d * SH}px)`;
      case "up":
        return `translateY(${-d * SH}px)`;
      case "down":
        return `translateY(${d * SH}px)`;
      case "scale":
        return `scale(${1 - 0.06 * p})`;
      default:
        return "none";
    }
  };
  const enterT = tf(enter, 1 - ep, 1);
  const exitT = tf(exit, xp, -1);
  const opacity = ep * (1 - xp);

  return (
    <AbsoluteFill style={{ backgroundColor: bg }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          display: "flex",
          flexDirection: "column",
          justifyContent: "center",
          padding: 120,
          gap: 36,
          opacity,
          transform: `${enterT} ${exitT}`,
          ...style,
        }}
      >
        {children}
      </div>
    </AbsoluteFill>
  );
};

// Camera push: scales children toward a focus point between f0..f1. The
// expressive centerpiece — dives from the full grid into one cell.
export const Cam: React.FC<{
  f0: number;
  f1: number;
  from?: number;
  to?: number;
  focus?: { x: number; y: number };
  children: React.ReactNode;
}> = ({ f0, f1, from = 1, to = 1.6, focus = { x: 0.5, y: 0.5 }, children }) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame, [f0, f1], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut((t) => Easing.cubic(t)),
  });
  const scale = from + (to - from) * p;
  const tx = (0.5 - focus.x) * (scale - 1) * 100;
  const ty = (0.5 - focus.y) * (scale - 1) * 100;
  return (
    <AbsoluteFill
      style={{ transform: `scale(${scale}) translate(${tx}%, ${ty}%)`, transformOrigin: "center" }}
    >
      {children}
    </AbsoluteFill>
  );
};

// A pointer that glides between waypoints (eased) and ripples on click frames.
// Coords are px on the 1920×1080 canvas.
export const Cursor: React.FC<{
  path: { f: number; x: number; y: number }[];
  clicks?: number[];
}> = ({ path, clicks = [] }) => {
  const frame = useCurrentFrame();
  const fs = path.map((p) => p.f);
  const x = interpolate(
    frame,
    fs,
    path.map((p) => p.x),
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut((t) => Easing.cubic(t)),
    }
  );
  const y = interpolate(
    frame,
    fs,
    path.map((p) => p.y),
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: Easing.inOut((t) => Easing.cubic(t)),
    }
  );
  const appear = eOut(frame, fs[0] - 6, fs[0] + 2);
  const press = clicks.reduce((acc, cf) => {
    const d = frame - cf;
    return d >= 0 && d < 6 ? Math.sin((d / 6) * Math.PI) : acc;
  }, 0);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      {clicks.map((cf) => {
        const d = frame - cf;
        if (d < 0 || d > 16) return null;
        const r = interpolate(d, [0, 16], [0, 46]);
        const o = interpolate(d, [0, 16], [0.5, 0]);
        return (
          <div
            key={cf}
            style={{
              position: "absolute",
              left: x - r,
              top: y - r,
              width: r * 2,
              height: r * 2,
              borderRadius: 999,
              border: `2px solid ${kc.ink}`,
              opacity: o,
            }}
          />
        );
      })}
      <div
        style={{
          position: "absolute",
          left: x,
          top: y,
          opacity: appear,
          transform: `scale(${1 - press * 0.18})`,
          filter: "drop-shadow(0 3px 6px rgba(0,0,0,0.25))",
        }}
      >
        <svg width="34" height="34" viewBox="0 0 24 24" fill="none">
          <path
            d="M4 2 L4 20 L9 15 L12.5 22 L15 20.5 L11.5 13.5 L19 13 Z"
            fill="#fff"
            stroke={kc.ink}
            strokeWidth="1.5"
            strokeLinejoin="round"
          />
        </svg>
      </div>
    </AbsoluteFill>
  );
};

// Sweeping highlight bar — "the AI is scanning every line". Travels left→right.
export const Scan: React.FC<{ f0: number; f1: number }> = ({ f0, f1 }) => {
  const frame = useCurrentFrame();
  if (frame < f0 || frame > f1) return null;
  const p = interpolate(frame, [f0, f1], [-10, 110]);
  return (
    <AbsoluteFill style={{ overflow: "hidden", pointerEvents: "none" }}>
      <div
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${p}%`,
          width: "16%",
          background:
            "linear-gradient(90deg, rgba(22,22,26,0) 0%, rgba(22,22,26,0.07) 50%, rgba(22,22,26,0) 100%)",
        }}
      />
    </AbsoluteFill>
  );
};

// Whisper-soft vignette for cinematic depth. On for the climax.
export const Vignette: React.FC<{ strength?: number }> = ({ strength = 0.18 }) => (
  <AbsoluteFill
    style={{
      pointerEvents: "none",
      background: `radial-gradient(120% 90% at 50% 45%, rgba(0,0,0,0) 55%, rgba(0,0,0,${strength}) 100%)`,
    }}
  />
);
