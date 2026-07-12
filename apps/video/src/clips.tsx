import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, Cursor, Pop, Scan, usePulse } from "./kinetic";

// Feature clips for the marketing /features page — one short, loop-friendly
// panel per feature, drawn in the same card language as the landing figures.
// Each clip is a single product moment (a question answered, a table filling,
// a redline accepted), 1200×900 @30fps, fading back to blank so the loop
// restarts clean.

export const CLIP = { w: 1200, h: 900, fps: 30 } as const;

export const lin = (f: number, a: number, b: number, c = 0, d = 1) =>
  interpolate(f, [a, b], [c, d], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });
export const ease = (f: number, a: number, b: number, c = 0, d = 1) =>
  interpolate(f, [a, b], [c, d], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut((t) => Easing.cubic(t)),
  });

// Card chrome shared by every clip: header bar + content, whole clip fades out
// near `dur` so the loop lands back on the empty card.
export const Panel: React.FC<{
  dur: number;
  title: string;
  accent: React.ReactNode;
  children: React.ReactNode;
}> = ({ dur, title, accent, children }) => {
  const f = useCurrentFrame();
  const out = 1 - ease(f, dur - 16, dur - 2);
  return (
    <AbsoluteFill style={{ background: kc.panel, padding: 48 }}>
      <div
        style={{
          flex: 1,
          background: kc.paper,
          border: `1px solid ${kc.line}`,
          borderRadius: 22,
          boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
          overflow: "hidden",
          display: "flex",
          flexDirection: "column",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            borderBottom: `1px solid ${kc.line}`,
            padding: "26px 36px",
          }}
        >
          <span style={{ fontFamily: fonts.body, fontWeight: 600, fontSize: 28, color: kc.text }}>
            {title}
          </span>
          <span style={{ fontFamily: fonts.mono, fontSize: 24, color: kc.muted }}>{accent}</span>
        </div>
        <div style={{ flex: 1, position: "relative", opacity: out }}>{children}</div>
      </div>
    </AbsoluteFill>
  );
};

// Frame-driven typewriter.
export const Type: React.FC<{
  text: string;
  f0: number;
  cps?: number;
  style?: React.CSSProperties;
}> = ({ text, f0, cps = 1.4, style }) => {
  const f = useCurrentFrame();
  const n = Math.max(0, Math.floor((f - f0) * cps));
  return <span style={style}>{text.slice(0, n)}</span>;
};

// ---- 01 · Assistant: ask, get a cited answer ----

export const ASSISTANT_FRAMES = 260;
export const AssistantClip: React.FC = () => {
  const f = useCurrentFrame();
  const q = "Does the NDA survive termination?";
  const a =
    "Yes — confidentiality obligations survive for three years after termination of the agreement.";
  const qDone = 20 + q.length / 1.6;
  const pulse = usePulse(qDone + 90, 40);
  return (
    <Panel dur={ASSISTANT_FRAMES} title="Acme Acquisition · Assistant" accent="on your key">
      <div style={{ padding: "40px 36px", display: "flex", flexDirection: "column", gap: 30 }}>
        <div
          style={{
            alignSelf: "flex-end",
            background: kc.panel,
            borderRadius: 16,
            padding: "20px 28px",
            fontFamily: fonts.body,
            fontSize: 32,
            color: kc.text,
            minHeight: 74,
            maxWidth: 760,
          }}
        >
          <Type text={q} f0={20} cps={1.6} />
        </div>
        <div style={{ maxWidth: 860, opacity: lin(f, qDone + 14, qDone + 22) }}>
          <div style={{ fontFamily: fonts.body, fontSize: 32, lineHeight: 1.55, color: kc.muted }}>
            <Type text={a} f0={qDone + 20} cps={2.2} />
          </div>
          <div style={{ display: "flex", gap: 14, marginTop: 26 }}>
            {["NDA.docx §7.2", "MSA §14.1"].map((c, i) => (
              <Pop key={c} delay={qDone + 70 + i * 8}>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 23,
                    color: kc.text,
                    border: `1px solid ${kc.line}`,
                    borderRadius: 8,
                    padding: "8px 16px",
                    boxShadow: i === 0 ? `0 0 0 ${pulse * 4}px rgba(22,22,26,0.08)` : undefined,
                  }}
                >
                  {c}
                </span>
              </Pop>
            ))}
          </div>
        </div>
      </div>
    </Panel>
  );
};

// ---- 02 · Tabular review: the table fills, outliers surface ----

const R_ROWS = Array.from({ length: 9 }, (_, i) => ({
  doc: `acme-nda-${String(38 + i).padStart(3, "0")}.docx`,
  flagged: i === 4,
  law: i === 6 ? "New York" : "Delaware",
}));

export const REVIEW_FRAMES = 280;
export const ReviewClip: React.FC = () => {
  const f = useCurrentFrame();
  const run = 30; // values start streaming
  const reviewed = Math.round(lin(f, run, run + 150) * 100);
  const pulse = usePulse(run + 170, 40);
  return (
    <Panel
      dur={REVIEW_FRAMES}
      title="Contract review · 100 documents"
      accent={
        <span style={{ color: reviewed >= 100 ? kc.red : kc.muted }}>
          {reviewed >= 100 ? "3 flagged" : `${reviewed} of 100 reviewed`}
        </span>
      }
    >
      <div style={{ padding: "28px 36px", position: "relative" }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.6fr 1.1fr 1fr",
            gap: 20,
            paddingBottom: 18,
            fontFamily: fonts.mono,
            fontSize: 22,
            color: kc.muted,
          }}
        >
          <span>Document</span>
          <span>Indemnity capped?</span>
          <span>Governing law</span>
        </div>
        {R_ROWS.map((r, i) => {
          const vIn = lin(f, run + 14 + i * 12, run + 26 + i * 12);
          return (
            <div
              key={r.doc}
              style={{
                display: "grid",
                gridTemplateColumns: "1.6fr 1.1fr 1fr",
                gap: 20,
                alignItems: "center",
                height: 62,
                borderTop: `1px solid ${kc.line}`,
                fontFamily: fonts.body,
                fontSize: 27,
                background: r.flagged ? `rgba(229,72,77,${0.05 + pulse * 0.06})` : undefined,
              }}
            >
              <span style={{ color: kc.text }}>{r.doc}</span>
              <span
                style={{
                  opacity: vIn,
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  color: r.flagged ? kc.red : kc.text,
                  fontWeight: r.flagged ? 700 : 400,
                }}
              >
                <span
                  style={{
                    width: 12,
                    height: 12,
                    borderRadius: 99,
                    background: r.flagged ? kc.red : kc.green,
                  }}
                />
                {r.flagged ? "No" : "Yes"}
              </span>
              <span style={{ opacity: vIn, color: kc.muted }}>{r.law}</span>
            </div>
          );
        })}
        <Scan f0={run} f1={run + 120} />
      </div>
    </Panel>
  );
};

// ---- 03 · Redline: markup lands, gets accepted ----

export const REDLINE_FRAMES = 280;
export const RedlineClip: React.FC = () => {
  const f = useCurrentFrame();
  const strike1 = ease(f, 50, 70); // strikethrough draws
  const ins1 = lin(f, 66, 78);
  const strike2 = ease(f, 96, 112);
  const ins2 = lin(f, 108, 120);
  const acceptAt = 190;
  const accepted = ease(f, acceptAt, acceptAt + 14);
  const del = (t: string, p: number) => (
    <span style={{ position: "relative", color: kc.muted, whiteSpace: "nowrap" }}>
      {t}
      <span
        style={{
          position: "absolute",
          left: 0,
          top: "54%",
          height: 3,
          width: `${p * 100}%`,
          background: kc.red,
        }}
      />
    </span>
  );
  const ins = (t: string, p: number) => (
    <span
      style={{
        opacity: p,
        color: kc.text,
        fontWeight: 600,
        background: `rgba(22,22,26,${0.06 * (1 - accepted)})`,
        borderRadius: 6,
        padding: "0 6px",
      }}
    >
      {t}
    </span>
  );
  return (
    <Panel
      dur={REDLINE_FRAMES}
      title="Services Agreement · §9 Liability"
      accent={
        <span style={{ color: accepted > 0.5 ? kc.green : kc.muted }}>
          {accepted > 0.5 ? "2 accepted" : "2 suggestions"}
        </span>
      }
    >
      <div
        style={{
          padding: "44px 40px",
          fontFamily: fonts.body,
          fontSize: 33,
          lineHeight: 1.9,
          color: kc.muted,
          maxWidth: 1040,
        }}
      >
        Liability under this Agreement is {accepted > 0.5 ? null : del("unlimited", strike1)}{" "}
        {ins("capped at fees paid in the prior 12 months", ins1)}, except for breach of
        confidentiality. Either party may terminate on {accepted > 0.5 ? null : del("10", strike2)}{" "}
        {ins("30", ins2)} days&rsquo; written notice.
        <Scan f0={30} f1={120} />
      </div>
      <Cursor
        path={[
          { f: 140, x: 980, y: 700 },
          { f: acceptAt - 8, x: 900, y: 560 },
        ]}
        clicks={[acceptAt]}
      />
      <Pop delay={140} style={{ position: "absolute", left: 760, top: 520 }}>
        <span
          style={{
            fontFamily: fonts.body,
            fontWeight: 600,
            fontSize: 26,
            color: accepted > 0.5 ? "#fff" : kc.text,
            background: accepted > 0.5 ? kc.green : kc.paper,
            border: `1px solid ${accepted > 0.5 ? kc.green : kc.line}`,
            borderRadius: 12,
            padding: "14px 28px",
            boxShadow: "0 10px 30px rgba(0,0,0,0.12)",
          }}
        >
          {accepted > 0.5 ? "Accepted" : "Accept both"}
        </span>
      </Pop>
    </Panel>
  );
};

// ---- 04 · Workflows: one click runs the steps ----

const W_STEPS = [
  "Pull indemnity, cap, and governing law into a table",
  "Redline off-playbook clauses",
  "Draft the summary memo",
];

export const WORKFLOW_FRAMES = 280;
export const WorkflowClip: React.FC = () => {
  const f = useCurrentFrame();
  const runAt = 60;
  const stepDone = (i: number) => runAt + 45 + i * 50;
  return (
    <Panel
      dur={WORKFLOW_FRAMES}
      title="Workflow · NDA intake"
      accent={f > runAt ? "running" : "ready"}
    >
      <div style={{ padding: "34px 36px" }}>
        {W_STEPS.map((s, i) => {
          const active = f >= runAt + 6 + i * 50 && f < stepDone(i);
          const done = f >= stepDone(i);
          return (
            <div
              key={s}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 26,
                height: 96,
                borderTop: i ? `1px solid ${kc.line}` : "none",
              }}
            >
              <span
                style={{
                  fontFamily: fonts.heading,
                  fontSize: 40,
                  color: done ? kc.green : active ? kc.text : kc.muted,
                  width: 64,
                }}
              >
                {done ? "✓" : `0${i + 1}`}
              </span>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontSize: 30,
                  color: done || active ? kc.text : kc.muted,
                }}
              >
                {s}
              </span>
              {active && (
                <span
                  style={{
                    marginLeft: "auto",
                    fontFamily: fonts.mono,
                    fontSize: 22,
                    color: kc.muted,
                    opacity: shimmer(f),
                  }}
                >
                  working…
                </span>
              )}
            </div>
          );
        })}
      </div>
      <Cursor
        path={[
          { f: 16, x: 700, y: 760 },
          { f: runAt - 6, x: 1020, y: 740 },
        ]}
        clicks={[runAt]}
      />
      <div style={{ position: "absolute", left: 940, top: 706 }}>
        <span
          style={{
            fontFamily: fonts.body,
            fontWeight: 600,
            fontSize: 28,
            color: "#fff",
            background: f > runAt ? kc.muted : kc.ink,
            borderRadius: 12,
            padding: "16px 40px",
          }}
        >
          {f > runAt ? "Running…" : "Run"}
        </span>
      </div>
    </Panel>
  );
};
// Hook-free shimmer for the "working…" label (usePulse is a hook; this row
// mounts conditionally, so compute from the frame we already have).
const shimmer = (f: number) => Math.sin((f / 24) * Math.PI * 2) * 0.25 + 0.65;

// ---- 05 · Clause library: positions, with a fallback promoted ----

const L_CLAUSES = [
  { name: "Limitation of liability — mutual cap", status: "Approved" },
  { name: "Confidentiality — 3-year survival", status: "Approved" },
  { name: "Indemnity — fees-paid cap", status: "Fallback" },
];

export const LIBRARY_FRAMES = 240;
export const LibraryClip: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <Panel dur={LIBRARY_FRAMES} title="Clause library" accent="shared with the firm">
      <div style={{ padding: "30px 36px" }}>
        {L_CLAUSES.map((c, i) => {
          const fallback = c.status === "Fallback";
          return (
            <Pop key={c.name} delay={24 + i * 16}>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 20,
                  height: 92,
                  borderTop: i ? `1px solid ${kc.line}` : "none",
                }}
              >
                <span style={{ fontFamily: fonts.body, fontSize: 30, color: kc.text }}>
                  {c.name}
                </span>
                <span
                  style={{
                    fontFamily: fonts.mono,
                    fontSize: 22,
                    color: fallback ? kc.text : kc.muted,
                    border: `1px solid ${fallback ? kc.text : kc.line}`,
                    borderRadius: 8,
                    padding: "8px 18px",
                    opacity: lin(f, 40 + i * 16, 52 + i * 16),
                  }}
                >
                  {c.status}
                </span>
              </div>
            </Pop>
          );
        })}
        <Pop delay={120}>
          <div
            style={{
              marginTop: 26,
              fontFamily: fonts.body,
              fontSize: 26,
              color: kc.muted,
              borderTop: `1px solid ${kc.line}`,
              paddingTop: 26,
            }}
          >
            Every markup starts from positions the firm already decided on.
          </div>
        </Pop>
      </div>
    </Panel>
  );
};

// ---- 06 · Audit trail: a new commit lands on the record ----

export const AUDIT_FRAMES = 260;
export const AuditClip: React.FC = () => {
  const f = useCurrentFrame();
  const newIn = ease(f, 90, 110);
  const pulse = usePulse(110, 44);
  return (
    <Panel dur={AUDIT_FRAMES} title="Acme Acquisition · NDA.docx" accent="change history">
      <div style={{ padding: "26px 36px", display: "flex", flexDirection: "column" }}>
        <div
          style={{
            display: "flex",
            gap: 22,
            padding: "26px 0",
            opacity: newIn,
            transform: `translateY(${(1 - newIn) * -18}px)`,
          }}
        >
          <span
            style={{
              marginTop: 12,
              width: 14,
              height: 14,
              borderRadius: 99,
              background: kc.text,
              boxShadow: `0 0 0 ${pulse * 6}px rgba(22,22,26,0.10)`,
              flexShrink: 0,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: fonts.body, fontSize: 30, color: kc.text }}>
              Accepted liability cap at $2M
            </span>
            <span style={{ fontFamily: fonts.mono, fontSize: 22, color: kc.muted }}>
              M. Reyes · today, 2:14 PM
            </span>
            <span style={{ fontFamily: fonts.body, fontSize: 26, opacity: lin(f, 116, 128) }}>
              <span style={{ color: kc.muted }}>Liability cap: </span>
              <span style={{ color: kc.red, textDecoration: "line-through" }}>$5,000,000</span>
              <span style={{ color: kc.muted }}> → </span>
              <span style={{ color: kc.text, fontWeight: 600 }}>$2,000,000</span>
            </span>
          </div>
        </div>
        <div
          style={{ borderTop: `1px solid ${kc.line}`, display: "flex", gap: 22, padding: "26px 0" }}
        >
          <span
            style={{
              marginTop: 12,
              width: 14,
              height: 14,
              borderRadius: 99,
              border: `2px solid ${kc.muted}`,
              flexShrink: 0,
            }}
          />
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <span style={{ fontFamily: fonts.body, fontSize: 30, color: kc.text }}>
              Reviewed NDA — flagged 4 unusual terms
            </span>
            <span style={{ fontFamily: fonts.mono, fontSize: 22, color: kc.muted }}>
              AI assistant · today, 1:58 PM
            </span>
            <span style={{ fontFamily: fonts.body, fontSize: 26 }}>
              <span style={{ color: kc.muted }}>Term: </span>
              <span style={{ color: kc.red, textDecoration: "line-through" }}>5 years</span>
              <span style={{ color: kc.muted }}> → </span>
              <span style={{ color: kc.text, fontWeight: 600 }}>3 years</span>
            </span>
          </div>
        </div>
      </div>
    </Panel>
  );
};

// ---- 07 · Bring your own agent: MCP actions land on the record ----

const M_ACTIONS = ["review_document · recorded", "redline_clause · recorded", "commit · recorded"];

export const AGENT_FRAMES = 260;
export const AgentClip: React.FC = () => {
  const f = useCurrentFrame();
  const wire = ease(f, 46, 70);
  return (
    <Panel dur={AGENT_FRAMES} title="Connected agents" accent="over MCP">
      <div style={{ padding: "44px 40px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 24 }}>
          {["ChatGPT", "Claude"].map((n, i) => (
            <Pop key={n} delay={14 + i * 8}>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontSize: 30,
                  color: kc.text,
                  border: `1px solid ${kc.line}`,
                  borderRadius: 12,
                  padding: "16px 30px",
                }}
              >
                {n}
              </span>
            </Pop>
          ))}
          <span style={{ width: 90, height: 2, background: kc.text, opacity: wire }} />
          <Pop delay={64}>
            <span
              style={{
                fontFamily: fonts.body,
                fontWeight: 600,
                fontSize: 30,
                color: "#fff",
                background: kc.ink,
                borderRadius: 12,
                padding: "16px 30px",
              }}
            >
              gitmatter
            </span>
          </Pop>
        </div>
        <div style={{ marginTop: 50, display: "flex", flexDirection: "column", gap: 18 }}>
          {M_ACTIONS.map((a, i) => (
            <div
              key={a}
              style={{
                fontFamily: fonts.mono,
                fontSize: 25,
                color: kc.muted,
                opacity: lin(f, 100 + i * 34, 112 + i * 34),
                display: "flex",
                alignItems: "center",
                gap: 16,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 99, background: kc.green }} />
              {a}
            </div>
          ))}
        </div>
        <div
          style={{
            marginTop: 46,
            fontFamily: fonts.body,
            fontSize: 26,
            color: kc.muted,
            opacity: lin(f, 210, 224),
          }}
        >
          The agent drives the tools. gitmatter records every step.
        </div>
      </div>
    </Panel>
  );
};
