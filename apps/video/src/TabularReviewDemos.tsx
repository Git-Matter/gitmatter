import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const TABULAR_REVIEW_DEMO_FRAMES = 660;

type DemoKey = "acquisition" | "leases" | "employment";

type Demo = {
  key: DemoKey;
  eyebrow: string;
  title: string;
  question: string;
  columns: string;
  outlier: string;
  evidence: string;
  outcome: string;
};

const demos: Record<DemoKey, Demo> = {
  acquisition: {
    key: "acquisition",
    eyebrow: "M&A DUE DILIGENCE",
    title: "100 customer contracts. One acquisition.",
    question: "Which contracts put deal value at risk?",
    columns: "Change of control · Annual value · Renewal date",
    outlier: "Customer 017 requires consent—and represents $1.37m in annual value.",
    evidence: "Verify the consent clause and the audited finding.",
    outcome: "Know what could break the deal before signing.",
  },
  leases: {
    key: "leases",
    eyebrow: "REAL ESTATE PORTFOLIO",
    title: "100 retail leases. Three hidden obligations.",
    question: "Which locations cannot exit—and carry structural repair risk?",
    columns: "Break right · Repair obligation · Rent review",
    outlier: "Lease 012 has no tenant break and full structural repair liability.",
    evidence: "Open the lease language behind the red flag.",
    outcome: "See portfolio exposure before the next property decision.",
  },
  employment: {
    key: "employment",
    eyebrow: "WORKFORCE HARMONISATION",
    title: "100 employment agreements. Different inherited terms.",
    question: "Which obligations cannot safely be standardised?",
    columns: "Notice period · Non-compete · Bonus entitlement",
    outlier: "Employee 023 has 12 months' notice and a 24-month global restriction.",
    evidence: "Read the restriction and trace who recorded it.",
    outcome: "Find workforce liabilities before changing the terms.",
  },
};

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const sceneOpacity = (frame: number, duration: number) =>
  interpolate(frame, [0, 12, duration - 12, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ color: "#82a8ff", fontSize: 23, fontWeight: 750, letterSpacing: 5 }}>
    {children}
  </div>
);

const Copy: React.FC<{ demo: Demo; text: string }> = ({ demo, text }) => (
  <div
    style={{
      position: "absolute",
      left: 62,
      bottom: 54,
      width: 1040,
      padding: "18px 24px 20px",
      borderRadius: 16,
      background: "rgba(6,8,12,0.94)",
      border: "1px solid rgba(255,255,255,0.16)",
      boxShadow: "0 22px 70px rgba(0,0,0,0.45)",
    }}
  >
    <Eyebrow>{demo.eyebrow}</Eyebrow>
    <div style={{ color: "white", fontSize: 35, fontWeight: 650, marginTop: 9 }}>{text}</div>
  </div>
);

const Hook: React.FC<{ demo: Demo }> = ({ demo }) => {
  const frame = useCurrentFrame();
  const opacity = sceneOpacity(frame, 90);
  const scale = interpolate(frame, [0, 90], [0.96, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 44%, rgba(64,101,194,0.25), transparent 44%), #07090d",
        opacity,
      }}
    >
      <div style={{ width: 1510, textAlign: "center", transform: `scale(${scale})` }}>
        <Eyebrow>{demo.eyebrow}</Eyebrow>
        <div
          style={{ color: "white", fontSize: 86, lineHeight: 1.03, fontWeight: 700, marginTop: 25 }}
        >
          {demo.title}
        </div>
        <div style={{ color: "#aeb5c2", fontSize: 34, marginTop: 32 }}>{demo.question}</div>
      </div>
    </AbsoluteFill>
  );
};

const LiveWorkflow: React.FC<{ demo: Demo }> = ({ demo }) => {
  const frame = useCurrentFrame();
  const reviewOpens = interpolate(frame, [70, 88], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const changeProgress = interpolate(frame, [132, 202], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const valueProgress = interpolate(frame, [172, 242], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const renewalProgress = interpolate(frame, [212, 282], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const progress = (changeProgress + valueProgress + renewalProgress) / 3;
  const scrollProgress = interpolate(frame, [306, 348], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const drawerProgress = interpolate(frame, [404, 438], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const cursorX = interpolate(
    frame,
    [0, 54, 82, 104, 116, 292, 340, 386, 420, 470],
    [1450, 1690, 1690, 1845, 1845, 1710, 1710, 600, 600, 1510],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    }
  );
  const cursorY = interpolate(
    frame,
    [0, 54, 82, 104, 116, 292, 340, 386, 420, 470],
    [360, 360, 360, 70, 70, 510, 640, 510, 510, 310],
    {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    }
  );
  const cursorOpacity = interpolate(frame, [0, 470, 486], [1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const openClick = interpolate(frame, [50, 58, 68], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const runClick = interpolate(frame, [108, 116, 126], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const rowClick = interpolate(frame, [378, 386, 398], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const clickPulse = Math.max(openClick, runClick, rowClick);
  const copyText =
    frame < 88
      ? "100 documents uploaded and ready for one review."
      : frame < 306
        ? demo.columns
        : frame < 404
          ? demo.outlier
          : demo.evidence;
  const columnBottom = (columnProgress: number) => 6 + columnProgress * 89;
  const applicationImageStyle = {
    position: "absolute" as const,
    left: -336,
    top: -138,
    width: 1920,
    height: 1080,
    objectFit: "fill" as const,
    transform: "scale(1.255)",
    transformOrigin: "left top",
  };
  const detailName =
    demo.key === "acquisition"
      ? "Customer contracts — change of control review"
      : demo.key === "leases"
        ? "Retail leases — obligation review"
        : "Employment agreements — inherited terms review";

  return (
    <AbsoluteFill style={{ background: "#090b0f", overflow: "hidden" }}>
      <div
        style={{
          position: "absolute",
          inset: 0,
          background: "#0b0d11",
          opacity: 1 - reviewOpens,
          transform: `translateX(${-34 * reviewOpens}px)`,
        }}
      >
        <div
          style={{
            position: "absolute",
            left: 72,
            top: 58,
            color: "white",
            fontSize: 28,
            fontWeight: 700,
          }}
        >
          Reviews
        </div>
        <div style={{ position: "absolute", left: 72, top: 112, color: "#9298a3", fontSize: 17 }}>
          Run one set of questions across a collection of documents.
        </div>
        <div
          style={{
            position: "absolute",
            left: 72,
            right: 72,
            top: 238,
            height: 245,
            borderTop: "1px solid #262a31",
            borderBottom: "1px solid #262a31",
            background: frame >= 42 ? "#12151a" : "transparent",
          }}
        >
          <div
            style={{
              position: "absolute",
              left: 18,
              top: 30,
              color: "white",
              fontSize: 25,
              fontWeight: 650,
            }}
          >
            {detailName}
          </div>
          <div style={{ position: "absolute", left: 18, top: 82, color: "#a5abb6", fontSize: 18 }}>
            Project Atlas · 3 review columns
          </div>
          <div style={{ position: "absolute", left: 18, top: 147, display: "flex", gap: 12 }}>
            <span
              style={{
                color: "#82a8ff",
                background: "#17223c",
                borderRadius: 999,
                padding: "9px 14px",
                fontSize: 17,
              }}
            >
              100 documents
            </span>
            <span
              style={{
                color: "#c6cad2",
                background: "#20232a",
                borderRadius: 999,
                padding: "9px 14px",
                fontSize: 17,
              }}
            >
              Ready to run
            </span>
          </div>
          <div style={{ position: "absolute", right: 24, top: 86, color: "#c6cad2", fontSize: 18 }}>
            Open review →
          </div>
        </div>
      </div>

      <div style={{ position: "absolute", inset: 0, opacity: reviewOpens }}>
        <Img
          src={staticFile(`tabular-demos/${demo.key}-grid.jpg`)}
          style={{
            ...applicationImageStyle,
            filter: "brightness(0.78)",
            opacity: 1 - scrollProgress,
            transform: `scale(1.255) translateY(${-80 * scrollProgress}px)`,
          }}
        />
        <Img
          src={staticFile(`tabular-demos/${demo.key}-outlier.jpg`)}
          style={{
            ...applicationImageStyle,
            opacity: scrollProgress,
            transform: `scale(1.255) translateY(${70 * (1 - scrollProgress)}px)`,
          }}
        />
      </div>
      {frame >= 88 && frame < 306 ? (
        <>
          {[
            { left: "30%", width: "23%" },
            { left: "53%", width: "22%" },
            { left: "75%", width: "25%" },
          ].map((column) => (
            <div
              key={column.left}
              style={{
                position: "absolute",
                left: column.left,
                top: "6%",
                width: column.width,
                height: "89%",
                background:
                  "repeating-linear-gradient(to bottom, #0a0c10 0, #0a0c10 65px, #181b20 66px)",
              }}
            />
          ))}
        </>
      ) : null}
      {frame >= 88 && frame < 306 ? (
        <Img
          src={staticFile(`tabular-demos/${demo.key}-grid.jpg`)}
          style={{
            ...applicationImageStyle,
            clipPath: `polygon(26% 6%, 53% 6%, 53% ${columnBottom(changeProgress)}%, 26% ${columnBottom(changeProgress)}%)`,
          }}
        />
      ) : null}
      {frame >= 88 && frame < 306 ? (
        <Img
          src={staticFile(`tabular-demos/${demo.key}-grid.jpg`)}
          style={{
            ...applicationImageStyle,
            clipPath: `polygon(53% 6%, 75% 6%, 75% ${columnBottom(valueProgress)}%, 53% ${columnBottom(valueProgress)}%)`,
          }}
        />
      ) : null}
      {frame >= 88 && frame < 306 ? (
        <Img
          src={staticFile(`tabular-demos/${demo.key}-grid.jpg`)}
          style={{
            ...applicationImageStyle,
            clipPath: `polygon(75% 6%, 100% 6%, 100% ${columnBottom(renewalProgress)}%, 75% ${columnBottom(renewalProgress)}%)`,
          }}
        />
      ) : null}
      {frame >= 124 && frame < 306 ? (
        <>
          {[
            { left: "30%", width: "23%", progress: changeProgress },
            { left: "53%", width: "22%", progress: valueProgress },
            { left: "75%", width: "25%", progress: renewalProgress },
          ].map((column) => (
            <div
              key={column.left}
              style={{
                position: "absolute",
                left: column.left,
                top: `${columnBottom(column.progress)}%`,
                width: column.width,
                height: 2,
                opacity: column.progress > 0 && column.progress < 1 ? 1 : 0,
                background: "rgba(130,168,255,0.75)",
                boxShadow: "0 0 18px rgba(130,168,255,0.7)",
              }}
            />
          ))}
        </>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: 1350,
          top: 0,
          width: 570,
          height: 1080,
          overflow: "hidden",
          transform: `translateX(${600 * (1 - drawerProgress)}px)`,
          boxShadow: drawerProgress > 0 ? "-24px 0 55px rgba(0,0,0,0.5)" : "none",
        }}
      >
        <Img
          src={staticFile(`tabular-demos/${demo.key}-source.jpg`)}
          style={{
            position: "absolute",
            inset: 0,
            width: 570,
            height: 1080,
            objectFit: "cover",
            objectPosition: "right top",
          }}
        />
      </div>
      {frame >= 88 && frame < 306 ? (
        <div
          style={{
            position: "absolute",
            top: 165,
            right: 55,
            width: 360,
            padding: "18px 22px",
            borderRadius: 15,
            background: "rgba(6,8,12,0.94)",
            border: "1px solid rgba(255,255,255,0.16)",
          }}
        >
          <div style={{ color: "white", fontSize: 31, fontWeight: 700 }}>
            {frame < 124 ? "Ready to run" : `${Math.round(progress * 100)} / 100 reviewed`}
          </div>
          <div style={{ height: 7, background: "#252a34", borderRadius: 20, marginTop: 13 }}>
            <div
              style={{
                width: `${progress * 100}%`,
                height: "100%",
                borderRadius: 20,
                background: "#82a8ff",
              }}
            />
          </div>
        </div>
      ) : null}
      <div
        style={{
          position: "absolute",
          left: cursorX,
          top: cursorY,
          width: 34,
          height: 46,
          opacity: cursorOpacity,
          filter: "drop-shadow(0 3px 4px rgba(0,0,0,0.8))",
        }}
      >
        <svg width="34" height="46" viewBox="0 0 34 46" aria-hidden="true">
          <path
            d="M2 2.5V34.2L10.1 26.6L16.4 42.3L22.2 39.9L15.9 24.7H27.2L2 2.5Z"
            fill="white"
            stroke="#111318"
            strokeWidth="2.2"
            strokeLinejoin="round"
          />
        </svg>
        <div
          style={{
            position: "absolute",
            left: 2,
            top: 3,
            width: 54 + clickPulse * 36,
            height: 54 + clickPulse * 36,
            borderRadius: 999,
            border: `3px solid rgba(130,168,255,${0.8 * clickPulse})`,
            transform: "translate(-50%, -50%)",
          }}
        />
      </div>
      <Copy demo={demo} text={copyText} />
    </AbsoluteFill>
  );
};

const Outcome: React.FC<{ demo: Demo }> = ({ demo }) => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 14], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        alignItems: "center",
        justifyContent: "center",
        background:
          "radial-gradient(circle at 50% 43%, rgba(72,109,205,0.27), transparent 44%), #07090d",
        opacity,
      }}
    >
      <div style={{ width: 1500, textAlign: "center" }}>
        <Eyebrow>LEGAL AI YOU CAN VERIFY</Eyebrow>
        <div
          style={{ color: "white", fontSize: 76, lineHeight: 1.04, fontWeight: 690, marginTop: 25 }}
        >
          {demo.outcome}
        </div>
        <div
          style={{
            display: "inline-flex",
            marginTop: 38,
            padding: "19px 32px",
            borderRadius: 14,
            background: "white",
            color: "#11141a",
            fontSize: 27,
            fontWeight: 700,
          }}
        >
          Book a demo at gitmatter.com
        </div>
      </div>
    </AbsoluteFill>
  );
};

const TabularReviewDemo: React.FC<{ demo: Demo }> = ({ demo }) => (
  <AbsoluteFill style={{ background: "#07090d", fontFamily: "Inter, ui-sans-serif, system-ui" }}>
    <Sequence durationInFrames={90}>
      <Hook demo={demo} />
    </Sequence>
    <Sequence from={90} durationInFrames={495}>
      <LiveWorkflow demo={demo} />
    </Sequence>
    <Sequence from={585} durationInFrames={75}>
      <Outcome demo={demo} />
    </Sequence>
  </AbsoluteFill>
);

export const AcquisitionReviewDemo: React.FC = () => <TabularReviewDemo demo={demos.acquisition} />;
export const LeaseReviewDemo: React.FC = () => <TabularReviewDemo demo={demos.leases} />;
export const EmploymentReviewDemo: React.FC = () => <TabularReviewDemo demo={demos.employment} />;
