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
        "AI contract redline, clause and tabular extraction, and document generation on a git-style audit trail. Connect ChatGPT or Claude over MCP and run it on your own LLM key with zero data retention.",
      path: "/solutions",
      og: { title: "The legal work you already do — on the record.", eyebrow: "solutions" },
    }),
  component: Page,
});
