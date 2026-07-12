import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";
import { getFeature } from "../../marketing/catalog";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/PlatformFeature"))
    : () => null;

export const Route = createFileRoute("/(marketing)/platform/$slug")({
  loader: ({ params }) => {
    if (!getFeature(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const feature = getFeature(params.slug);
    if (!feature) return {};
    return marketingHead({
      title: `${feature.tag} · gitmatter platform`,
      description: feature.body,
      path: `/platform/${feature.slug}`,
      og: { title: feature.title, eyebrow: feature.tag.toLowerCase() },
    });
  },
  component: Page,
});
