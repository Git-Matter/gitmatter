import { createRouter as createTanStackRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,

    scrollRestoration: true,
    defaultPreload: "intent",
    defaultPreloadStaleTime: 0,
  });

  return router;
}

declare module "@tanstack/react-router" {
  interface HistoryState {
    /** Set by the explicit in-app action; never accepted from a URL parameter. */
    signOutRequested?: boolean;
  }

  interface Register {
    router: ReturnType<typeof getRouter>;
  }
}
