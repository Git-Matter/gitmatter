import {
  AbsoluteFill,
  Easing,
  Img,
  interpolate,
  Sequence,
  staticFile,
  useCurrentFrame,
} from "remotion";

export const AI_TRAINING_REVIEW_FRAMES = 645;

const ease = Easing.bezier(0.16, 1, 0.3, 1);

const fade = (frame: number, duration: number) =>
  interpolate(frame, [0, 14, duration - 14, duration], [0, 1, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

const Eyebrow: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <div style={{ color: "#82a8ff", fontSize: 23, fontWeight: 750, letterSpacing: 5 }}>
    {children}
  </div>
);

const HookScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, 90);
  const count = Math.round(
    interpolate(frame, [10, 58], [1, 100], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
      easing: ease,
    })
  );

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 42%, rgba(62,100,190,0.22), transparent 42%), #07090d",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Eyebrow>ONE PORTFOLIO REVIEW</Eyebrow>
        <div
          style={{
            color: "white",
            fontSize: 205,
            lineHeight: 0.94,
            fontWeight: 730,
            marginTop: 26,
          }}
        >
          {count}
        </div>
        <div style={{ color: "white", fontSize: 64, fontWeight: 650, marginTop: 8 }}>
          vendor agreements.
        </div>
        <div style={{ color: "#aeb5c2", fontSize: 29, marginTop: 30 }}>
          Find the contracts that need counsel's attention.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ReviewsListScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, 105);
  const scale = interpolate(frame, [0, 55, 105], [1, 1.18, 1.28], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const pulse = interpolate(frame, [38, 55, 72], [0, 1, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: "#090b0f", overflow: "hidden", opacity }}>
      <Img
        src={staticFile("portfolio-review/01-reviews-list.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `scale(${scale})`,
          transformOrigin: "50% 17%",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 292,
          top: 164,
          width: 1438,
          height: 42,
          borderRadius: 8,
          boxShadow: `0 0 0 ${2 + pulse * 7}px rgba(130,168,255,${0.18 + pulse * 0.26})`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          bottom: 58,
          padding: "17px 23px",
          borderRadius: 14,
          background: "rgba(6,8,12,0.92)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <Eyebrow>OPEN THE 100-DOCUMENT REVIEW</Eyebrow>
      </div>
    </AbsoluteFill>
  );
};

const RunScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, 90);
  const progress = interpolate(frame, [8, 70], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const reviewed = Math.round(progress * 100);

  return (
    <AbsoluteFill style={{ background: "#090b0f", overflow: "hidden", opacity }}>
      <Img
        src={staticFile("portfolio-review/02-review-grid.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 0.17,
          filter: "grayscale(1)",
        }}
      />
      <Img
        src={staticFile("portfolio-review/02-review-grid.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          clipPath: `inset(0 0 ${100 - progress * 100}% 0)`,
        }}
      />
      <div
        style={{
          position: "absolute",
          left: "50%",
          top: "54%",
          transform: "translate(-50%, -50%)",
          width: 720,
          borderRadius: 19,
          background: "rgba(6,8,12,0.94)",
          border: "1px solid rgba(255,255,255,0.17)",
          padding: "34px 38px",
          textAlign: "center",
          boxShadow: "0 28px 90px rgba(0,0,0,0.5)",
        }}
      >
        <Eyebrow>RUNNING TABULAR REVIEW</Eyebrow>
        <div style={{ color: "white", fontSize: 65, fontWeight: 710, marginTop: 18 }}>
          {reviewed} / 100
        </div>
        <div style={{ height: 8, borderRadius: 99, background: "#20242e", marginTop: 24 }}>
          <div
            style={{
              width: `${progress * 100}%`,
              height: "100%",
              borderRadius: 99,
              background: "#82a8ff",
            }}
          />
        </div>
        <div style={{ color: "#aeb5c2", fontSize: 22, marginTop: 20 }}>
          Indemnity · Governing law · AI training rights
        </div>
      </div>
    </AbsoluteFill>
  );
};

const ResultsScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, 180);
  const switchToOutlier = interpolate(frame, [58, 82], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const scale = interpolate(frame, [78, 140, 180], [1, 1.18, 1.42], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill style={{ background: "#090b0f", overflow: "hidden", opacity }}>
      <Img
        src={staticFile("portfolio-review/02-review-grid.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: 1 - switchToOutlier,
        }}
      />
      <Img
        src={staticFile("portfolio-review/03-flagged-row.png")}
        style={{
          position: "absolute",
          inset: 0,
          width: "100%",
          height: "100%",
          objectFit: "cover",
          opacity: switchToOutlier,
          transform: `scale(${scale})`,
          transformOrigin: "57% 66%",
        }}
      />
      <div
        style={{
          position: "absolute",
          left: 70,
          bottom: 58,
          padding: "17px 23px",
          borderRadius: 14,
          background: "rgba(6,8,12,0.92)",
          border: "1px solid rgba(255,255,255,0.15)",
        }}
      >
        <Eyebrow>{frame < 72 ? "COMPARE EVERY AGREEMENT" : "THE OUTLIERS SURFACE"}</Eyebrow>
        <div style={{ color: "white", fontSize: 34, fontWeight: 650, marginTop: 8 }}>
          {frame < 72
            ? "One grid. Three questions. 100 documents."
            : "Vendor 038 permits AI training."}
        </div>
      </div>
    </AbsoluteFill>
  );
};

const SourceScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = fade(frame, 120);
  const scale = interpolate(frame, [0, 34, 120], [1, 1.18, 1.55], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });
  const translateY = interpolate(frame, [40, 120], [0, -80], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: ease,
  });

  return (
    <AbsoluteFill style={{ background: "#090b0f", overflow: "hidden", opacity }}>
      <Img
        src={staticFile("portfolio-review/04-flagged-source.png")}
        style={{
          width: "100%",
          height: "100%",
          objectFit: "cover",
          transform: `translateY(${translateY}px) scale(${scale})`,
          transformOrigin: "top right",
        }}
      />
      <div style={{ position: "absolute", left: 105, top: 300, width: 820 }}>
        <Eyebrow>OPEN THE RED FLAG</Eyebrow>
        <div
          style={{ color: "white", fontSize: 65, lineHeight: 1.05, fontWeight: 680, marginTop: 22 }}
        >
          Read the clause. See who wrote the finding.
        </div>
      </div>
    </AbsoluteFill>
  );
};

const CtaScene: React.FC = () => {
  const frame = useCurrentFrame();
  const opacity = interpolate(frame, [0, 16], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill
      style={{
        background:
          "radial-gradient(circle at 50% 45%, rgba(72,109,205,0.25), transparent 44%), #07090d",
        alignItems: "center",
        justifyContent: "center",
        opacity,
      }}
    >
      <div style={{ textAlign: "center" }}>
        <Eyebrow>LEGAL AI YOU CAN VERIFY</Eyebrow>
        <div
          style={{ color: "white", fontSize: 76, lineHeight: 1.04, fontWeight: 690, marginTop: 25 }}
        >
          Review 100 agreements.
          <br />
          Find the three that matter.
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

export const AiTrainingReviewTutorial: React.FC = () => (
  <AbsoluteFill style={{ background: "#07090d", fontFamily: "Inter, ui-sans-serif, system-ui" }}>
    <Sequence durationInFrames={90}>
      <HookScene />
    </Sequence>
    <Sequence from={90} durationInFrames={105}>
      <ReviewsListScene />
    </Sequence>
    <Sequence from={195} durationInFrames={90}>
      <RunScene />
    </Sequence>
    <Sequence from={285} durationInFrames={180}>
      <ResultsScene />
    </Sequence>
    <Sequence from={465} durationInFrames={120}>
      <SourceScene />
    </Sequence>
    <Sequence from={585} durationInFrames={60}>
      <CtaScene />
    </Sequence>
  </AbsoluteFill>
);
