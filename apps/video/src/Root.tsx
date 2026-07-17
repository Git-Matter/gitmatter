import "./index.css";
import { Composition } from "remotion";
import { GitmatterDemo, DEMO_FRAMES } from "./GitmatterDemo";
import {
  CLIP,
  AssistantClip,
  ASSISTANT_FRAMES,
  ReviewClip,
  REVIEW_FRAMES,
  RedlineClip,
  REDLINE_FRAMES,
  WorkflowClip,
  WORKFLOW_FRAMES,
  LibraryClip,
  LIBRARY_FRAMES,
  AuditClip,
  AUDIT_FRAMES,
  AgentClip,
  AGENT_FRAMES,
  LegalResearchClip,
  LEGAL_RESEARCH_FRAMES,
} from "./clips";
import { Overview, OVERVIEW_FRAMES } from "./Overview";
import { McpSession, MCP_FRAMES } from "./McpSession";
import { Install, INSTALL_FRAMES } from "./Install";
import { AuditDive, AUDITDIVE_FRAMES } from "./AuditDive";
import { RedlineLoop, REDLINELOOP_FRAMES } from "./RedlineLoop";
import { TeaserLunch, TeaserBlame, TeaserAgent, TEASER_FRAMES } from "./Teasers";
import { CompareTeaser, COMPARE_FRAMES } from "./CompareTeaser";
import { Byok, BYOK_FRAMES } from "./Byok";
import { WebinarInHouse, WebinarTransactional, WEBINAR_FRAMES } from "./WebinarOpen";

// Marketing videos (1920×1080 masters) — rendered into the private
// Git-Matter/marketing repo. One entry per concept in that repo's
// concepts/video-concepts.md.
const marketing = [
  { id: "McpSession", component: McpSession, frames: MCP_FRAMES },
  { id: "Install", component: Install, frames: INSTALL_FRAMES },
  { id: "AuditDive", component: AuditDive, frames: AUDITDIVE_FRAMES },
  { id: "RedlineLoop", component: RedlineLoop, frames: REDLINELOOP_FRAMES },
  { id: "TeaserLunch", component: TeaserLunch, frames: TEASER_FRAMES },
  { id: "TeaserBlame", component: TeaserBlame, frames: TEASER_FRAMES },
  { id: "TeaserAgent", component: TeaserAgent, frames: TEASER_FRAMES },
  { id: "CompareTeaser", component: CompareTeaser, frames: COMPARE_FRAMES },
  { id: "Byok", component: Byok, frames: BYOK_FRAMES },
  { id: "WebinarInHouse", component: WebinarInHouse, frames: WEBINAR_FRAMES },
  {
    id: "WebinarTransactional",
    component: WebinarTransactional,
    frames: WEBINAR_FRAMES,
  },
] as const;

// Feature clips render to apps/web/public/features/*.mp4 for the marketing
// /features page.
const clips = [
  {
    id: "FeatureAssistant",
    component: AssistantClip,
    frames: ASSISTANT_FRAMES,
  },
  { id: "FeatureReview", component: ReviewClip, frames: REVIEW_FRAMES },
  { id: "FeatureRedline", component: RedlineClip, frames: REDLINE_FRAMES },
  { id: "FeatureWorkflow", component: WorkflowClip, frames: WORKFLOW_FRAMES },
  { id: "FeatureLibrary", component: LibraryClip, frames: LIBRARY_FRAMES },
  { id: "FeatureAudit", component: AuditClip, frames: AUDIT_FRAMES },
  { id: "FeatureAgent", component: AgentClip, frames: AGENT_FRAMES },
  {
    id: "FeatureLegalResearch",
    component: LegalResearchClip,
    frames: LEGAL_RESEARCH_FRAMES,
  },
] as const;

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
      <Composition
        id="FeatureOverview"
        component={Overview}
        durationInFrames={OVERVIEW_FRAMES}
        fps={CLIP.fps}
        width={CLIP.w}
        height={CLIP.h}
      />
      {clips.map((c) => (
        <Composition
          key={c.id}
          id={c.id}
          component={c.component}
          durationInFrames={c.frames}
          fps={CLIP.fps}
          width={CLIP.w}
          height={CLIP.h}
        />
      ))}
      {marketing.map((c) => (
        <Composition
          key={c.id}
          id={c.id}
          component={c.component}
          durationInFrames={c.frames}
          fps={30}
          width={1920}
          height={1080}
        />
      ))}
    </>
  );
};
