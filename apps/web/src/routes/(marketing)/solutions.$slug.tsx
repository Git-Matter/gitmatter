import { createFileRoute, notFound } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";
import { getSolution } from "../../marketing/catalog";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/SolutionPage"))
    : () => null;

export const Route = createFileRoute("/(marketing)/solutions/$slug")({
  loader: ({ params }) => {
    if (!getSolution(params.slug)) throw notFound();
  },
  head: ({ params }) => {
    const item = getSolution(params.slug);
    if (!item) return {};
    return marketingHead({
      title: `${item.title} · gitmatter`,
      description: item.body,
      path: `/solutions/${item.slug}`,
      og: { title: item.title, eyebrow: item.tag.toLowerCase() },
    });
  },
  component: Page,
});
