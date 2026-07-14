import { createFileRoute, redirect } from "@tanstack/react-router";

// The features page moved to /platform (Harvey-style naming with per-feature
// child routes). Keep the old URL working for existing links and search hits.
export const Route = createFileRoute("/(marketing)/features")({
  beforeLoad: () => {
    throw redirect({ to: "/platform", statusCode: 301 });
  },
});
