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
  type AnyRoute,
} from "@tanstack/react-router";
import { TooltipProvider } from "@/components/ui/tooltip";
import type { ChatDetail, ChatTraceEvent } from "@/lib/data/api";
import { Toaster } from "@/components/ui/sonner";
import { AppFrame } from "@/components/AppFrame";
import { MattersProvider } from "@/lib/context/matters-context";
import type { ServerSession } from "@/lib/auth/session";
import { Route as Fresh } from "@/routes/_auth/assistant/index";
import { Route as Saved } from "@/routes/_auth/assistant/$id";
import { Route as MatterFresh } from "@/routes/_auth/matters/$id/assistant/index";
import { Route as MatterSaved } from "@/routes/_auth/matters/$id/assistant/$chatId";
import "@/styles/globals.css";

const matter = "10000000-0000-4000-8000-000000000001";
const documentId = "10000000-0000-4000-8000-000000000002";
const chatId = "10000000-0000-4000-8000-000000000003";
const mode = new URL(location.href).searchParams.get("scenario") ?? "new";
if (mode === "unselected") localStorage.removeItem("gitmatter.model");
else localStorage.setItem("gitmatter.model", "fixture-model");
sessionStorage.removeItem("workflowChatSeed");
const requests: Array<{
  message: string;
  model?: string;
  chatId?: string;
  matterId?: string;
  activeDocumentId?: string;
}> = [];
let modelStatus = mode === "catalog-error" ? 503 : 200;
let resumeStatus = mode === "resume-error" ? 503 : mode === "resume-denied" ? 403 : 200;
let completePending: (() => void) | undefined;
let savedChat: ChatDetail = {
  id: chatId,
  matterId: location.pathname.startsWith("/matters/") ? matter : (null as string | null),
  title: "Fictional saved conversation",
  turns: [
    { role: "user", text: "Saved fictional question" },
    { role: "assistant", text: "Saved fictional answer" },
  ],
};
if (mode === "legacy")
  savedChat.turns[1].toolCalls = [{ tool: "read_document", input: { documentId } }];
if (mode === "matter-redirect") savedChat.matterId = matter;
if (mode === "mismatch") savedChat.matterId = "10000000-0000-4000-8000-000000000099";
if (mode === "workflow" || mode === "workflow-error" || mode === "workflow-stop")
  sessionStorage.setItem(
    "workflowChatSeed",
    JSON.stringify({
      steps: [
        "First fictional workflow step",
        "Second fictional workflow step",
        "Third fictional workflow step",
      ],
    })
  );
const client = new QueryClient({
  defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
});
const nativeFetch = window.fetch.bind(window);
let resettingFixture = false;
// Scenario setup deliberately discards only fictional test state; route guards remain real.
window.addEventListener(
  "beforeunload",
  (event) => {
    if (resettingFixture) event.stopImmediatePropagation();
  },
  { capture: true }
);
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
const doc = {
  id: documentId,
  title: "Fictional source.txt",
  fileType: "txt",
  status: mode === "processing" ? "processing" : mode === "failed-file" ? "failed" : "ready",
  markdown: "Fictional source text retained for source inspection.",
  matterId: matter,
  currentVersionId: null,
  folderId: null,
  sizeBytes: 1024,
  createdAt: "2026-11-13T00:00:00Z",
};
window.fetch = async (input, init) => {
  const url = new URL(
    typeof input === "string" ? input : input instanceof URL ? input.href : input.url,
    location.href
  );
  if (url.origin !== location.origin) return json({ error: "Fixture blocks remote requests" }, 403);
  if (!url.pathname.startsWith("/api/")) return nativeFetch(input, init);
  const path = url.pathname;
  if (path === "/api/settings") return json({ jurisdiction: "US" });
  if (path === "/api/models" && modelStatus !== 200)
    return json({ error: "Fictional configuration check failed" }, modelStatus);
  if (path === "/api/models")
    return json([
      {
        provider: "anthropic",
        label: "Fictional provider",
        available: mode !== "no-model",
        source: "user",
        models: [
          {
            id: "fixture-model",
            label: "Fictional model",
            provider: "anthropic",
            capabilities: { vision: false, tools: true, reasoning: true, contextWindow: 200000 },
          },
        ],
      },
    ]);
  if (path === "/api/models/openrouter") return json([]);
  if (path === `/api/chats/${chatId}`)
    return resumeStatus === 200
      ? json(savedChat)
      : json({ error: "Fictional saved conversation unavailable" }, resumeStatus);
  if (path === "/api/chats") return json([]);
  if (path === "/api/matters")
    return json([
      {
        matter: { id: matter, name: "Fictional matter", updatedAt: "2026-11-13T00:00:00Z" },
        role: "editor",
        client: null,
      },
    ]);
  if (path === `/api/matters/${matter}`)
    return json({ id: matter, name: "Fictional matter", clientId: "fixture-client" });
  if (path === `/api/matters/${matter}/people`)
    return json([
      {
        userId: "fixture-user",
        name: "Fictional Reviewer",
        role: mode === "viewer" ? "viewer" : "editor",
      },
    ]);
  if (path.endsWith("/folders")) return json([]);
  if (path === "/api/documents" || path === `/api/matters/${matter}/documents`) return json([doc]);
  if (path === `/api/documents/${documentId}`)
    return json({
      document: doc,
      edits: [],
      resolutionPolicy: { mayPropose: false, mayResolve: false },
    });
  if (path === "/api/clients" || path === "/api/matters" || path === "/api/tabular/reviews")
    return json([]);
  if (path === "/api/chat/stream") {
    if (typeof init?.body !== "string")
      return json({ error: "Fixture expects a JSON request" }, 400);
    const body = JSON.parse(init.body);
    requests.push(body);
    if (!body.chatId)
      savedChat = { ...savedChat, title: null, matterId: body.matterId ?? null, turns: [] };
    const number = requests.length;
    const encoder = new TextEncoder();
    const stream = new ReadableStream({
      start(controller) {
        const event = (name: string, value: unknown) =>
          controller.enqueue(encoder.encode(`event: ${name}\ndata: ${JSON.stringify(value)}\n\n`));
        const finish = () => {
          const text = `Fictional completed answer ${number}`;
          const trace: ChatTraceEvent[] =
            mode === "activity"
              ? [
                  {
                    id: "fixture-step",
                    kind: "assess_query",
                    status: "done",
                    label: "Recorded request check",
                    summary: "Fictional recorded activity",
                    startedAt: "2026-11-13T00:00:00Z",
                    endedAt: "2026-11-13T00:00:02Z",
                  },
                ]
              : [];
          savedChat = {
            ...savedChat,
            matterId: body.matterId ?? savedChat.matterId,
            turns: [
              ...savedChat.turns,
              { role: "user", text: body.message },
              { role: "assistant", text, trace },
            ],
          };
          event("done", {
            chatId,
            text,
            trace,
            toolCalls: [],
            tools: [],
            jurisdiction: "US",
            documents: [],
            edits: [],
            citations: [],
          });
          controller.close();
          completePending = undefined;
        };
        event("text", "Fictional partial answer");
        if (
          mode === "stream-error" ||
          (mode === "followup-error" && number === 2) ||
          (mode === "workflow-error" && number === 2)
        ) {
          event("error", "Fictional provider response failed");
          controller.close();
        } else if (mode === "truncated") controller.close();
        else if (
          mode === "slow" ||
          (mode === "followup-error" && number === 1) ||
          (mode === "workflow-stop" && number === 2)
        ) {
          completePending = finish;
          init?.signal?.addEventListener(
            "abort",
            () => {
              completePending = undefined;
              controller.error(new DOMException("Stopped", "AbortError"));
            },
            { once: true }
          );
        } else finish();
      },
    });
    return new Response(stream, { headers: { "Content-Type": "text/event-stream" } });
  }
  return json(
    { error: `Unimplemented fixture endpoint ${path}; no application request was sent` },
    404
  );
};

// Only extraction-status subscription is needed; this fixture emits no real events or requests.
class FixtureEvents extends EventTarget {
  close() {}
}
window.EventSource = FixtureEvents as unknown as typeof EventSource;
declare global {
  interface Window {
    assistantFixture: {
      requests: typeof requests;
      resumeStatus: (status: number) => Promise<void>;
      setResumeStatus: (status: number) => void;
      setModelStatus: (status: number) => void;
      appendSavedTurn: (text: string) => void;
      finish: () => void;
      location: () => string;
      resetForNavigation: () => void;
    };
  }
}
window.assistantFixture = {
  requests,
  appendSavedTurn: (text) => {
    savedChat.turns.push({ role: "assistant", text });
  },
  setModelStatus: (status) => {
    modelStatus = status;
  },
  setResumeStatus: (status) => {
    resumeStatus = status;
  },
  resumeStatus: async (status) => {
    resumeStatus = status;
    await client.invalidateQueries({ queryKey: ["chat", chatId] });
  },
  finish: () => completePending?.(),
  location: () => router.state.location.pathname,
  resetForNavigation: () => {
    resettingFixture = true;
  },
};

function Root() {
  if (new URL(location.href).searchParams.get("preview") === "1") {
    const session = {
      user: { id: "fixture-user", name: "Demo Reviewer", email: "reviewer@example.invalid" },
      session: { id: "fixture-session", userId: "fixture-user" },
    } as NonNullable<ServerSession>;
    return (
      <QueryClientProvider client={client}>
        <TooltipProvider>
          <MattersProvider>
            <AppFrame session={session}>
              <Outlet />
            </AppFrame>
          </MattersProvider>
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    );
  }
  return (
    <QueryClientProvider client={client}>
      <TooltipProvider>
        <main className="flex h-dvh min-h-0 flex-col gap-3 p-4">
          <p className="shrink-0 text-xs text-muted-foreground">
            Fictional assistant fixture · production components · mock metadata/stream · no real
            inference, credentials or authentication.
          </p>
          <nav className="flex shrink-0 flex-wrap gap-4 text-sm">
            <Link to="/assistant">Workspace assistant</Link>
            <Link to="/assistant/$id" params={{ id: chatId }}>
              Saved conversation
            </Link>
            <Link to="/matters/$id/assistant" params={{ id: matter }}>
              Matter assistant
            </Link>
            <Link to="/matters">Leave workspace</Link>
          </nav>
          <div className="min-h-0 flex-1">
            <Outlet />
          </div>
          <Toaster />
        </main>
      </TooltipProvider>
    </QueryClientProvider>
  );
}
const root = createRootRoute({ component: Root });
const auth = createRoute({ getParentRoute: () => root, id: "_auth" });
for (const [route, path] of [
  [Fresh, "/assistant"],
  [Saved, "/assistant/$id"],
  [MatterFresh, "/matters/$id/assistant"],
  [MatterSaved, "/matters/$id/assistant/$chatId"],
] as const)
  route.update({ id: path, path, getParentRoute: () => auth } as never);
const router = createRouter({
  routeTree: root.addChildren([
    auth.addChildren([Fresh, Saved, MatterFresh, MatterSaved] as AnyRoute[]),
    createRoute({
      getParentRoute: () => root,
      path: "/matters",
      component: () => <p>Fixture destination; no work was sent.</p>,
    }),
  ]),
  history: createMemoryHistory({ initialEntries: [location.pathname] }),
});
createRoot(document.getElementById("root")!).render(<RouterProvider router={router} />);
