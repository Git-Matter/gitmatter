import { SITE } from "@/marketing/site";
import { FEATURES, SOLUTIONS } from "@/marketing/catalog";

// Header dropdown menus (Harvey-style): each item is a title + one-line
// description. Platform and Solutions items are derived from the catalog and
// link to their /platform/$slug and /solutions/$slug child pages.

export type NavMenuItem = {
  label: string;
  desc: string;
  /** Internal route (TanStack Link). */
  to?: string;
  /** Plain href (docs, GitHub). */
  href?: string;
  external?: boolean;
};

// Featured card on the right of a menu panel (the Harvey pattern): a looping
// clip with a title and one-line description, linking somewhere deeper.
export type NavFeatured = {
  title: string;
  desc: string;
  /** Looping mp4 under /public. */
  media: string;
  /** Poster still shown before hover starts playback. */
  poster: string;
  to: string;
};

export const PLATFORM_ITEMS: NavMenuItem[] = [
  {
    label: "Overview",
    desc: "One view of how gitmatter's tools work together on the record.",
    to: "/platform",
  },
  ...FEATURES.map((f) => ({
    label: f.tag,
    desc: f.menuDesc,
    to: `/platform/${f.slug}`,
  })),
];

export const SOLUTION_ITEMS: NavMenuItem[] = [
  {
    label: "Overview",
    desc: "The legal work you already do, mapped onto gitmatter.",
    to: "/solutions",
  },
  ...SOLUTIONS.map((s) => ({
    label: s.tag,
    desc: s.menuDesc,
    to: `/solutions/${s.slug}`,
  })),
];

export const RESOURCE_ITEMS: NavMenuItem[] = [
  {
    label: "Overview",
    desc: "Guides, videos, and writing in one place.",
    to: "/resources",
  },
  {
    label: "Blog",
    desc: "Practical guides on AI-assisted legal work.",
    to: "/blog",
  },
  {
    label: "Docs",
    desc: "Setup, user guides, and the API reference.",
    href: SITE.docs,
  },
  {
    label: "Compare",
    desc: "gitmatter next to Harvey, Spellbook, and more.",
    to: "/compare",
  },
  {
    label: "GitHub",
    desc: "gitmatter is open source. Read the code.",
    href: SITE.github,
    external: true,
  },
];

export const PLATFORM_FEATURED: NavFeatured = {
  title: "The platform in one pass",
  desc: "Every feature in a single reel: review, redline, extract, and the record underneath.",
  media: "/features/overview.mp4",
  poster: "/posters/overview.jpg",
  to: "/platform",
};

export const SOLUTIONS_FEATURED: NavFeatured = {
  title: "Redlining with an AI first pass",
  desc: "Ten practices that keep the speed while lawyers keep control.",
  media: "/blog/redline-loop.mp4",
  poster: "/posters/redline-loop.jpg",
  to: "/blog/contract-redlining-best-practices-ai-first-pass",
};

export const RESOURCES_FEATURED: NavFeatured = {
  title: "Connect your agent",
  desc: "Watch Claude drive a matter while every action lands on the record.",
  media: "/blog/mcp-session.mp4",
  poster: "/posters/mcp-session.jpg",
  to: "/blog/chatgpt-claude-legal-work-audit-trail",
};
