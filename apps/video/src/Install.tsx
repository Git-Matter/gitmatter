import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Kicker, Pop } from "./kinetic";
import { ease, lin, Type } from "./clips";

// Concept 2 — self-host install: "Download, install, run." A terminal types
// the install, services come up, the login page pops, and a corner timer
// lands under a minute. The video demo-gated competitors can't make.
// 1920×1080 @30fps, ~30s.

const T = {
  introEnd: 90,
  term: 100,
  cmd1: 130, // curl … | sh
  boot: 250, // install lines stream
  cmd2: 470, // gitmatter up
  ready: 560,
  browser: 620, // login card pops
  outro: 760,
  end: 900,
};
export const INSTALL_FRAMES = T.end;

const BOOT_LINES = [
  "downloading gitmatter … ✓",
  "postgres … ✓",
  "object storage … ✓",
  "migrations (10/10) … ✓",
];

export const Install: React.FC = () => {
  const f = useCurrentFrame();
  const introOut = ease(f, T.introEnd - 16, T.introEnd + 4);
  const termIn = ease(f, T.term, T.term + 18);
  const outroIn = ease(f, T.outro, T.outro + 18);
  // corner timer: 0:00 → 0:47 across the session
  const secs = Math.floor(lin(f, T.cmd1, T.ready, 0, 47));
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
          <Kicker delay={10}>runs on your terms</Kicker>
          <BigText delay={26} size={104}>
            Download, install, run.
          </BigText>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ opacity: termIn * (1 - outroIn) }}>
        {/* terminal */}
        <div
          style={{
            position: "absolute",
            left: 180,
            top: 170,
            width: 1080,
            height: 640,
            background: kc.ink,
            borderRadius: 20,
            boxShadow: "0 40px 100px rgba(0,0,0,0.25)",
            padding: "28px 36px",
            fontFamily: fonts.mono,
            fontSize: 27,
            lineHeight: 2,
            color: "#d9d9de",
            transform: `translateY(${(1 - termIn) * 40}px)`,
          }}
        >
          <div style={{ display: "flex", gap: 10, marginBottom: 18 }}>
            {["#ff5f57", "#febc2e", "#28c840"].map((c) => (
              <span key={c} style={{ width: 14, height: 14, borderRadius: 99, background: c }} />
            ))}
          </div>
          <div>
            <span style={{ color: "#7d7d85" }}>$ </span>
            <Type text="curl -fsSL gitmatter.com/install.sh | sh" f0={T.cmd1} cps={1.3} />
          </div>
          {BOOT_LINES.map((l, i) => (
            <div key={l} style={{ opacity: lin(f, T.boot + i * 40, T.boot + i * 40 + 10) }}>
              <span style={{ color: "#28c840" }}>{l}</span>
            </div>
          ))}
          <div style={{ opacity: lin(f, T.cmd2 - 10, T.cmd2) }}>
            <span style={{ color: "#7d7d85" }}>$ </span>
            <Type text="gitmatter up" f0={T.cmd2} cps={1.2} />
          </div>
          <div style={{ opacity: lin(f, T.ready, T.ready + 10) }}>
            ready on <span style={{ color: "#fff", fontWeight: 700 }}>http://localhost:4280</span>
          </div>
        </div>

        {/* login card pops over the terminal's right edge */}
        <Pop delay={T.browser} style={{ position: "absolute", left: 1150, top: 320 }}>
          <div
            style={{
              width: 590,
              background: kc.paper,
              border: `1px solid ${kc.line}`,
              borderRadius: 20,
              boxShadow: "0 40px 100px rgba(0,0,0,0.20)",
              padding: "44px 48px",
              display: "flex",
              flexDirection: "column",
              gap: 18,
              alignItems: "center",
            }}
          >
            <div
              style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 44, color: kc.text }}
            >
              git<span style={{ color: kc.muted }}>matter</span>
            </div>
            <div style={{ fontFamily: fonts.body, fontSize: 24, color: kc.muted }}>
              Log in to your gitmatter workspace.
            </div>
            {["Email", "Password"].map((l) => (
              <div
                key={l}
                style={{
                  width: "100%",
                  border: `1px solid ${kc.line}`,
                  borderRadius: 10,
                  padding: "14px 18px",
                  fontFamily: fonts.body,
                  fontSize: 22,
                  color: kc.muted,
                }}
              >
                {l}
              </div>
            ))}
            <div
              style={{
                width: "100%",
                background: kc.ink,
                borderRadius: 10,
                padding: "14px 18px",
                fontFamily: fonts.body,
                fontWeight: 600,
                fontSize: 22,
                color: "#fff",
                textAlign: "center",
              }}
            >
              Log in
            </div>
          </div>
        </Pop>

        {/* corner timer */}
        <div
          style={{
            position: "absolute",
            right: 90,
            top: 80,
            fontFamily: fonts.mono,
            fontSize: 34,
            color: kc.muted,
            opacity: lin(f, T.cmd1, T.cmd1 + 10),
          }}
        >
          0:{String(secs).padStart(2, "0")}
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
          <BigText delay={T.outro + 8} size={100}>
            Running in under a minute.
          </BigText>
          <div style={{ fontFamily: fonts.body, fontSize: 30, color: kc.muted }}>
            No consultants. No IT project.
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
