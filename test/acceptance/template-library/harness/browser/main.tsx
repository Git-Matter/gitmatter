declare global {
  interface Window {
    evidenceChapterEvents: { text: string; at: string; elapsedMs: number }[];
    evidenceChapter: (text: string) => void;
    evidenceQueryRefresh: () => unknown;
    evidenceVideoStart?: number;
    evidenceFixtures: Record<number, string>;
    evidenceSearch: () => EvidenceSearch;
    evidenceNavigateAway: () => Promise<void>;
  }
}
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  createRootRoute,
  createRouter,
  createMemoryHistory,
  RouterProvider,
  useRouterState,
} from "@tanstack/react-router";
import { TemplatesSection } from "@/routes/_auth/library/-components/TemplatesSection";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import "@/styles/globals.css";
import v1 from "../../fixtures/northstar-mutual-nda-v1.docx?url";
import v2 from "../../fixtures/northstar-mutual-nda-v2.docx?url";

const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
window.evidenceFixtures = { 1: v1, 2: v2 };
type EvidenceSearch = {
  template?: string;
  templateView?: "all" | "review" | "returned" | "archived";
};
let role = "owner";
const nativeFetch = window.fetch.bind(window);
window.fetch = (input, init = {}) => {
  const path = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const url = new URL(path, location.href);
  if (url.origin !== location.origin || !url.pathname.startsWith("/api/"))
    return nativeFetch(input, init);
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init.headers).forEach((value, name) => headers.set(name, value));
  headers.set("X-Evidence-Role", role);
  return nativeFetch(input, { ...init, headers });
};

const PERSONAS = [
  ["owner", "Alex Morgan · template owner"],
  ["editor", "Sam Rivera · editor"],
  ["reviewer", "Jordan Lee · reviewer"],
  ["sales", "Casey Taylor · sales reader"],
  ["admin", "Morgan Chen · workspace admin"],
];

function App() {
  const search = useRouterState({ select: (state) => state.location.search as EvidenceSearch });
  const [persona, setPersona] = useState(role);
  const [chapter, setChapter] = useState("Owned templates. Approved originals. One history.");
  window.evidenceChapterEvents ??= [];
  window.evidenceChapter = (text: string) => {
    setChapter(text);
    const now = performance.now();
    window.evidenceChapterEvents.push({
      text,
      at: new Date().toISOString(),
      elapsedMs: now - (window.evidenceVideoStart ?? now),
    });
  };
  window.evidenceQueryRefresh = () => client.invalidateQueries();
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <div className="flex min-h-screen flex-col bg-background text-foreground">
          <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-3 border-b border-border bg-background px-8 py-3 text-xs">
            <div className="flex flex-col gap-1">
              <strong>LOCAL INTEGRATION EVIDENCE · FICTIONAL RECORDS</strong>
              <span className="text-muted-foreground">
                Production UI/core · local Postgres + disk test object adapter · injected personas ·
                no production authentication claim
              </span>
            </div>
            <label className="flex items-center gap-2">
              Persona
              <select
                aria-label="Evidence persona"
                className="rounded-md border border-input bg-card px-3 py-2"
                value={persona}
                onChange={(event) => {
                  role = event.target.value;
                  setPersona(role);
                  client.clear();
                  void router.navigate({ to: "/", search: {}, replace: true });
                }}
              >
                {PERSONAS.map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </select>
            </label>
          </header>
          <main className="mx-auto flex w-full max-w-7xl flex-1 flex-col gap-5 px-8 py-7">
            <div className="flex flex-col gap-2">
              <p className="text-xs font-medium tracking-widest text-muted-foreground uppercase">
                gitmatter / Library
              </p>
              <h1 className="font-heading text-3xl">Templates</h1>
            </div>
            <div
              className="rounded-lg bg-muted/70 px-5 py-3 text-sm font-medium"
              aria-live="polite"
            >
              {chapter}
            </div>
            <TemplatesSection
              key={persona}
              templateId={search.template ?? null}
              initialView={search.templateView}
              onTemplateChange={(template) =>
                void router.navigate({ to: "/", search: { ...search, template }, replace: true })
              }
              onViewChange={(templateView) =>
                void router.navigate({
                  to: "/",
                  search: { ...search, template: undefined, templateView },
                  replace: true,
                })
              }
            />
          </main>
        </div>
        <div
          id="evidence-watermark"
          style={{
            position: "fixed",
            left: 12,
            bottom: 10,
            zIndex: 2147483647,
            pointerEvents: "none",
            padding: "5px 8px",
            borderRadius: 5,
            background: "rgba(25,28,34,.88)",
            color: "#f4f5f7",
            fontSize: 10,
            letterSpacing: ".04em",
          }}
        >
          LOCAL INTEGRATION · FICTIONAL DATA · TEST OBJECT ADAPTER
        </div>
        <Toaster />
      </TooltipProvider>
    </QueryClientProvider>
  );
}
const rootRoute = createRootRoute({
  component: App,
  validateSearch: (input: Record<string, unknown>): EvidenceSearch => ({
    template: typeof input.template === "string" ? input.template : undefined,
    templateView: ["all", "review", "returned", "archived"].includes(String(input.templateView))
      ? (input.templateView as EvidenceSearch["templateView"])
      : undefined,
  }),
});
const router = createRouter({
  routeTree: rootRoute,
  history: createMemoryHistory({ initialEntries: ["/"] }),
});
window.evidenceSearch = () => router.state.location.search;
window.evidenceNavigateAway = () =>
  router.navigate({
    to: "/",
    search: { ...router.state.location.search, template: undefined },
    replace: true,
  });
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
