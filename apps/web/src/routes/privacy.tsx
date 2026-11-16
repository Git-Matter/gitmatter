import { createFileRoute } from "@tanstack/react-router";
import Privacy from "@/legal/Privacy";

export const Route = createFileRoute("/privacy")({
  head: () => ({ meta: [{ title: "Privacy · gitmatter" }] }),
  component: Privacy,
});
