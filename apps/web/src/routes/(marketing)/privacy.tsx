import { createFileRoute } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { lazyMarketing } from "../../marketing/lazyMarketing";
import { marketingHead } from "../../marketing/seo";

const Page: (props: object) => ReactNode =
  import.meta.env.VITE_DEPLOYMENT === "cloud"
    ? lazyMarketing(() => import("../../marketing/Privacy"))
    : () => null;

export const Route = createFileRoute("/(marketing)/privacy")({
  head: () =>
    marketingHead({
      title: "Privacy · gitmatter",
      description:
        "How gitmatter stores your work, uses your selected AI provider, and handles retention, exports, and deletion.",
      path: "/privacy",
    }),
  component: Page,
});
