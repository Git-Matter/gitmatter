import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Cam, Cursor, Kicker, usePulse, Vignette } from "./kinetic";
import { ease, lin } from "./clips";

// Concept 3 — audit spine deep dive: "No black box." One clause; the camera
// dives into it; its history rail slides out — AI flag, human amendment, field
// diff, blame — then one click of Undo visibly reverts the text.
// 1920×1080 @30fps, ~40s.

const T = {
  introEnd: 100,
  doc: 110,
  dive: 220,
  diveEnd: 270,
  rail: 300, // history rail slides in
  c1: 330,
  c2: 420,
  c3: 510,
  undoMove: 660,
  undoClick: 740,
  revert: 750, // clause text reverts
  outro: 1050,
  end: 1200,
};
export const AUDITDIVE_FRAMES = T.end;

const COMMITS = [
  {
    f: T.c1,
    who: "AI assistant",
    ai: true,
    msg: "Flagged unlimited liability against playbook",
    diff: null,
  },
  {
    f: T.c2,
    who: "AI assistant",
    ai: true,
    msg: "Suggested 12-month fee cap",
    diff: { field: "Liability", from: "unlimited", to: "capped at 12-mo fees" },
  },
  {
    f: T.c3,
    who: "M. Reyes",
    ai: false,
    msg: "Accepted cap, tightened notice period",
    diff: { field: "Notice", from: "10 days", to: "30 days" },
  },
];

export const AuditDive: React.FC = () => {
  const f = useCurrentFrame();
  const introOut = ease(f, T.introEnd - 16, T.introEnd + 4);
  const docIn = ease(f, T.doc, T.doc + 18);
  const railIn = ease(f, T.rail, T.rail + 20);
  const reverted = f >= T.revert;
  const outroIn = ease(f, T.outro, T.outro + 18);
  const pulse = usePulse(T.diveEnd, 40);

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
          <Kicker delay={10}>a clear record</Kicker>
          <BigText delay={26} size={100}>
            Where did this clause come from?
          </BigText>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ opacity: docIn * (1 - outroIn) }}>
        <Cam f0={T.dive} f1={T.diveEnd} to={1.14} focus={{ x: 0.5, y: 0.45 }}>
          {/* the document */}
          <div
            style={{
              position: "absolute",
              left: 170,
              top: 130,
              width: 920,
              height: 820,
              background: kc.paper,
              border: `1px solid ${kc.line}`,
              borderRadius: 20,
              boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
              padding: "50px 60px",
              fontFamily: fonts.body,
              fontSize: 28,
              lineHeight: 1.9,
              color: kc.muted,
            }}
          >
            <div
              style={{
                fontFamily: fonts.heading,
                fontSize: 40,
                color: kc.text,
                marginBottom: 26,
              }}
            >
              Services Agreement
            </div>
            <p style={{ margin: "0 0 26px" }}>
              8. Confidentiality. Each party shall protect the other&rsquo;s confidential
              information with no less than reasonable care…
            </p>
            {/* the clause under the microscope */}
            <p
              style={{
                margin: 0,
                padding: "18px 22px",
                borderRadius: 12,
                background: `rgba(22,22,26,${0.03 + pulse * 0.04})`,
                border: `1px solid ${kc.line}`,
                color: kc.text,
              }}
            >
              9. Liability. Liability under this Agreement is{" "}
              <b>{reverted ? "unlimited" : "capped at fees paid in the prior 12 months"}</b>, except
              for breach of confidentiality. Either party may terminate on{" "}
              <b>{reverted ? "10" : "30"}</b> days&rsquo; written notice.
            </p>
            <p style={{ margin: "26px 0 0" }}>
              10. Governing law. This Agreement is governed by the laws of Delaware…
            </p>
          </div>

          {/* the history rail */}
          <div
            style={{
              position: "absolute",
              left: 1150,
              top: 130,
              width: 620,
              opacity: railIn,
              transform: `translateX(${(1 - railIn) * 60}px)`,
            }}
          >
            <div
              style={{
                fontFamily: fonts.mono,
                fontSize: 20,
                color: kc.muted,
                marginBottom: 18,
              }}
            >
              §9 · change history
            </div>
            {COMMITS.map((c) => (
              <div
                key={c.msg}
                style={{
                  display: "flex",
                  gap: 18,
                  padding: "20px 0",
                  borderTop: `1px solid ${kc.line}`,
                  opacity: lin(f, c.f, c.f + 14),
                  transform: `translateY(${(1 - lin(f, c.f, c.f + 14)) * 14}px)`,
                }}
              >
                <span
                  style={{
                    marginTop: 10,
                    width: 12,
                    height: 12,
                    borderRadius: 99,
                    background: c.ai ? kc.text : undefined,
                    border: c.ai ? undefined : `2px solid ${kc.muted}`,
                    flexShrink: 0,
                  }}
                />
                <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                  <span style={{ fontFamily: fonts.body, fontSize: 25, color: kc.text }}>
                    {c.msg}
                  </span>
                  <span style={{ fontFamily: fonts.mono, fontSize: 19, color: kc.muted }}>
                    {c.who} · recorded
                  </span>
                  {c.diff && (
                    <span style={{ fontFamily: fonts.body, fontSize: 21 }}>
                      <span style={{ color: kc.muted }}>{c.diff.field}: </span>
                      <span style={{ color: kc.red, textDecoration: "line-through" }}>
                        {c.diff.from}
                      </span>
                      <span style={{ color: kc.muted }}> → </span>
                      <span style={{ color: kc.text, fontWeight: 600 }}>{c.diff.to}</span>
                    </span>
                  )}
                </div>
              </div>
            ))}
            {/* undo */}
            <div
              style={{
                marginTop: 24,
                display: "inline-block",
                fontFamily: fonts.body,
                fontWeight: 600,
                fontSize: 24,
                color: reverted ? "#fff" : kc.text,
                background: reverted ? kc.ink : kc.paper,
                border: `1px solid ${reverted ? kc.ink : kc.line}`,
                borderRadius: 12,
                padding: "14px 30px",
                opacity: lin(f, T.c3 + 40, T.c3 + 54),
              }}
            >
              {reverted ? "Undone" : "Undo to before review"}
            </div>
          </div>
        </Cam>
        <Vignette strength={ease(f, T.dive, T.diveEnd) * 0.22} />
        <Cursor
          path={[
            { f: T.undoMove, x: 1500, y: 900 },
            { f: T.undoClick - 10, x: 1290, y: 840 },
          ]}
          clicks={[T.undoClick]}
        />
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
            Read it. Share it. Undo it.
          </BigText>
          <div style={{ fontFamily: fonts.body, fontSize: 30, color: kc.muted }}>No black box.</div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
