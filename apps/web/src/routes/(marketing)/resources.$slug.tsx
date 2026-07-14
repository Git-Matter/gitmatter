import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";
import { getVideo } from "../../marketing/resourceCatalog";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/ResourceVideo.tsx"))
    : () => null;

export const Route = createFileRoute("/(marketing)/resources/$slug")({
  loader: ({ params }) => {
    if (!getVideo(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const video = getVideo(params.slug);
    if (!video) return {};
    return marketingHead({
      title: `${video.title} · gitmatter`,
      description: video.desc,
      path: `/resources/${video.slug}`,
      og: { title: video.title, eyebrow: "video" },
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "VideoObject",
          name: video.title,
          description: video.desc,
          thumbnailUrl: `https://gitmatter.com${video.poster}`,
          uploadDate: video.publishedAt,
          duration: video.duration,
          contentUrl: `https://gitmatter.com${video.media}`,
        },
      ],
    });
  },
  component: Page,
});
