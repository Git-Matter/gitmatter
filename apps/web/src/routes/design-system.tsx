import { lazy, Suspense } from "react";
import { createFileRoute, notFound } from "@tanstack/react-router";

const DesignSystem = import.meta.env.DEV
  ? lazy(() => import("@/design-system/DesignSystem"))
  : () => null;

export const Route = createFileRoute("/design-system")({
  beforeLoad: () => {
    if (!import.meta.env.DEV) throw notFound();
  },
  head: () => ({
    meta: [
      { title: "Design system · gitmatter" },
      { name: "robots", content: "noindex, nofollow" },
    ],
  }),
  component: () => (
    <Suspense fallback={<p className="p-8">Loading design system…</p>}>
      <DesignSystem />
    </Suspense>
  ),
});
