import { SITE } from "@/marketing/site";
import { posts } from "@/marketing/blog/posts";

// The resource hub's catalog: everything the site actually has — blog posts,
// product videos, docs guides, comparisons. House rule: only real content;
// no invented webinars, reports, or gated PDFs. Marketing-chunk only (pulls
// blog post metadata).

export type ResourceType = "Post" | "Video" | "Guide" | "Comparison";

export type Resource = {
  type: ResourceType;
  title: string;
  desc: string;
  /** Internal route. */
  to?: string;
  /** External/docs href. */
  href?: string;
  /** Product illustration under /public; watch pages provide the disclosed player. */
  media?: string;
  /** Poster still shown before hover starts playback. */
  poster?: string;
};

// Videos are first-class resources with their own watch page at
// /resources/$slug. All rendered from apps/video (Remotion).
export type VideoResource = {
  slug: string;
  title: string;
  desc: string;
  media: string;
  poster: string;
  /** When this video first became available. */
  publishedAt: string;
  /** ISO 8601 duration used in video search metadata. */
  duration: string;
  /** What the video actually shows — honest, concrete. */
  points: string[];
};

export const VIDEOS: VideoResource[] = [
  {
    slug: "customer-contract-diligence",
    title: "Customer contract diligence",
    desc: "An illustrated 100-contract acquisition review surfaces consent rights alongside recurring revenue, with findings linked to their source clauses.",
    media: "/blog/customer-contract-diligence-review.mp4",
    poster: "/posters/customer-contract-diligence-review.jpg",
    publishedAt: "2026-07-19T00:00:00+02:00",
    duration: "PT22S",
    points: [
      "One tabular review across 100 customer contracts",
      "Change-of-control consent risk viewed alongside annual contract value",
      "An illustrated view of the decisive clause, reasoning, and audit attribution",
    ],
  },
  {
    slug: "platform-overview",
    title: "The platform in one pass",
    desc: "Every feature in a single reel: research, review, redline, extract, and the record underneath.",
    media: "/features/overview.mp4",
    poster: "/posters/overview.jpg",
    publishedAt: "2026-07-12T23:09:03+02:00",
    duration: "PT21.8S",
    points: [
      "8 product moments in about 22 seconds: legal research, assistant, tabular review, redline and drafting, workflows, clause library, audit trail, and bring-your-own-agent",
      "Rendered examples of the main product workflows",
      "Where to go deeper: every feature has its own page under /platform",
    ],
  },
  {
    slug: "australian-ip-search",
    title: "Australian IP search",
    desc: "An illustrated launch-clearance scenario: counsel checks a fictional NORTHSTAR brand against trade mark records and inspects sources and tool activity.",
    media: "/features/legal-research.mp4",
    poster: "/posters/legal-research.jpg",
    publishedAt: "2026-07-15T00:00:00+02:00",
    duration: "PT24S",
    points: [
      "A product team asks counsel to clear NORTHSTAR before an Australian launch",
      "Counsel searches IP Australia trade marks from the assistant",
      "The returned records, sources, and tool activity stay visible in the session",
    ],
  },
  {
    slug: "product-tour",
    title: "Product tour",
    desc: "An illustrated walkthrough: a fictional matter from first document to its attributed record.",
    media: "/demo.mp4",
    poster: "/demo-poster.png",
    publishedAt: "2026-07-12T23:32:46+02:00",
    duration: "PT30.186S",
    points: [
      "An illustrated matter from first document to its audit history",
      "AI suggestions landing as tracked changes, accepted and rejected by a lawyer",
      "The audit trail building itself as the work happens",
    ],
  },
  {
    slug: "install",
    title: "Install gitmatter",
    desc: "An illustrated guide to setting up gitmatter on your own machine or server.",
    media: "/videos/install.mp4",
    poster: "/posters/install.jpg",
    publishedAt: "2026-07-12T23:09:03+02:00",
    duration: "PT30.059S",
    points: [
      "The self-hosted setup, start to finish",
      "Where your LLM key goes and how it's stored",
      "First login and the first matter",
    ],
  },
  {
    slug: "who-changed-this-clause",
    title: "Who changed this clause?",
    desc: "Blame for legal documents, demonstrated: one clause's full history opened, read, and undone.",
    media: "/blog/audit-dive.mp4",
    poster: "/posters/audit-dive.jpg",
    publishedAt: "2026-07-12T20:54:37+02:00",
    duration: "PT40.043S",
    points: [
      "Opening a clause's history with one click",
      "Every change with its author, its reason, and the exact before and after",
      "Undoing one bad change without unwinding the work after it",
    ],
  },
  {
    slug: "agent-at-work",
    title: "An agent at work",
    desc: "An illustrated MCP session: an agent reviews twelve example NDAs while its actions appear in the matter history.",
    media: "/blog/mcp-session.mp4",
    poster: "/posters/mcp-session.jpg",
    publishedAt: "2026-07-12T20:54:37+02:00",
    duration: "PT45.056S",
    points: [
      "An example session: the assistant calls tools and gitmatter records the work",
      "Each action attributed to the agent, inside the lawyer's session",
      "The matter history the session leaves behind",
    ],
  },
  {
    slug: "ai-first-pass-redline",
    title: "An AI first pass, redlined",
    desc: "Playbook-driven suggestions land as tracked changes; a lawyer accepts 2 and rejects 1, on the record.",
    media: "/blog/redline-loop.mp4",
    poster: "/posters/redline-loop.jpg",
    publishedAt: "2026-07-12T20:54:37+02:00",
    duration: "PT45.056S",
    points: [
      "The AI's markup arriving as suggestions, never silent edits",
      "Each suggestion with its playbook reasoning attached",
      "Accepts and rejects recorded per clause, with the reviewer's name",
    ],
  },
  {
    slug: "where-your-key-goes",
    title: "Where your key goes",
    desc: "The illustrated bring-your-own-key path: key configuration, encrypted storage, and requests to your selected provider.",
    media: "/blog/byok.mp4",
    poster: "/posters/byok.jpg",
    publishedAt: "2026-07-12T20:54:37+02:00",
    duration: "PT30.059S",
    points: [
      "An illustration of provider-key configuration and encrypted storage",
      "An example document-to-provider request path",
      "The illustrated application-key removal flow",
    ],
  },
];

export const getVideo = (slug: string) => VIDEOS.find((v) => v.slug === slug);

const POSTER_BY_SLUG: Record<string, string> = {
  "ai-audit-trail-legal-work": "/posters/audit-dive.jpg",
  "chatgpt-claude-legal-work-audit-trail": "/posters/mcp-session.jpg",
  "contract-redlining-best-practices-ai-first-pass": "/posters/redline-loop.jpg",
  "byok-zero-data-retention-legal-ai": "/posters/byok.jpg",
};

const CLIP_BY_SLUG: Record<string, string> = {
  "ai-audit-trail-legal-work": "/blog/audit-dive.mp4",
  "chatgpt-claude-legal-work-audit-trail": "/blog/mcp-session.mp4",
  "contract-redlining-best-practices-ai-first-pass": "/blog/redline-loop.mp4",
  "byok-zero-data-retention-legal-ai": "/blog/byok.mp4",
};

const POST_RESOURCES: Resource[] = posts.map((p) => ({
  type: "Post" as const,
  title: p.meta.title,
  desc: p.meta.description,
  to: `/blog/${p.slug}`,
  media: CLIP_BY_SLUG[p.slug],
  poster: POSTER_BY_SLUG[p.slug],
}));

const VIDEO_RESOURCES: Resource[] = VIDEOS.map((v) => ({
  type: "Video" as const,
  title: v.title,
  desc: v.desc,
  to: `/resources/${v.slug}`,
  media: v.media,
  poster: v.poster,
}));

const GUIDE_RESOURCES: Resource[] = [
  {
    type: "Guide",
    title: "Connect an agent",
    desc: "Connect Claude, ChatGPT, or a command-line agent to gitmatter over MCP — sign in, approve, done.",
    href: `${SITE.docs}/ai-agents/connect-an-agent`,
  },
  {
    type: "Guide",
    title: "Self-hosting gitmatter",
    desc: "Run gitmatter on your own infrastructure: setup, local development, and the Docker stack.",
    href: `${SITE.docs}/admin/self-hosting`,
  },
  {
    type: "Guide",
    title: "Documentation",
    desc: "Install guides, the user guide, agent connections, and the API reference.",
    href: SITE.docs,
  },
];

const COMPARISON_RESOURCES: Resource[] = [
  {
    type: "Comparison",
    title: "gitmatter vs. the field",
    desc: "Honest side-by-sides with Harvey, Spellbook, LegalOn, LegalFly, and GitLaw — where each leads.",
    to: "/compare",
  },
];

/** Featured first (newest post), then the rest for the grid. */
export const RESOURCES: Resource[] = [
  ...POST_RESOURCES,
  ...VIDEO_RESOURCES,
  ...GUIDE_RESOURCES,
  ...COMPARISON_RESOURCES,
];
