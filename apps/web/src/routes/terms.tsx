import { createFileRoute } from "@tanstack/react-router";
import Terms from "@/legal/Terms";

export const Route = createFileRoute("/terms")({
  head: () => ({ meta: [{ title: "Terms · gitmatter" }] }),
  component: Terms,
});
