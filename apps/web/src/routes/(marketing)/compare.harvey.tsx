import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/CompareHarvey"))
    : () => null;

export const Route = createFileRoute("/(marketing)/compare/harvey")({
  head: () =>
    marketingHead({
      title: "gitmatter vs Harvey · Harvey AI alternative compared",
      description:
        "An honest comparison of gitmatter and Harvey AI. Both offer legal research; gitmatter covers US case law and Australian IP search, while Harvey leads on data-room-scale review. gitmatter also adds a git-style audit trail, bring-your-own-agent over MCP, bring-your-own-key, open source, and no seat minimum.",
      path: "/compare/harvey",
      og: { title: "gitmatter vs Harvey", eyebrow: "harvey ai alternative" },
    }),
  component: Page,
});
