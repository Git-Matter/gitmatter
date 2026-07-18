import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { LegalAiGuideProps } from "../../marketing/LegalAiGuide";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: LegalAiGuideProps) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/LegalAiGuide"))
    : () => null;

export const Route = createFileRoute("/(marketing)/legal-ai-audit-trail")({
  head: () =>
    marketingHead({
      title: "Legal AI audit trail: every change on the record · gitmatter",
      description:
        "Learn what a legal AI audit trail should record: the person involved, the reason for a change, and the exact before and after for contract work.",
      path: "/legal-ai-audit-trail",
      og: { title: "Legal AI with an audit trail.", eyebrow: "legal AI audit trail" },
    }),
  component: () => <Page guide="legal-ai-audit-trail" />,
});
