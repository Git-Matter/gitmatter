import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Cursor, Kicker, Pop, Scan } from "./kinetic";
import { ease, lin } from "./clips";

// Concept 4 — playbook redline end-to-end: upload → playbook check → tracked
// changes stream in → partner accepts two, rejects one → export. One
// continuous shot inside a single document card. 1920×1080 @30fps, ~45s.

const T = {
  introEnd: 100,
  card: 110,
  drop: 150, // file chip drops in
  checks: 260, // playbook checks tick
  scan: 420,
  s1: 470, // suggestion strikes/inserts land
  s2: 540,
  s3: 610,
  actMove: 720,
  accept: 800, // accept both cap + notice
  reject: 880, // reject venue change
  exportClick: 1030,
  exported: 1060,
  outro: 1200,
  end: 1350,
};
export const REDLINELOOP_FRAMES = T.end;

const CHECKS = [
  { name: "Liability cap", ok: false },
  { name: "Notice period", ok: false },
  { name: "Governing law", ok: true },
  { name: "Confidentiality survival", ok: true },
];

export const RedlineLoop: React.FC = () => {
  const f = useCurrentFrame();
  const introOut = ease(f, T.introEnd - 16, T.introEnd + 4);
  const cardIn = ease(f, T.card, T.card + 18);
  const outroIn = ease(f, T.outro, T.outro + 18);
  const accepted = f >= T.accept + 8;
  const rejected = f >= T.reject + 8;
  const exported = f >= T.exported + 8;

  const del = (t: string, at: number, gone: boolean) =>
    gone ? null : (
      <span style={{ position: "relative", color: kc.muted, whiteSpace: "nowrap" }}>
        {t}
        <span
          style={{
            position: "absolute",
            left: 0,
            top: "54%",
            height: 3,
            width: `${ease(f, at, at + 16) * 100}%`,
            background: kc.red,
          }}
        />
      </span>
    );
  const ins = (t: string, at: number, live = true) => (
    <span
      style={{
        opacity: live ? lin(f, at + 10, at + 20) : 0.35,
        color: kc.text,
        fontWeight: 600,
        background: `rgba(22,22,26,${live && !accepted ? 0.06 : 0})`,
        borderRadius: 6,
        padding: "0 6px",
        textDecoration: live ? undefined : "line-through",
      }}
    >
      {t}
    </span>
  );

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
          <Kicker delay={10}>contract redline</Kicker>
          <BigText delay={26} size={96}>
            The first pass, done before you open it.
          </BigText>
        </AbsoluteFill>
      )}

      <AbsoluteFill style={{ opacity: cardIn * (1 - outroIn) }}>
        {/* document card */}
        <div
          style={{
            position: "absolute",
            left: 150,
            top: 130,
            width: 1100,
            height: 820,
            background: kc.paper,
            border: `1px solid ${kc.line}`,
            borderRadius: 20,
            boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
            overflow: "hidden",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              borderBottom: `1px solid ${kc.line}`,
              padding: "22px 32px",
            }}
          >
            <Pop delay={T.drop}>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: 26,
                  color: kc.text,
                }}
              >
                services-agreement.docx
              </span>
            </Pop>
            <span style={{ fontFamily: fonts.mono, fontSize: 20, color: kc.muted }}>
              {f < T.scan
                ? "checking against playbook…"
                : rejected
                  ? "2 accepted · 1 rejected"
                  : "3 suggestions"}
            </span>
          </div>
          <div
            style={{
              padding: "36px 44px",
              fontFamily: fonts.body,
              fontSize: 29,
              lineHeight: 2,
              color: kc.muted,
              position: "relative",
            }}
          >
            <p style={{ margin: 0 }}>
              9. Liability. Liability under this Agreement is {del("unlimited", T.s1, accepted)}{" "}
              {ins("capped at fees paid in the prior 12 months", T.s1)}, except for breach of
              confidentiality.
            </p>
            <p style={{ margin: "18px 0 0" }}>
              12. Termination. Either party may terminate on {del("10", T.s2, accepted)}{" "}
              {ins("30", T.s2)} days&rsquo; written notice.
            </p>
            <p style={{ margin: "18px 0 0" }}>
              14. Venue. Disputes shall be resolved in{" "}
              {rejected ? "the courts of Delaware" : del("the courts of Delaware", T.s3, false)}{" "}
              {rejected ? null : ins("binding arbitration", T.s3, !rejected)}.
            </p>
            <Scan f0={T.scan} f1={T.scan + 80} />
          </div>
        </div>

        {/* playbook checklist */}
        <div style={{ position: "absolute", left: 1330, top: 130, width: 480 }}>
          <div style={{ fontFamily: fonts.mono, fontSize: 20, color: kc.muted, marginBottom: 16 }}>
            playbook · standard positions
          </div>
          {CHECKS.map((c, i) => {
            const at = T.checks + i * 34;
            const resolved = c.ok || accepted;
            return (
              <div
                key={c.name}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 16,
                  padding: "16px 0",
                  borderTop: `1px solid ${kc.line}`,
                  opacity: lin(f, at, at + 12),
                }}
              >
                <span
                  style={{
                    fontFamily: fonts.heading,
                    fontSize: 27,
                    color: resolved ? kc.green : kc.red,
                    width: 30,
                  }}
                >
                  {resolved ? "✓" : "✗"}
                </span>
                <span style={{ fontFamily: fonts.body, fontSize: 25, color: kc.text }}>
                  {c.name}
                </span>
              </div>
            );
          })}

          {/* actions */}
          <div style={{ display: "flex", flexDirection: "column", gap: 14, marginTop: 30 }}>
            <Pop delay={T.s3 + 40}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: 24,
                  color: accepted ? "#fff" : kc.text,
                  background: accepted ? kc.green : kc.paper,
                  border: `1px solid ${accepted ? kc.green : kc.line}`,
                  borderRadius: 12,
                  padding: "14px 28px",
                }}
              >
                {accepted ? "Accepted · cap + notice" : "Accept cap + notice"}
              </span>
            </Pop>
            <Pop delay={T.s3 + 52}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: 24,
                  color: rejected ? kc.muted : kc.text,
                  background: kc.paper,
                  border: `1px solid ${kc.line}`,
                  borderRadius: 12,
                  padding: "14px 28px",
                  textDecoration: rejected ? "line-through" : undefined,
                }}
              >
                {rejected ? "Rejected · venue change" : "Reject venue change"}
              </span>
            </Pop>
            <Pop delay={T.reject + 40}>
              <span
                style={{
                  display: "inline-block",
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: 24,
                  color: "#fff",
                  background: exported ? kc.muted : kc.ink,
                  borderRadius: 12,
                  padding: "14px 28px",
                }}
              >
                {exported ? "Exported ✓" : "Export .docx"}
              </span>
            </Pop>
          </div>
        </div>

        <Cursor
          path={[
            { f: T.actMove, x: 1200, y: 900 },
            { f: T.accept - 10, x: 1480, y: 570 },
            { f: T.reject - 10, x: 1480, y: 650 },
            { f: T.exportClick - 10, x: 1450, y: 730 },
          ]}
          clicks={[T.accept, T.reject, T.exportClick]}
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
          <BigText delay={T.outro + 8} size={104}>
            Your playbook. Your call.
          </BigText>
          <div style={{ fontFamily: fonts.body, fontSize: 30, color: kc.muted }}>
            Every suggestion traceable, every decision on the record.
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
