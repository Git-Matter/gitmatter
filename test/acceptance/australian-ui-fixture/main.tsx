import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  Outlet,
  Link,
} from "@tanstack/react-router";
import { UnsavedChangesProvider } from "@/components/UnsavedChangesGuard";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { Button } from "@/components/ui/button";
import { GuidedTaskDialog } from "@/routes/_auth/assistant/-components/GuidedTaskDialog";
import { PracticeProfileCard } from "@/routes/_auth/settings/-components/PracticeProfileCard";
import { SettingsDrafts } from "@/routes/_auth/settings/-components/SettingsDrafts";
import {
  PractitionerReviewPanel,
  usePractitionerReviewDrafts,
} from "@/routes/_auth/documents/-components/PractitionerReviewPanel";
import type { PreparedGuidedTask } from "@workspace/registry";
import "@/styles/globals.css";

const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
type ShownDocument = {
  versionId: string | null;
  headCommitId: string | null;
  text: string;
  ready: boolean;
  available?: boolean;
};
let setShownDocument: (next: ShownDocument) => void = () => {};
let resetting = false;
window.addEventListener(
  "beforeunload",
  (event) => {
    if (resetting) event.stopImmediatePropagation();
  },
  { capture: true }
);

function Root() {
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <UnsavedChangesProvider>
          <main className="mx-auto flex min-h-dvh max-w-3xl flex-col gap-6 p-6">
            <p className="text-sm text-muted-foreground">
              Fictional component fixture. No authentication, provider or document-storage backend.
            </p>
            <nav className="flex flex-wrap gap-4" aria-label="Fixture navigation">
              <Link to="/assistant">Guided preparation</Link>
              <Link to="/settings" search={{ tab: "practice" }}>
                Practice preferences
              </Link>
              <Link to="/documents/$id" params={{ id: "fictional-document" }}>
                Review source
              </Link>
              <Link to="/matters">Leave fixture surface</Link>
            </nav>
            <Outlet />
          </main>
          <Toaster />
        </UnsavedChangesProvider>
      </TooltipProvider>
    </QueryClientProvider>
  );
}

function GuidedPage() {
  const [open, setOpen] = useState(false);
  const [seed, setSeed] = useState<PreparedGuidedTask | null>(null);
  return (
    <>
      <h1 className="text-xl">Guided preparation fixture</h1>
      <Button onClick={() => setOpen(true)}>Prepare a file briefing</Button>
      {open && (
        <GuidedTaskDialog
          taskId="matter-briefing"
          onClose={() => setOpen(false)}
          onStart={setSeed}
        />
      )}
      {seed && (
        <output data-testid="prepared-draft" className="block max-w-full text-xs break-all">
          {JSON.stringify(seed)}
        </output>
      )}
    </>
  );
}

function PracticePage() {
  const { tab } = settingsRoute.useSearch();
  return (
    <SettingsDrafts>
      <h1 className="text-xl">Practice settings fixture</h1>
      <nav className="flex gap-4" aria-label="Fixture settings sections">
        <Link to="/settings" search={{ tab: "practice" }}>
          Your practice
        </Link>
        <Link to="/settings" search={{ tab: "account" }}>
          Other retained section
        </Link>
      </nav>
      <section hidden={tab !== "practice"} inert={tab !== "practice"} className="[[hidden]]:hidden">
        <PracticeProfileCard userId="fictional-user" />
      </section>
      {tab !== "practice" && <p>Another section; the practice form remains mounted.</p>}
    </SettingsDrafts>
  );
}

function ReviewPage() {
  const draftState = usePractitionerReviewDrafts();
  const [shown, setShown] = useState<ShownDocument>({
    versionId: "version-1",
    headCommitId: "content-1",
    text: "Fictional source text for version 1.",
    ready: true,
  });
  setShownDocument = setShown;
  return (
    <>
      <h1 className="text-xl">Practitioner review fixture</h1>
      {draftState.guard}
      <section aria-label="Fictional displayed source" hidden={shown.available === false}>
        <p className="break-words">
          {shown.versionId} · {shown.headCommitId}
        </p>
        <p>{shown.text || "No source content is displayed."}</p>
      </section>
      {shown.available === false && <p role="status">Fictional source access unavailable.</p>}
      {shown.available !== false && (
        <PractitionerReviewPanel
          documentId="fictional-document"
          versionId={shown.versionId}
          headCommitId={shown.headCommitId}
          previewReady={shown.ready && !!shown.text.trim()}
          draftState={draftState}
        />
      )}
    </>
  );
}

const root = createRootRoute({ component: Root });
const settingsRoute = createRoute({
  getParentRoute: () => root,
  path: "/settings",
  validateSearch: (search: Record<string, unknown>) => ({
    tab: search.tab === "account" ? "account" : "practice",
  }),
  component: PracticePage,
});
const router = createRouter({
  routeTree: root.addChildren([
    settingsRoute,
    createRoute({ getParentRoute: () => root, path: "/assistant", component: GuidedPage }),
    createRoute({ getParentRoute: () => root, path: "/documents/$id", component: ReviewPage }),
    createRoute({
      getParentRoute: () => root,
      path: "/matters",
      component: () => <p>Fictional destination reached.</p>,
    }),
  ]),
  history: createMemoryHistory({ initialEntries: [location.pathname + location.search] }),
});
declare global {
  interface Window {
    australianFixture: {
      location: () => string;
      invalidate: (key: string) => Promise<void>;
      setDocument: (next: ShownDocument) => void;
      resetForNavigation: () => void;
    };
  }
}
window.australianFixture = {
  location: () => router.state.location.href,
  invalidate: async (key) => {
    await client.invalidateQueries({ queryKey: [key] });
  },
  setDocument: (next) => setShownDocument(next),
  resetForNavigation: () => {
    resetting = true;
  },
};
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
