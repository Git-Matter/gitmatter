import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/Features"))
    : () => null;

export const Route = createFileRoute("/(marketing)/features")({
  head: () =>
    marketingHead({
      title: "Features · gitmatter — assistant, tabular review, redline, workflows & audit trail",
      description:
        "gitmatter's features: a matter-aware assistant with cited answers, tabular review across a hundred contracts, playbook-driven redline and drafting, repeatable workflows, a shared clause library, and a git-style audit trail — with ChatGPT or Claude connected over MCP on your own LLM key.",
      path: "/features",
      og: { title: "Everything the work needs. Nothing off the record.", eyebrow: "features" },
    }),
  component: Page,
});
