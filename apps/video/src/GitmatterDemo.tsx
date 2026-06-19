import React from "react";
import { AbsoluteFill, Easing, interpolate, useCurrentFrame } from "remotion";
import { fonts } from "./theme";
import { kc, Cursor, Scan, Vignette, usePulse } from "./kinetic";

// gitmatter — one continuous session at real scale, in the real UI. Jane has 100
// Acme contracts. gitmatter runs one tabular review across all of them; the table
// streams as it fills; 3 rows come back "No" on indemnity; the camera lands on the
// one that bites and shows the blame trail. The review grid mirrors the actual app
// (Document × question columns), not an abstract chart.

const ease = (f: number, a: number, b: number, c = 0, d = 1) =>
  interpolate(f, [a, b], [c, d], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut((t) => Easing.cubic(t)),
  });
const lin = (f: number, a: number, b: number, c = 0, d = 1) =>
  interpolate(f, [a, b], [c, d], { extrapolateLeft: "clamp", extrapolateRight: "clamp" });

const T = {
  introEnd: 100,
  appIn: 104,
  docs: 140, // documents list fills
  tabClick: 268, // cursor clicks Reviews
  runClick: 346, // cursor clicks Run
  fill: 358, // table streams + fills
  settle: 470, // scroll settles on the flagged row
  dive: 500, // camera dive to the flagged cell
  diveEnd: 548,
  blame: 566, // blame popover
  pull: 700,
  brand: 784,
  end: 904,
};
export const DEMO_FRAMES = T.end;

// table geometry (canvas px)
const TBL = { x: 420, top: 318, w: 1372, head: 50, rowH: 56, vp: 560 };
const COLS = "1.6fr 1.05fr 0.95fr 1.5fr";
const HERO = 41; // flagged row we dive into
const FLAGS = [7, 41, 78];
// hero sits centred in the viewport when scroll settles
const heroScreenY = TBL.top + TBL.head + TBL.vp / 2;
const FLAG = { x: 0.43, y: heroScreenY / 1080 };

const NDA = (i: number) => `acme-nda-${String(i + 1).padStart(3, "0")}.docx`;
const RISK = ["Capped at 12-mo fees", "Mutual cap", "Standard mutual", "Capped at fees paid"];
const rows = Array.from({ length: 100 }, (_, i) => {
  const flagged = FLAGS.includes(i);
  return {
    name: NDA(i),
    flagged,
    cap: flagged ? "No" : "Yes",
    law: "Delaware",
    risk: flagged ? "Unlimited, no-fault indemnity" : RISK[i % 4],
  };
});

// ---- atoms ----
const Chip: React.FC<{ children: React.ReactNode; tone?: "muted" | "ink" | "red" }> = ({
  children,
  tone = "muted",
}) => {
  const m = {
    muted: { bg: kc.panel, fg: kc.muted, bd: kc.line },
    ink: { bg: kc.ink, fg: "#fff", bd: kc.ink },
    red: { bg: "#fdeaea", fg: kc.red, bd: "#f6c9cb" },
  }[tone];
  return (
    <span
      style={{
        fontFamily: fonts.mono,
        fontSize: 18,
        padding: "6px 14px",
        borderRadius: 999,
        background: m.bg,
        color: m.fg,
        border: `1px solid ${m.bd}`,
        whiteSpace: "nowrap",
      }}
    >
      {children}
    </span>
  );
};
const NavItem: React.FC<{ label: string; active?: boolean }> = ({ label, active }) => (
  <div
    style={{
      fontFamily: fonts.body,
      fontSize: 22,
      color: active ? kc.text : kc.muted,
      fontWeight: active ? 600 : 400,
      background: active ? kc.panel : "transparent",
      borderRadius: 10,
      padding: "12px 16px",
    }}
  >
    {label}
  </div>
);

// ---- the review table (rows × question columns) ----
const ReviewTable: React.FC = () => {
  const f = useCurrentFrame();
  const running = f >= T.runClick + 3;
  const valsIn = lin(f, T.runClick, T.runClick + 26); // cell values fade in
  const dim = 1 - ease(f, T.dive, T.diveEnd) * 0.8;
  // scroll: stream down during fill, settle with hero centred
  const settleY = Math.min(HERO * TBL.rowH - (TBL.vp / 2 - TBL.rowH / 2), 100 * TBL.rowH - TBL.vp);
  const scrollY = ease(f, T.fill, T.settle, 0, settleY);

  return (
    <div style={{ position: "absolute", left: TBL.x, top: TBL.top }}>
      {/* column header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: COLS,
          columnGap: 24,
          width: TBL.w,
          height: TBL.head,
          alignItems: "center",
        }}
      >
        {["Document", "Indemnity capped?", "Governing law", "Key risk"].map((h) => (
          <div key={h} style={{ fontFamily: fonts.mono, fontSize: 19, color: kc.muted }}>
            {h}
          </div>
        ))}
      </div>
      {/* clipped body */}
      <div style={{ width: TBL.w, height: TBL.vp, overflow: "hidden", position: "relative" }}>
        <div style={{ transform: `translateY(${-scrollY}px)` }}>
          {rows.map((r, i) => {
            const isHero = i === HERO;
            return (
              <div
                key={i}
                style={{
                  display: "grid",
                  gridTemplateColumns: COLS,
                  columnGap: 24,
                  height: TBL.rowH,
                  alignItems: "center",
                  borderBottom: `1px solid ${kc.line}`,
                  opacity: isHero ? 1 : dim,
                }}
              >
                <div style={{ fontFamily: fonts.body, fontSize: 24, color: kc.text }}>{r.name}</div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    opacity: valsIn,
                    fontFamily: fonts.body,
                    fontSize: 24,
                    fontWeight: r.flagged ? 700 : 400,
                    color: r.flagged ? kc.red : kc.text,
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
                  {r.cap}
                </div>
                <div
                  style={{ fontFamily: fonts.body, fontSize: 24, color: kc.text, opacity: valsIn }}
                >
                  {r.law}
                </div>
                <div
                  style={{ fontFamily: fonts.body, fontSize: 24, color: kc.text, opacity: valsIn }}
                >
                  {r.risk}
                </div>
              </div>
            );
          })}
        </div>
        {/* fade top/bottom edges of the scroll viewport */}
        <div
          style={{
            position: "absolute",
            top: 0,
            left: 0,
            right: 0,
            height: 40,
            background: `linear-gradient(${kc.paper}, rgba(255,255,255,0))`,
          }}
        />
        <div
          style={{
            position: "absolute",
            bottom: 0,
            left: 0,
            right: 0,
            height: 40,
            background: `linear-gradient(rgba(255,255,255,0), ${kc.paper})`,
          }}
        />
        {running && <Scan f0={T.fill} f1={T.fill + 60} />}
      </div>
    </div>
  );
};

// documents list (real list: name · type · status)
const DocsList: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: TBL.x, top: TBL.top }}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "2.4fr 0.6fr 0.7fr",
          columnGap: 24,
          width: TBL.w,
          height: TBL.head,
          alignItems: "center",
        }}
      >
        {["Name", "Type", "Status"].map((h) => (
          <div key={h} style={{ fontFamily: fonts.mono, fontSize: 19, color: kc.muted }}>
            {h}
          </div>
        ))}
      </div>
      <div style={{ width: TBL.w, height: TBL.vp, overflow: "hidden" }}>
        {rows.slice(0, 10).map((r, i) => {
          const a = ease(f, T.docs + i * 5, T.docs + i * 5 + 12);
          const ready = lin(f, T.docs + 16 + i * 5, T.docs + 28 + i * 5);
          return (
            <div
              key={i}
              style={{
                display: "grid",
                gridTemplateColumns: "2.4fr 0.6fr 0.7fr",
                columnGap: 24,
                height: TBL.rowH,
                alignItems: "center",
                borderBottom: `1px solid ${kc.line}`,
                opacity: a,
                transform: `translateY(${(1 - a) * 12}px)`,
              }}
            >
              <div style={{ fontFamily: fonts.body, fontSize: 24, color: kc.text }}>{r.name}</div>
              <div style={{ fontFamily: fonts.mono, fontSize: 18, color: kc.muted }}>DOCX</div>
              <div style={{ opacity: ready }}>
                <Chip>● Ready</Chip>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
};

// header counter / results line
const TableHeader: React.FC = () => {
  const f = useCurrentFrame();
  const onReview = f >= T.tabClick + 2;
  const ingested = Math.round(lin(f, T.docs, T.docs + 56) * 100);
  const reviewed = Math.round(lin(f, T.fill, T.settle - 10) * 100);
  return (
    <div
      style={{
        position: "absolute",
        left: TBL.x,
        top: TBL.top - 54,
        display: "flex",
        alignItems: "center",
        gap: 14,
      }}
    >
      {!onReview ? (
        <>
          <span style={{ fontFamily: fonts.heading, fontSize: 28, color: kc.text }}>
            {ingested}
          </span>
          <span style={{ fontFamily: fonts.body, fontSize: 23, color: kc.muted }}>
            of 100 documents{ingested >= 100 ? " · Ready" : " · ingesting…"}
          </span>
        </>
      ) : (
        <>
          <span style={{ fontFamily: fonts.heading, fontSize: 28, color: kc.text }}>
            {reviewed}
          </span>
          <span style={{ fontFamily: fonts.body, fontSize: 23, color: kc.muted }}>
            of 100 reviewed
          </span>
          <span style={{ opacity: lin(f, T.settle - 24, T.settle - 6), marginLeft: 6 }}>
            <Chip tone="red">● 3 flagged</Chip>
          </span>
        </>
      )}
    </div>
  );
};

// ---- app window ----
const AppWindow: React.FC = () => {
  const f = useCurrentFrame();
  const onReviews = f >= T.tabClick + 2;
  const running = f >= T.runClick + 3;
  return (
    <div
      style={{
        position: "absolute",
        left: 80,
        top: 96,
        width: 1760,
        height: 888,
        background: kc.paper,
        border: `1px solid ${kc.line}`,
        borderRadius: 24,
        boxShadow: "0 50px 120px rgba(0,0,0,0.12)",
        overflow: "hidden",
        display: "flex",
      }}
    >
      <div
        style={{
          width: 300,
          borderRight: `1px solid ${kc.line}`,
          padding: "30px 22px",
          display: "flex",
          flexDirection: "column",
          gap: 6,
        }}
      >
        <div
          style={{
            fontFamily: fonts.heading,
            fontWeight: 700,
            fontSize: 30,
            color: kc.text,
            padding: "4px 12px 22px",
          }}
        >
          git<span style={{ color: kc.muted }}>matter</span>
        </div>
        {["New chat", "Reviews", "Workflows", "Documents", "Clients"].map((n) => (
          <NavItem key={n} label={n} active={onReviews && n === "Reviews"} />
        ))}
        <NavItem label="Matters" active={!onReviews} />
      </div>
      <div style={{ flex: 1, padding: "30px 40px", position: "relative" }}>
        <div style={{ fontFamily: fonts.mono, fontSize: 20, color: kc.muted }}>
          {onReviews ? "Reviews › " : "Matters › "}
          <span style={{ color: kc.text }}>Acme Corp — contract review</span>
        </div>
        <div
          style={{
            display: "flex",
            gap: 30,
            marginTop: 26,
            borderBottom: `1px solid ${kc.line}`,
            paddingBottom: 14,
          }}
        >
          {["Documents", "Reviews"].map((t) => {
            const act = onReviews ? t === "Reviews" : t === "Documents";
            return (
              <span
                key={t}
                style={{
                  fontFamily: fonts.body,
                  fontSize: 22,
                  color: act ? kc.text : kc.muted,
                  fontWeight: act ? 600 : 400,
                }}
              >
                {t}
              </span>
            );
          })}
          {onReviews && (
            <span style={{ marginLeft: "auto", display: "flex", gap: 14, alignItems: "center" }}>
              <Chip tone="ink">GPT-5.5</Chip>
              <span
                style={{
                  fontFamily: fonts.body,
                  fontWeight: 600,
                  fontSize: 22,
                  color: "#fff",
                  background: running ? kc.muted : kc.ink,
                  borderRadius: 10,
                  padding: "10px 24px",
                }}
              >
                {running ? "Running…" : "Run"}
              </span>
            </span>
          )}
        </div>
      </div>
      {/* content overlay (canvas coords; window origin is 80,96) */}
      <div style={{ position: "absolute", left: -80, top: -96, right: 0, bottom: 0 }}>
        <TableHeader />
        {onReviews ? <ReviewTable /> : <DocsList />}
      </div>
    </div>
  );
};

// ---- blame popover on the flagged cell ----
const BlamePopover: React.FC = () => {
  const f = useCurrentFrame();
  const pulse = usePulse(T.diveEnd, 30);
  const a = ease(f, T.blame, T.blame + 14) * (1 - lin(f, T.pull, T.pull + 16));
  if (a <= 0.001) return null;
  return (
    <div
      style={{
        position: "absolute",
        left: 760,
        top: heroScreenY + 36,
        width: 470,
        background: kc.paper,
        border: `1px solid ${kc.line}`,
        borderRadius: 14,
        boxShadow: `0 26px 64px rgba(0,0,0,0.22), 0 0 ${pulse * 26}px rgba(229,72,77,${0.12 + pulse * 0.25})`,
        padding: "20px 22px",
        opacity: a,
        transform: `translateY(${(1 - a) * 12}px)`,
        display: "flex",
        flexDirection: "column",
        gap: 8,
      }}
    >
      <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
        <span
          style={{
            fontFamily: fonts.body,
            fontWeight: 600,
            fontSize: 18,
            color: kc.text,
            background: kc.panel,
            borderRadius: 6,
            padding: "3px 10px",
          }}
        >
          Jane
        </span>
        <span style={{ fontFamily: fonts.mono, fontSize: 18, color: kc.muted }}>run_cell</span>
      </div>
      <div style={{ fontFamily: fonts.body, fontSize: 19, color: kc.text, lineHeight: 1.4 }}>
        Ran “Indemnity capped?” on {NDA(HERO)} with <b>gpt-5.5</b>
      </div>
      <div style={{ fontFamily: fonts.mono, fontSize: 16, color: kc.muted }}>
        6/19/2026, 10:49:02 AM
      </div>
    </div>
  );
};

// ---- cold open ----
const Rise: React.FC<{ a: number; b: number; children: React.ReactNode; dy?: number }> = ({
  a,
  b,
  children,
  dy = 34,
}) => {
  const f = useCurrentFrame();
  const t = ease(f, a, b);
  return (
    <div style={{ overflow: "hidden", padding: "0 4px" }}>
      <div style={{ transform: `translateY(${(1 - t) * dy}px)`, opacity: t }}>{children}</div>
    </div>
  );
};
const ColdOpen: React.FC = () => {
  const f = useCurrentFrame();
  const exit = ease(f, T.introEnd - 18, T.introEnd + 6);
  const grp = 1 - exit;
  if (grp <= 0.001) return null;
  const kick = lin(f, 6, 20) * (1 - lin(f, 40, 54));
  const line = ease(f, 60, 88);
  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        opacity: grp,
        transform: `translateY(${exit * -54}px)`,
      }}
    >
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 14 }}>
        <div
          style={{
            fontFamily: fonts.mono,
            fontSize: 20,
            letterSpacing: 6,
            textTransform: "uppercase",
            color: kc.muted,
            opacity: kick,
            transform: `translateY(${(1 - lin(f, 6, 20)) * -10}px)`,
            marginBottom: 6,
          }}
        >
          monday · 9:02am
        </div>
        <Rise a={24} b={46} dy={46}>
          <div
            style={{
              fontFamily: fonts.heading,
              fontWeight: 700,
              fontSize: 84,
              letterSpacing: -1,
              color: kc.text,
            }}
          >
            100 Acme contracts.
          </div>
        </Rise>
        <Rise a={44} b={66} dy={40}>
          <div style={{ fontFamily: fonts.heading, fontSize: 64, color: kc.muted }}>
            One deadline.
          </div>
        </Rise>
        <div
          style={{
            height: 2,
            width: 560,
            marginTop: 18,
            background: kc.line,
            position: "relative",
          }}
        >
          <div
            style={{ position: "absolute", inset: 0, width: `${line * 100}%`, background: kc.ink }}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
const Brand: React.FC = () => {
  const f = useCurrentFrame();
  const a = ease(f, T.brand, T.brand + 18);
  if (a <= 0.001) return null;
  return (
    <AbsoluteFill
      style={{
        background: kc.paper,
        alignItems: "center",
        justifyContent: "center",
        opacity: a,
        gap: 18,
      }}
    >
      <div
        style={{
          fontFamily: fonts.heading,
          fontWeight: 700,
          fontSize: 104,
          letterSpacing: -2,
          color: kc.text,
        }}
      >
        git<span style={{ color: kc.muted }}>matter</span>
      </div>
      <div style={{ fontFamily: fonts.body, fontSize: 32, color: kc.muted }}>
        Audited legal AI — at the scale you actually work.
      </div>
    </AbsoluteFill>
  );
};

// ---- captions ----
const lines: { a: number; b: number; t: string }[] = [
  { a: T.docs + 26, b: T.tabClick - 6, t: "Jane drops in 100 Acme contracts. All ingested." },
  { a: T.tabClick + 10, b: T.runClick - 6, t: "Same three questions — asked of all 100." },
  { a: T.runClick + 6, b: T.settle - 10, t: "gitmatter reviews every one in a single pass." },
  { a: T.dive + 10, b: T.blame - 4, t: "97 clear. 3 flagged. Here's the one that bites." },
  { a: T.blame + 14, b: T.pull - 4, t: "Who ran it, what, which model, when — on the record." },
  { a: T.pull + 10, b: T.brand - 6, t: "A hundred contracts, reviewed before lunch." },
];
const Caption: React.FC = () => {
  const f = useCurrentFrame();
  return (
    <div style={{ position: "absolute", left: 120, bottom: 64, right: 120 }}>
      {lines.map((l, i) => {
        const a = lin(f, l.a, l.a + 10) * (1 - lin(f, l.b, l.b + 10));
        if (a <= 0.001) return null;
        return (
          <div
            key={i}
            style={{
              position: "absolute",
              bottom: 0,
              left: 0,
              fontFamily: fonts.body,
              fontSize: 34,
              color: kc.text,
              opacity: a,
              transform: `translateY(${(1 - lin(f, l.a, l.a + 10)) * 10}px)`,
            }}
          >
            {l.t}
          </div>
        );
      })}
    </div>
  );
};

// ---- camera ----
const useCamera = () => {
  const f = useCurrentFrame();
  const scale = interpolate(f, [T.dive, T.diveEnd, T.pull, T.pull + 30], [1, 1.55, 1.55, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.inOut((t) => Easing.cubic(t)),
  });
  const tx = (0.5 - FLAG.x) * (scale - 1) * 100;
  const ty = (0.5 - FLAG.y) * (scale - 1) * 100;
  return `scale(${scale}) translate(${tx}%, ${ty}%)`;
};

export const GitmatterDemo: React.FC = () => {
  const f = useCurrentFrame();
  const cam = useCamera();
  const appOp = ease(f, T.appIn, T.appIn + 16) * (1 - ease(f, T.brand, T.brand + 16));
  const appEnter = ease(f, T.appIn, T.appIn + 20);
  const dive = ease(f, T.dive, T.diveEnd) * (1 - lin(f, T.pull, T.pull + 24));
  return (
    <AbsoluteFill style={{ backgroundColor: kc.paper }}>
      <ColdOpen />
      <AbsoluteFill
        style={{
          opacity: appOp,
          transform: `scale(${0.965 + appEnter * 0.035}) translateY(${(1 - appEnter) * 30}px)`,
        }}
      >
        <AbsoluteFill style={{ transform: cam, transformOrigin: "center" }}>
          <AppWindow />
          <BlamePopover />
        </AbsoluteFill>
        <Vignette strength={dive * 0.28} />
        <Cursor
          path={[
            { f: T.docs, x: 1500, y: 880 },
            { f: T.tabClick, x: 560, y: 300 },
            { f: T.runClick, x: 1640, y: 250 },
            { f: T.fill + 24, x: 1500, y: 820 },
          ]}
          clicks={[T.tabClick, T.runClick]}
        />
      </AbsoluteFill>
      <Caption />
      <Brand />
    </AbsoluteFill>
  );
};
