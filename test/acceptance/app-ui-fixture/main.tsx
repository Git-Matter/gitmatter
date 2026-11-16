import { createRoot } from "react-dom/client";
import {
  createBrowserHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  Link,
  RouterProvider,
  type AnyRoute,
} from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { AppFrame } from "@/components/AppFrame";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { MattersProvider } from "@/lib/context/matters-context";
import type { ServerSession } from "@/lib/auth/session";
import type { ClientListItem, MatterListItem, Doc, WorkflowListItem, Clause } from "@/lib/data/api";
import { Route as Clients } from "@/routes/_auth/clients/index";
import { Route as Matters } from "@/routes/_auth/matters/index";
import { Route as Documents } from "@/routes/_auth/documents/index";
import { Route as Workflows } from "@/routes/_auth/workflows/index";
import { Route as AssistantWorkflow } from "@/routes/_auth/workflows/assistant/$id";
import { Route as Settings } from "@/routes/_auth/settings/index";
import { Route as Reviews } from "@/routes/_auth/reviews/index";
import { Route as Library } from "@/routes/_auth/library/index";
import "@/styles/globals.css";

// Isolated, read-only fictional data. No production auth/backend or provider is reachable.
let resettingFixture = false;
window.addEventListener(
  "beforeunload",
  (event) => {
    if (resettingFixture) event.stopImmediatePropagation();
  },
  { capture: true }
);
const at = "2026-11-16T01:00:00.000Z";
const id = (group: number, index: number) =>
  `${String(group).padStart(8, "0")}-0000-4000-8000-${String(index).padStart(12, "0")}`;
const clients: ClientListItem[] = [
  "Northstar Studio",
  "Harbour Manufacturing",
  "Cedar Health",
  "Acorn Technologies",
  "Marlow Partners",
  "Westhaven Property",
].map((name, index) => ({
  id: id(10, index),
  name: `${name} · Demo`,
  type: "organization",
  clientNumber: `CL-${101 + index}`,
  status: "active",
  createdAt: at,
  role: "owner",
  ownerName: "Demo Reviewer",
  memberCount: (index % 3) + 1,
}));
const pagedClients = Array.from({ length: 10 }, (_value, copy) =>
  clients.map((client, index) => ({
    ...client,
    id: copy ? id(11, copy * 10 + index) : client.id,
    name: copy ? `${client.name} ${copy + 1}` : client.name,
  }))
).flat();
const matters: MatterListItem[] = clients.map((client, index) => ({
  client,
  role: "owner",
  ownerName: "Demo Reviewer",
  memberCount: 2,
  matter: {
    id: id(20, index),
    clientId: client.id,
    name: [
      "Commercial services agreement",
      "Supply agreement renewal",
      "Data processing terms",
      "Mutual NDA review",
      "Shareholders agreement",
      "Office lease review",
    ][index]!,
    practiceArea: "Commercial",
    jurisdiction: "AU",
    status: index === 5 ? "closed" : "open",
    adverseParties: [],
    conflictCleared: false,
    conflictNotes: null,
    leadAttorney: "Demo Reviewer",
    createdAt: at,
    updatedAt: at,
  },
}));
const documents: Doc[] = matters.map(({ matter }, index) => ({
  id: id(30, index),
  title: [
    "Services agreement.docx",
    "Supply agreement.docx",
    "Data processing addendum.docx",
    "Mutual NDA.docx",
    "Shareholders agreement.docx",
    "Office lease.pdf",
  ][index]!,
  fileType: index === 5 ? "pdf" : "docx",
  status: index === 2 ? "processing" : "ready",
  extractionError: null,
  ocrSuggested: false,
  sizeBytes: 18000,
  folderId: null,
  currentVersionId: id(31, index),
  createdAt: at,
  matterId: matter.id,
  matterName: matter.name,
  ownerName: "Demo Reviewer",
  versionNumber: 1,
  isOwner: true,
  shareCount: 2,
  sharedNames: ["Demo Reviewer", "Demo Colleague"],
}));
const workflows: WorkflowListItem[] = [
  "Contract summary",
  "Compare key terms",
  "Extract payment obligations",
  "Prepare a chronology",
  "Review confidentiality",
  "Identify renewal dates",
].map((title, index) => ({
  id: id(40, index),
  title,
  type: index % 2 ? "tabular" : "assistant",
  promptMd: "Fictional workflow prompt. Do not run.",
  steps: null,
  columnsConfig: null,
  rules: null,
  status: "approved",
  practice: "Commercial",
  isSystem: index < 3,
  isOwner: index >= 3,
  allowEdit: index >= 3,
  sharedByName: null,
  hidden: false,
  userId: null,
  createdAt: at,
}));
const clauses: Clause[] = [
  "Confidentiality — mutual",
  "Permitted use",
  "Return or destruction",
  "Compelled disclosure",
  "Liability cap",
  "Governing law",
].map((title, index) => ({
  id: id(50, index),
  title,
  body: "Fictional example language for interface inspection only.",
  category: index < 4 ? "Confidentiality" : "Commercial",
  jurisdiction: "AU",
  riskRating: index === 4 ? "negotiable" : "acceptable",
  guidance: "Inspect the current approved language before using it.",
  tags: [],
  status: index === 4 ? "draft" : "approved",
  matterId: null,
  clientId: null,
  parentClauseId: null,
  fallbackRank: null,
  overridesClauseId: null,
  userId: null,
  createdAt: at,
  updatedAt: at,
}));
const session = {
  user: {
    id: "demo-reviewer",
    name: "Demo Reviewer",
    email: "reviewer@example.invalid",
    emailVerified: true,
  },
  session: { id: "fictional-session", userId: "demo-reviewer" },
} as NonNullable<ServerSession>;
const originalFetch = window.fetch.bind(window);
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href
  );
  const json = (value: unknown, status = 200) =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "Content-Type": "application/json" },
    });
  if (url.origin !== location.origin)
    return json({ error: "Remote requests are blocked in the app fixture." }, 403);
  if (!url.pathname.startsWith("/api/")) return originalFetch(input, init);
  const method = init?.method ?? (input instanceof Request ? input.method : "GET");
  if (method !== "GET")
    return json({ error: "This fictional preview is read-only. No change was sent." }, 403);
  const path = url.pathname;
  const page = <T,>(items: T[]) => {
    let rows = items.filter((item) =>
      JSON.stringify(item)
        .toLowerCase()
        .includes((url.searchParams.get("q") ?? "").toLowerCase())
    );
    const rowCount = rows.length;
    if (url.searchParams.has("page")) {
      const size = Number(url.searchParams.get("pageSize") ?? 25),
        offset = Number(url.searchParams.get("page") ?? 0) * size;
      rows = rows.slice(offset, offset + size);
      return json({ rows, rowCount });
    }
    return json(rows);
  };
  if (path === "/api/auth/get-session") return json(session);
  if (path === "/api/auth/passkey/list-user-passkeys") return json([]);
  if (path === "/api/keys") return json({ providers: [] });
  if (path === "/api/keys/courtlistener") return json({ hasUserKey: false });
  if (path === "/api/tenant")
    return json({ id: "fictional-firm", name: "Demo firm", storageRegion: "us" });
  if (path === "/api/tenant/invites" || path === "/api/tokens") return json([]);
  if (path === "/api/clients") return page(url.searchParams.has("page") ? pagedClients : clients);
  if (path === "/api/matters")
    return page(
      matters.filter(
        (item) =>
          !url.searchParams.has("status") || item.matter.status === url.searchParams.get("status")
      )
    );
  if (path === "/api/documents") return page(documents);
  if (path === "/api/templates") return json({ items: [], nextCursor: null });
  if (path === "/api/chats") return json([]);
  if (path === "/api/tabular/reviews")
    return page(
      matters.map(({ matter }, index) => ({
        id: id(60, index),
        title: `Review — ${matter.name}`,
        matterName: matter.name,
        documentIds: [documents[index]!.id],
        createdAt: at,
        isOwner: true,
        shareCount: 2,
        sharedNames: ["Demo Reviewer"],
      }))
    );
  if (path === "/api/clauses") return json(clauses);
  if (path === "/api/workflows/practices" || path === "/api/practice-areas")
    return json(["Commercial"]);
  if (path === "/api/workflows") {
    const tab = url.searchParams.get("tab");
    return page(
      workflows.filter((item) =>
        tab === "custom"
          ? item.isOwner
          : tab === "builtin"
            ? item.isSystem
            : tab === "hidden"
              ? item.hidden
              : true
      )
    );
  }
  if (path.startsWith("/api/workflows/")) {
    const workflow = workflows.find((item) => path === `/api/workflows/${item.id}`);
    if (workflow) return json({ workflow });
  }
  if (path === "/api/settings") return json({ jurisdiction: "AU" });
  if (path === "/api/tenant/members") return json([]);
  if (path.startsWith("/api/documents/")) {
    const doc = documents.find((item) => path === `/api/documents/${item.id}`);
    if (doc)
      return json({
        document: {
          ...doc,
          markdown: "Fictional local preview; source inspection is not provided by this fixture.",
          approvedMarkdown: null,
          approvedVersionId: null,
          headCommitId: "fictional-source-commit",
        },
        edits: [],
      });
    if (path.endsWith("/history") || path.endsWith("/versions")) return json([]);
  }
  if (path.startsWith("/api/clients/")) {
    const client = pagedClients.find((item) => path.endsWith(item.id));
    if (client)
      return json({
        client,
        matters: matters
          .filter((item) => item.client.id === client.id)
          .map((item) => ({ matter: item.matter, role: item.role })),
        documents: [],
        reviews: [],
      });
  }
  return json({ error: `Unimplemented fictional API: ${path}` }, 404);
};
const cache = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
function Shell() {
  return (
    <QueryClientProvider client={cache}>
      <ThemeProvider attribute="class" defaultTheme="light">
        <TooltipProvider>
          <MattersProvider>
            <AppFrame session={session}>
              <Outlet />
            </AppFrame>
          </MattersProvider>
          <Toaster />
        </TooltipProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
const root = createRootRoute({ component: Shell });
const auth = createRoute({
  getParentRoute: () => root,
  id: "_auth",
  beforeLoad: () => ({ session }),
});
const children: AnyRoute[] = [];
for (const [route, path] of [
  [Clients, "/clients/"],
  [Matters, "/matters/"],
  [Documents, "/documents/"],
  [Workflows, "/workflows/"],
  [Library, "/library/"],
  [Reviews, "/reviews/"],
  [Settings, "/settings/"],
  [AssistantWorkflow, "/workflows/assistant/$id"],
] as const) {
  route.update({ id: path, path, getParentRoute: () => auth } as never);
  children.push(route);
}
children.push(
  createRoute({
    getParentRoute: () => auth,
    path: "/matters/$id",
    component: () => (
      <div>
        <h1>Read-only matter destination</h1>
        <Link to="/matters">Back to matters</Link>
      </div>
    ),
  })
);
children.push(
  createRoute({
    getParentRoute: () => auth,
    path: "/reviews/$id",
    component: () => (
      <div>
        <h1>Read-only review destination</h1>
        <Link to="/reviews">Back to reviews</Link>
      </div>
    ),
  })
);
const router = createRouter({
  routeTree: root.addChildren([auth.addChildren(children)]),
  history: createBrowserHistory(),
});
Object.assign(window, {
  appFixture: {
    back: () => router.history.back(),
    refresh: () => cache.invalidateQueries(),
    resetForNavigation: () => {
      resettingFixture = true;
    },
    navigate: (to: string) => router.navigate({ to }),
  },
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
