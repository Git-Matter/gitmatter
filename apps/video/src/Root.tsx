import "./index.css";
import { Composition } from "remotion";
import { GitmatterDemo, DEMO_FRAMES } from "./GitmatterDemo";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="GitmatterDemo"
        component={GitmatterDemo}
        durationInFrames={DEMO_FRAMES}
        fps={30}
        width={1920}
        height={1080}
      />
    </>
  );
};
