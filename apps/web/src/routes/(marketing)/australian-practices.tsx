import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/AustralianPractices"))
    : () => null;

export const Route = createFileRoute("/(marketing)/australian-practices")({
  head: () =>
    marketingHead({
      title: "AI workflows for Australian sole practitioners · gitmatter",
      description:
        "Explore matter briefing, agreement review, and draft client updates for Australian sole practitioners and general practices. Ask about assisted setup and an AUD pilot quote.",
      path: "/australian-practices",
    }),
  component: Page,
});
