import { AbsoluteFill } from "remotion";
import { theme, fonts } from "../theme";
import { Eyebrow, Rise, Typed } from "../components";

// Step one — Jane states the work inside gitmatter's own assistant. The native
// UI is the hero; using an outside client (Claude / ChatGPT over MCP) is a
// secondary feature, noted as a footnote.
export const Ask: React.FC = () => (
  <AbsoluteFill
    style={{
      backgroundColor: theme.ink,
      padding: 96,
      flexDirection: "column",
      justifyContent: "center",
      gap: 26,
    }}
  >
    <Rise at={4}>
      <Eyebrow>step one · the ask</Eyebrow>
    </Rise>
    <Rise at={12}>
      <div style={{ fontFamily: fonts.heading, fontSize: 44, color: theme.text }}>
        Jane works inside gitmatter.
      </div>
    </Rise>
    <Rise at={24} style={{ marginTop: 8 }}>
      <div
        style={{
          backgroundColor: theme.panel,
          border: `1px solid ${theme.border}`,
          borderRadius: 16,
          overflow: "hidden",
        }}
      >
        {/* app chrome — wordmark + matter breadcrumb */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            padding: "18px 24px",
            borderBottom: `1px solid ${theme.border}`,
          }}
        >
          <span style={{ fontFamily: fonts.heading, fontSize: 22, color: theme.text }}>
            git<span style={{ color: theme.bronze }}>counsel</span>
          </span>
          <span style={{ fontFamily: fonts.mono, fontSize: 16, color: theme.muted }}>
            / Acme Corp / NDA review
          </span>
        </div>
        {/* native assistant composer */}
        <div style={{ padding: 28, display: "flex", flexDirection: "column", gap: 18 }}>
          <div
            style={{ fontFamily: fonts.mono, fontSize: 15, color: theme.muted, letterSpacing: 1 }}
          >
            Assistant
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 16,
              backgroundColor: theme.ink,
              border: `1px solid ${theme.border}`,
              borderRadius: 12,
              padding: "20px 22px",
            }}
          >
            <span
              style={{
                flex: 1,
                fontFamily: fonts.body,
                fontSize: 26,
                lineHeight: 1.45,
                color: theme.text,
              }}
            >
              <Typed
                start={40}
                cps={0.6}
                text={"Review the three Acme NDAs and flag any non-standard indemnity."}
              />
            </span>
            <span style={{ fontFamily: fonts.mono, fontSize: 16, color: theme.muted }}>↵ send</span>
          </div>
        </div>
      </div>
    </Rise>
    <Rise at={120} style={{ marginTop: 4 }}>
      <div style={{ fontFamily: fonts.mono, fontSize: 18, color: theme.muted }}>
        prefer your own assistant? plug in Claude or ChatGPT over MCP
      </div>
    </Rise>
  </AbsoluteFill>
);
