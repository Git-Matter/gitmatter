import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import type { LegalAiGuideProps } from "../../marketing/LegalAiGuide";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: LegalAiGuideProps) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/LegalAiGuide"))
    : () => null;

export const Route = createFileRoute("/(marketing)/self-hosted-legal-ai")({
  head: () =>
    marketingHead({
      title: "Self-hosted legal AI for teams that need control · gitmatter",
      description:
        "A practical guide to self-hosted legal AI: run the application stack on infrastructure you control, use your own model account, and manage access around the matter.",
      path: "/self-hosted-legal-ai",
      og: {
        title: "Self-hosted legal AI for teams that need control.",
        eyebrow: "self-hosted legal AI",
      },
    }),
  component: () => <Page guide="self-hosted-legal-ai" />,
});
