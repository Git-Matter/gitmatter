import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";
import { getPost } from "../../marketing/blog/posts";
import { SITE } from "../../marketing/site";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/BlogPost"))
    : () => null;

export const Route = createFileRoute("/(marketing)/blog/$slug")({
  loader: ({ params }) => {
    if (!getPost(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const post = getPost(params.slug);
    if (!post) return {};
    const url = `${SITE.url}/blog/${post.slug}`;
    return marketingHead({
      title: `${post.meta.title} · gitmatter`,
      description: post.meta.description,
      path: `/blog/${post.slug}`,
      og: { title: post.meta.ogTitle, eyebrow: post.meta.ogEyebrow },
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "BlogPosting",
          headline: post.meta.title,
          description: post.meta.description,
          datePublished: post.meta.date,
          author: { "@type": "Organization", name: post.meta.author, url: SITE.url },
          publisher: { "@type": "Organization", name: "gitmatter", url: SITE.url },
          mainEntityOfPage: url,
          url,
        },
      ],
    });
  },
  component: Page,
});
