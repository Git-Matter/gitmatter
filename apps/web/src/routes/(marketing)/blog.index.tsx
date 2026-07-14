import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/Blog"))
    : () => null;

export const Route = createFileRoute("/(marketing)/blog/")({
  head: () =>
    marketingHead({
      title: "Blog · gitmatter",
      description:
        "Practical guides on AI-assisted legal work: contract redlining, review, audit trails, and connecting ChatGPT or Claude to an audited legal backend.",
      path: "/blog",
      og: { title: "Legal AI, on the record.", eyebrow: "blog" },
    }),
  component: Page,
});
