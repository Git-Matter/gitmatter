import React from "react";
import { AbsoluteFill, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, BigText, Kicker, Pop } from "./kinetic";
import { ease, lin, Type } from "./clips";

// Concept 1 — MCP live session: "Your agent already works here". Split screen:
// the firm's own agent (Claude) on the left drives gitmatter on the right over
// MCP. Every tool call lands a row in the table and a line on the audit log.
// 1920×1080 @30fps, ~45s.

const T = {
  introEnd: 110,
  panels: 120,
  ask: 170, // user message types
  tool1: 330, // list_documents
  tool2: 420, // run_review — table streams
  fillEnd: 700,
  tool3: 740, // get_blame
  answer: 830, // Claude's final answer streams
  outro: 1180,
  end: 1350,
};
export const MCP_FRAMES = T.end;

const NDAS = Array.from({ length: 8 }, (_, i) => ({
  doc: `acme-nda-${String(i + 4).padStart(3, "0")}.docx`,
  flagged: i === 3 || i === 6,
}));

const TOOLS = [
  { f: T.tool1, name: "list_documents", note: "12 documents · Acme Corp" },
  { f: T.tool2, name: "run_review", note: "Indemnity capped? · 12 docs" },
  { f: T.tool3, name: "get_blame", note: "acme-nda-007 · indemnity cell" },
];

const card: React.CSSProperties = {
  background: kc.paper,
  border: `1px solid ${kc.line}`,
  borderRadius: 20,
  boxShadow: "0 30px 80px rgba(0,0,0,0.10)",
  overflow: "hidden",
  display: "flex",
  flexDirection: "column",
};
const head: React.CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "space-between",
  borderBottom: `1px solid ${kc.line}`,
  padding: "20px 28px",
  fontFamily: fonts.body,
  fontWeight: 600,
  fontSize: 24,
  color: kc.text,
};
const mono = (size: number, color: string): React.CSSProperties => ({
  fontFamily: fonts.mono,
  fontSize: size,
  color,
});

const AgentPane: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ ...card, position: "absolute", left: 90, top: 150, width: 800, height: 780 }}>
      <div style={head}>
        <span>Claude</span>
        <span style={mono(19, kc.muted)}>the firm&rsquo;s own agent</span>
      </div>
      <div style={{ padding: "30px 32px", display: "flex", flexDirection: "column", gap: 22 }}>
        <div
          style={{
            alignSelf: "flex-end",
            background: kc.panel,
            borderRadius: 14,
            padding: "16px 22px",
            fontFamily: fonts.body,
            fontSize: 26,
            color: kc.text,
            maxWidth: 620,
            minHeight: 60,
          }}
        >
          <Type text="Review the 12 Acme NDAs for uncapped indemnity." f0={T.ask} cps={1.5} />
        </div>
        {TOOLS.map((t) => (
          <Pop key={t.name} delay={t.f}>
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 14,
                border: `1px solid ${kc.line}`,
                borderRadius: 12,
                padding: "14px 20px",
                width: "fit-content",
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 99, background: kc.green }} />
              <span style={mono(22, kc.text)}>{t.name}</span>
              <span style={mono(20, kc.muted)}>{t.note}</span>
            </div>
          </Pop>
        ))}
        <div
          style={{
            fontFamily: fonts.body,
            fontSize: 26,
            lineHeight: 1.55,
            color: kc.muted,
            maxWidth: 700,
            opacity: lin(f, T.answer - 6, T.answer),
          }}
        >
          <Type
            text="2 of 12 NDAs have uncapped indemnity — acme-nda-007 and acme-nda-011. Both flagged in the review, with the source clause linked."
            f0={T.answer}
            cps={2.2}
          />
        </div>
      </div>
    </div>
  );
};

const AppPane: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ ...card, position: "absolute", left: 950, top: 150, width: 880, height: 780 }}>
      <div style={head}>
        <span>
          git<span style={{ color: kc.muted }}>matter</span> · Reviews
        </span>
        <span style={mono(19, f > T.fillEnd ? kc.red : kc.muted)}>
          {f > T.fillEnd ? "2 flagged" : f > T.tool2 ? "running…" : "idle"}
        </span>
      </div>
      <div style={{ padding: "24px 30px", flex: 1 }}>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: "1.7fr 1fr",
            gap: 18,
            paddingBottom: 14,
            ...mono(19, kc.muted),
          }}
        >
          <span>Document</span>
          <span>Indemnity capped?</span>
        </div>
        {NDAS.map((r, i) => {
          const vIn = lin(f, T.tool2 + 30 + i * 28, T.tool2 + 44 + i * 28);
          return (
            <div
              key={r.doc}
              style={{
                display: "grid",
                gridTemplateColumns: "1.7fr 1fr",
                gap: 18,
                alignItems: "center",
                height: 56,
                borderTop: `1px solid ${kc.line}`,
                fontFamily: fonts.body,
                fontSize: 24,
                opacity: lin(f, T.tool1 + 10 + i * 6, T.tool1 + 22 + i * 6),
              }}
            >
              <span style={{ color: kc.text }}>{r.doc}</span>
              <span
                style={{
                  opacity: vIn,
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  color: r.flagged ? kc.red : kc.text,
                  fontWeight: r.flagged ? 700 : 400,
                }}
              >
                <span
                  style={{
                    width: 11,
                    height: 11,
                    borderRadius: 99,
                    background: r.flagged ? kc.red : kc.green,
                  }}
                />
                {r.flagged ? "No" : "Yes"}
              </span>
            </div>
          );
        })}
      </div>
      {/* audit log strip — a line lands per agent action */}
      <div style={{ borderTop: `1px solid ${kc.line}`, padding: "18px 30px", minHeight: 150 }}>
        <div style={{ ...mono(18, kc.muted), marginBottom: 10 }}>audit log</div>
        {TOOLS.map((t) => (
          <div
            key={t.name}
            style={{
              ...mono(20, kc.muted),
              display: "flex",
              gap: 12,
              alignItems: "center",
              opacity: lin(f, t.f + 12, t.f + 22),
              paddingBottom: 6,
            }}
          >
            <span style={{ width: 8, height: 8, borderRadius: 99, background: kc.text }} />
            <span style={{ color: kc.text }}>Claude</span> · {t.name} · recorded
          </div>
        ))}
      </div>
    </div>
  );
};

export const McpSession: React.FC = () => {
  const f = useCurrentFrame();
  const introOut = ease(f, T.introEnd - 16, T.introEnd + 4);
  const panelsIn = ease(f, T.panels, T.panels + 20);
  const outroIn = ease(f, T.outro, T.outro + 18);
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
          <Kicker delay={10}>bring your own agent</Kicker>
          <BigText delay={26} size={96}>
            Your agent already works here.
          </BigText>
        </AbsoluteFill>
      )}
      <AbsoluteFill
        style={{
          opacity: panelsIn * (1 - outroIn),
          transform: `translateY(${(1 - panelsIn) * 40}px)`,
        }}
      >
        <AgentPane />
        <AppPane />
        <div
          style={{
            position: "absolute",
            left: 895,
            top: 520,
            width: 50,
            height: 2,
            background: kc.text,
            opacity: lin(f, T.tool1, T.tool1 + 10),
          }}
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
            Your agent. Your key. Your record.
          </BigText>
          <div style={{ fontFamily: fonts.heading, fontWeight: 700, fontSize: 56, color: kc.text }}>
            git<span style={{ color: kc.muted }}>matter</span>
          </div>
        </AbsoluteFill>
      )}
    </AbsoluteFill>
  );
};
