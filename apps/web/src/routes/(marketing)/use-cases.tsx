import { createFileRoute, redirect } from "@tanstack/react-router";

// The use-cases page moved to /solutions (Harvey-style naming with
// per-solution child routes). Keep the old URL working for existing links.
export const Route = createFileRoute("/(marketing)/use-cases")({
  beforeLoad: () => {
    throw redirect({ to: "/solutions", statusCode: 301 });
  },
});
