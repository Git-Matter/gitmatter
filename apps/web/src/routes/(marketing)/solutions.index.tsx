import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/Solutions"))
    : () => null;

export const Route = createFileRoute("/(marketing)/solutions/")({
  head: () =>
    marketingHead({
      title: "Solutions · gitmatter — AI contract redline, extraction, drafting & audit trail",
      description:
        "Review, redline, extract, and draft with a git-style audit trail. Connect ChatGPT or Claude over MCP, or use gitmatter's built-in AI with your own provider key.",
      path: "/solutions",
      og: { title: "The legal work you already do — on the record.", eyebrow: "solutions" },
    }),
  component: Page,
});
