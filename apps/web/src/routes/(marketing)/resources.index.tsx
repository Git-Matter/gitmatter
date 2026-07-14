import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/Resources.tsx"))
    : () => null;

export const Route = createFileRoute("/(marketing)/resources/")({
  head: () =>
    marketingHead({
      title: "Resources · gitmatter",
      description:
        "Guides, videos, and writing on AI-assisted legal work: contract redlining, audit trails, connecting ChatGPT or Claude over MCP, and running legal AI on your own key.",
      path: "/resources",
      og: { title: "Resources", eyebrow: "resources" },
    }),
  component: Page,
});
