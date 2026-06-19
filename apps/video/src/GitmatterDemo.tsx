import { AbsoluteFill, Sequence } from "remotion";
import { theme } from "./theme";
import { Title } from "./scenes/Title";
import { Ask } from "./scenes/Ask";
import { Work } from "./scenes/Work";
import { Finding } from "./scenes/Finding";
import { Record } from "./scenes/Record";
import { Outro } from "./scenes/Outro";

// One continuous story: Jane runs a single NDA-review matter for Acme, start to
// finish, ending on gitmatter's core idea — every step is on the record.
const scenes = [
  { c: Title, d: 90 },
  { c: Ask, d: 165 },
  { c: Work, d: 90 },
  { c: Finding, d: 210 },
  { c: Record, d: 300 },
  { c: Outro, d: 90 },
];

export const DEMO_FRAMES = scenes.reduce((n, s) => n + s.d, 0);

export const GitmatterDemo: React.FC = () => {
  let from = 0;
  return (
    <AbsoluteFill style={{ backgroundColor: theme.ink }}>
      {scenes.map(({ c: Scene, d }, i) => {
        const seq = (
          <Sequence key={i} from={from} durationInFrames={d}>
            <Scene />
          </Sequence>
        );
        from += d;
        return seq;
      })}
    </AbsoluteFill>
  );
};
