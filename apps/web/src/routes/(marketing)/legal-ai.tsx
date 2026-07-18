import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { LegalAiGuideProps } from "../../marketing/LegalAiGuide";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: LegalAiGuideProps) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/LegalAiGuide"))
    : () => null;

export const Route = createFileRoute("/(marketing)/legal-ai")({
  head: () =>
    marketingHead({
      title: "Legal AI for contract work with an audit trail · gitmatter",
      description:
        "A practical guide to legal AI for contract review, redlining, extraction, drafting, and research — with human decisions and every change on the record.",
      path: "/legal-ai",
      og: { title: "Legal AI for work a team can check.", eyebrow: "legal AI" },
    }),
  component: () => <Page guide="legal-ai" />,
});
