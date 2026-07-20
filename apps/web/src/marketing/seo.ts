import { SITE } from "./site";

// Build a full SEO head for a public marketing page: unique title + description,
// a canonical URL, and Open Graph / Twitter cards. Paths are absolute ("/about");
// canonical and OG URLs derive from SITE.url. og:image is a 1200x630 banner: pass
// `og` to render a per-page one via /api/og (its own headline + eyebrow), else the
// static og.png. Paired with a summary_large_image card.
export function marketingHead(opts: {
  title: string;
  description: string;
  path: string;
  og?: { title: string; eyebrow?: string };
  jsonLd?: object[];
}) {
  const url = `${SITE.url}${opts.path === "/" ? "" : opts.path}`;
  const imageAlt = opts.og?.title ?? opts.title;
  const image = opts.og
    ? `${SITE.url}/api/og?title=${encodeURIComponent(opts.og.title)}` +
      (opts.og.eyebrow ? `&eyebrow=${encodeURIComponent(opts.og.eyebrow)}` : "")
    : `${SITE.url}/og.png`;
  return {
    meta: [
      { title: opts.title },
      { name: "description", content: opts.description },
      { property: "og:type", content: "website" },
      { property: "og:site_name", content: "gitmatter" },
      { property: "og:title", content: opts.title },
      { property: "og:description", content: opts.description },
      { property: "og:url", content: url },
      { property: "og:image", content: image },
      { property: "og:image:type", content: "image/png" },
      { property: "og:image:width", content: opts.og ? "1200" : "2400" },
      { property: "og:image:height", content: opts.og ? "630" : "1260" },
      { property: "og:image:alt", content: imageAlt },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:title", content: opts.title },
      { name: "twitter:description", content: opts.description },
      { name: "twitter:image", content: image },
      { name: "twitter:image:alt", content: imageAlt },
    ],
    links: [{ rel: "canonical", href: url }],
    ...(opts.jsonLd?.length
      ? {
          scripts: opts.jsonLd.map((data) => ({
            type: "application/ld+json",
            children: JSON.stringify(data),
          })),
        }
      : {}),
  };
}
