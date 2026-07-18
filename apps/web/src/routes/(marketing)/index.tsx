import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/Home"))
    : () => null;

export const Route = createFileRoute("/(marketing)/")({
  head: () =>
    marketingHead({
      title: "Legal AI for contract work with an audit trail · gitmatter",
      description:
        "Legal AI for contract review, redlining, extraction, drafting, and research — with human decisions and every change on a git-style audit trail. Open source and self-hostable.",
      path: "/",
      jsonLd: [
        {
          "@context": "https://schema.org",
          "@type": "Organization",
          name: "gitmatter",
          url: "https://gitmatter.com",
          logo: "https://gitmatter.com/favicon.svg",
          sameAs: ["https://github.com/Git-Matter/gitmatter"],
          contactPoint: {
            "@type": "ContactPoint",
            email: "contact@gitmatter.com",
            contactType: "sales",
          },
        },
        {
          "@context": "https://schema.org",
          "@type": "SoftwareApplication",
          name: "gitmatter",
          applicationCategory: "BusinessApplication",
          operatingSystem: "Web",
          url: "https://gitmatter.com",
          description:
            "AI-assisted legal review — contract redline, tabular extraction, and drafting — on a git-style audit spine. Bring your own AI agent over MCP and your own LLM key.",
          offers: {
            "@type": "Offer",
            price: "0",
            priceCurrency: "USD",
            description: "Open source and self-hostable",
          },
        },
      ],
    }),
  component: Page,
});
