// Blog post registry — the single source of truth for post metadata. The
// bodies are .mdx files in ./posts (filename = URL slug) and are loaded
// lazily via bodies.ts, which only the marketing chunk imports. Metadata
// lives here as plain TS (not mdx frontmatter) on purpose: route `head()`
// needs it in every build, and importing the .mdx modules from a route file
// would drag all post bodies into the main bundle.
// Adding a post: write the .mdx in ./posts, add its entry here, then update
// PUBLIC_PRERENDER_PATHS in vite.config.ts and public/sitemap.xml.

export type PostMeta = {
  title: string;
  description: string;
  date: string; // ISO yyyy-mm-dd
  author: string;
  tags: string[];
  ogTitle: string;
  ogEyebrow: string;
};

const POSTS: Record<string, PostMeta> = {
  "ai-audit-trail-legal-work": {
    title: "What Is an AI Audit Trail for Legal Work (and Why Every Firm Needs One)",
    description:
      "AI is drafting, redlining, and reviewing legal documents. An audit trail records who changed what, when, and why, so the work stays defensible. Here is what a real one looks like, explained in plain terms.",
    date: "2026-07-10",
    author: "The gitmatter team",
    tags: ["audit trail", "legal AI"],
    ogTitle: "What is an AI audit trail for legal work?",
    ogEyebrow: "blog",
  },
  "chatgpt-claude-legal-work-audit-trail": {
    title: "How to Let ChatGPT or Claude Do Legal Work Without Losing the Audit Trail",
    description:
      "Your firm already pays for an AI assistant. A plain-English guide to connecting ChatGPT or Claude to your legal work, what MCP actually is, and how every action the AI takes lands on the record.",
    date: "2026-07-06",
    author: "The gitmatter team",
    tags: ["bring your own agent", "MCP"],
    ogTitle: "Let your AI do legal work, on the record.",
    ogEyebrow: "blog",
  },
  "contract-redlining-best-practices-ai-first-pass": {
    title: "10 Contract Redlining Best Practices When an AI Makes the First Pass",
    description:
      "AI can now produce a competent first-pass markup in minutes. These ten practices keep the speed while keeping lawyers in control: playbooks, attribution, clause-level review, and a record of every change.",
    date: "2026-07-01",
    author: "The gitmatter team",
    tags: ["redlining", "contract review"],
    ogTitle: "10 redlining best practices for the AI first pass.",
    ogEyebrow: "blog",
  },
  "byok-zero-data-retention-legal-ai": {
    title:
      "Bring Your Own Key: What Zero Data Retention Actually Means for Privilege and Confidentiality",
    description:
      "Legal AI sends client documents through someone's model. Whose account, whose terms, and whose storage policy decide whether that is defensible. A plain-English guide to bring-your-own-key and zero data retention.",
    date: "2026-06-24",
    author: "The gitmatter team",
    tags: ["confidentiality", "bring your own key"],
    ogTitle: "BYOK and zero data retention, explained for lawyers.",
    ogEyebrow: "blog",
  },
};

/** All posts, newest first. */
export const posts: { slug: string; meta: PostMeta }[] = Object.entries(POSTS)
  .map(([slug, meta]) => ({ slug, meta }))
  .sort((a, b) => b.meta.date.localeCompare(a.meta.date));

export function getPost(slug: string) {
  return posts.find((p) => p.slug === slug);
}
