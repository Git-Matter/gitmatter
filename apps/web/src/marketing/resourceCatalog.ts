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
  /** Looping mp4 thumbnail under /public; omit for a typographic tile. */
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
    slug: "platform-overview",
    title: "The platform in one pass",
    desc: "Every feature in a single reel: review, redline, extract, and the record underneath.",
    media: "/features/overview.mp4",
    poster: "/posters/overview.jpg",
    publishedAt: "2026-07-12T23:09:03+02:00",
    duration: "PT19.648S",
    points: [
      "All seven tools in about twenty seconds: assistant, tabular review, redline and drafting, workflows, clause library, audit trail, and bring-your-own-agent",
      "Each feature shown as a real product moment, not slides",
      "Where to go deeper: every feature has its own page under /platform",
    ],
  },
  {
    slug: "product-tour",
    title: "Product tour",
    desc: "The full walkthrough: a matter from first document to a finished, fully attributed record.",
    media: "/demo.mp4",
    poster: "/demo-poster.png",
    publishedAt: "2026-07-12T23:32:46+02:00",
    duration: "PT30.186S",
    points: [
      "A matter worked end to end in the actual product",
      "AI suggestions landing as tracked changes, accepted and rejected by a lawyer",
      "The audit trail building itself as the work happens",
    ],
  },
  {
    slug: "install",
    title: "Install gitmatter",
    desc: "From zero to a running gitmatter in minutes — on your own machine or server.",
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
    desc: "Claude connected over MCP, reviewing twelve NDAs through gitmatter while every step lands on the record.",
    media: "/blog/mcp-session.mp4",
    poster: "/posters/mcp-session.jpg",
    publishedAt: "2026-07-12T20:54:37+02:00",
    duration: "PT45.056S",
    points: [
      "A real session shape: the assistant calls gitmatter's tools, gitmatter does the work",
      "Each action attributed to the agent, inside the lawyer's session",
      "The matter history the session leaves behind",
    ],
  },
  {
    slug: "ai-first-pass-redline",
    title: "An AI first pass, redlined",
    desc: "Playbook-driven suggestions land as tracked changes; a lawyer accepts two and rejects one, on the record.",
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
    desc: "The bring-your-own-key path in thirty seconds: encrypted at rest, straight to your provider, no route to training.",
    media: "/blog/byok.mp4",
    poster: "/posters/byok.jpg",
    publishedAt: "2026-07-12T20:54:37+02:00",
    duration: "PT30.059S",
    points: [
      "Your LLM key stored encrypted, never logged, never in the browser",
      "Documents flowing to your own provider account under zero data retention",
      "The off switch: revoke the key and every AI feature stops",
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
