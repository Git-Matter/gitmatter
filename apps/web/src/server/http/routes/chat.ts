import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  type Actor,
  buildToolCatalog,
  canAccessArtifact,
  CITATIONS_INSTRUCTION,
  deleteChat,
  type ChatEdit,
  REDLINE_INSTRUCTION,
  commitStagedDocuments,
  getDocument,
  getEditsByRef,
  type ChatMessage,
  DEFAULT_MODEL,
  getChat,
  getLlmClient,
  getMatter,
  getUserJurisdiction,
  getUserTenant,
  hasMatterAccess,
  listAllChats,
  listChats,
  listMatterDocuments,
  LLM_MODELS,
  parseCitations,
  persistChat,
  providerForModel,
  recordLlmUsage,
  resolveLlmKey,
  setChatPinned,
  streamComplete,
  type ToolDef,
} from "@workspace/core";
import { resolveJurisdiction } from "@workspace/registry";
import { connectEnabledServers } from "../../mcp/client.js";
import { type AuthEnv } from "../middleware/auth.js";
import { chatSchema, pinSchema } from "../schemas/chat.js";

export const chatRoute = new Hono<AuthEnv>();

// Flatten an MCP tool result's content blocks into plain text for the model.
function mcpResultText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content))
    return content
      .map((b) =>
        b && typeof b === "object" && "text" in b
          ? String((b as { text: unknown }).text)
          : JSON.stringify(b)
      )
      .join("\n");
  return JSON.stringify(content);
}

// Catalog tools carry a zod raw shape; the LLM tool API wants a JSON Schema.
function toJsonSchema(shape: z.ZodRawShape): Record<string, unknown> {
  const js = z.toJSONSchema(z.object(shape)) as Record<string, unknown>;
  delete js.$schema;
  return js;
}

// Real document ids are uuids; client temp upload ids (`upload:<uuid>`) are not.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Labels for the attachment reference line, by attachment kind.
const ATTACH_LABELS: Record<string, string> = {
  document: "Document",
  matter: "Matter",
  client: "Client",
  review: "Review",
};

// Prepend a reference line for the NON-document attachments (matter/client/review)
// the user added this turn, so the model knows to read them with the catalog tools.
// Documents are handled separately and stickily by attachmentsContextBlock.
function withAttachments(
  message: string,
  attachments: { kind: string; id: string; label: string }[]
) {
  const refs = attachments
    .filter((a) => a.kind !== "document")
    .map((a) => `- ${ATTACH_LABELS[a.kind] ?? a.kind}: ${a.label} (id: ${a.id})`);
  if (!refs.length) return message;
  return `[The user attached the following for context. Read them with the available tools (get_review, list_matter_documents, list_matters, list_clients) as needed:\n${refs.join("\n")}]\n\n${message}`;
}

// Attached documents stay "sticky" to a conversation: this block re-lists them in
// the system prompt on EVERY turn (not just the turn they were sent on), with the
// key instruction — borrowed from mike — that the model does NOT retain document
// content between turns and must re-read on demand. Without this, a follow-up like
// "what's on page 5?" arrives with no document in context, so the model guesses or
// reads the wrong file. The page-marker note keeps page-specific answers honest:
// extracted text carries sequential [Page N] markers, so the model can only answer
// per-page questions from the matching block. Returns "" when nothing's attached.
async function attachmentsContextBlock(userId: string, docIds: string[]): Promise<string> {
  const lines: string[] = [];
  for (const id of docIds) {
    if (!(await canAccessArtifact(userId, "document", id))) continue;
    const doc = await getDocument(id);
    if (!doc) continue;
    const pages = doc.pageCount ? `, ${doc.pageCount} pages` : "";
    lines.push(`- "${doc.title}" (id: ${id}${pages})`);
  }
  if (!lines.length) return "";
  return `\n\n[Attached documents] The user attached these documents to THIS conversation; treat them as the primary context:\n${lines.join("\n")}\nYou do NOT retain document content between turns. At the START of every response that involves a document's content, call get_document with its id (even if you read it earlier in this conversation) — otherwise you will use stale or hallucinated text. The returned markdown marks pages as sequential [Page N] markers; answer page-specific questions ONLY from the matching [Page N] block and cite pages by that marker. If a page isn't present, say so rather than guessing. Answer from these attached documents; do not list or search other matters or documents unless the user explicitly asks for them.`;
}

// A matter-scoped chat carries its matter as ambient context: the matter name
// plus a metadata index (id + title + type + status) of its documents — NOT
// their content. The model reads any document on demand with get_document, so
// the same file is never re-sent turn after turn. Returns "" when the matter is
// inaccessible or there's no matter scope.
async function matterContextBlock(
  userId: string,
  matterId: string,
  activeDocumentId?: string
): Promise<string> {
  if (!(await hasMatterAccess(userId, matterId, "viewer"))) return "";
  const matter = await getMatter(matterId);
  if (!matter) return "";
  const docs = await listMatterDocuments(matterId);
  const openDoc = activeDocumentId ? docs.find((d) => d.id === activeDocumentId) : undefined;
  const docLines = docs.length
    ? docs
        .map(
          (d) =>
            `- ${d.title} (id: ${d.id}, ${d.fileType}, ${d.status})${
              d.id === openDoc?.id ? " — currently open in the viewer" : ""
            }`
        )
        .join("\n")
    : "- (no documents filed yet)";
  const openLine = openDoc
    ? `\nThe user is looking at "${openDoc.title}" (id: ${openDoc.id}) right now — treat "this document" or "the open document" as referring to it.`
    : "";
  return `\n\n[Matter context] This conversation is filed under the matter "${matter.name}" (id: ${matterId}). Documents in this matter:\n${docLines}${openLine}\nThe user can see and open these in their workspace. To read one, call get_document with its id (or fetch); call list_matter_documents to refresh the list. You already have these ids — don't ask the user for them.`;
}

class HttpError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
}

type ChatBody = z.infer<typeof chatSchema>;

// Live callbacks for the streaming route. The buffered route passes none.
type RunHandlers = {
  onText?: (delta: string) => void;
  onReasoning?: (delta: string) => void;
  onTool?: (name: string, input: unknown) => void;
};

type ChatResult = {
  chatId: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  tools: string[];
  jurisdiction: string;
  documents: Array<{ id: string; title: string; download: string }>;
  edits: ChatEdit[];
  citations: ReturnType<typeof parseCitations>["citations"];
};

/**
 * Run the assistant's tool loop once and return the final payload. Streams token
 * deltas through `handlers` when given; otherwise buffers. Shared by the buffered
 * (/api/chat) and SSE (/api/chat/stream) routes so they never drift.
 */
async function runAssistant(
  user: { id: string; name: string },
  body: ChatBody,
  handlers: RunHandlers
): Promise<ChatResult> {
  // Model picks the provider; the key is the user's own, else the server's.
  const model = body.model ?? DEFAULT_MODEL;
  const provider = providerForModel(model);
  const { key } = await resolveLlmKey(user.id, provider);
  if (!key) throw new HttpError(400, `No API key for ${provider} (set one in Settings)`);
  const client = getLlmClient(provider, key);

  // Drop the thinking request for known non-reasoning models so they don't reject
  // it. Unknown ids (OpenRouter) pass through — those providers ignore what they
  // can't use.
  const caps = LLM_MODELS.find((m) => m.id === model)?.capabilities;
  const reasoning = caps && !caps.reasoning ? undefined : body.reasoning;

  // Jurisdiction: request override > user default > system default.
  const jurisdiction = resolveJurisdiction(body.jurisdiction, await getUserJurisdiction(user.id));

  // Resolved once for usage metering across the tool loop's completions.
  const tenantId = await getUserTenant(user.id);

  // Shared gitmatter tools — the same catalog the MCP server exposes.
  const actor: Actor = { type: "agent", userId: user.id, agentLabel: "chat" };
  const catalog = buildToolCatalog(actor, { jurisdiction, defaultMatterLabel: user.name });
  const internal = new Map(catalog.map((t) => [t.name, t.handler]));
  const tools: ToolDef[] = catalog.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: toJsonSchema(t.schema),
  }));

  // External MCP servers (jurisdiction-scoped) layer on top of the catalog.
  const servers = await connectEnabledServers(user.id, jurisdiction);
  const toolMap = new Map<
    string,
    { realName: string; client: (typeof servers)[number]["client"] }
  >();
  for (const s of servers)
    for (const t of s.tools) {
      toolMap.set(t.name, { realName: t.realName, client: s.client });
      tools.push({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      });
    }

  const generated: Array<{ id: string; title: string; download: string }> = [];
  // Tracked changes the assistant proposed/resolved this turn, hydrated into
  // chat cards after the loop.
  const editRefs: Array<{ documentId: string; changeId: string }> = [];

  // Continue a conversation: replay prior user/assistant turns (text only) so the
  // model has context, then append this turn.
  const prior = body.chatId ? await getChat(user.id, body.chatId) : null;
  const messages: ChatMessage[] = [];
  for (const turn of prior?.turns ?? [])
    messages.push(
      turn.role === "user"
        ? { role: "user", content: turn.text }
        : { role: "assistant", content: turn.text }
    );
  const attachments = body.attachments ?? [];
  // Documents attached this turn. Resolve to real, owned doc ids before anything
  // persists them: the client id is briefly a temp id (`upload:<uuid>`) until the
  // real one swaps in, so drop anything that doesn't resolve to an accessible row.
  // This keeps the sticky `attachmentDocIds` clean for every future turn — the model
  // is never handed a bogus id it could chase to the wrong (or no) document.
  // Shape guard first: a temp id (`upload:<uuid>`) isn't a uuid, and querying a
  // uuid column with it would throw rather than miss.
  const rawTurnDocIds = attachments
    .filter((a) => a.kind === "document")
    .map((a) => a.id)
    .filter((id) => UUID_RE.test(id));
  const turnDocIds = (
    await Promise.all(
      rawTurnDocIds.map(async (id) =>
        (await canAccessArtifact(user.id, "document", id)) && (await getDocument(id)) ? id : null
      )
    )
  ).filter((id): id is string => id !== null);
  // Sending the turn commits any staged chat uploads it carries into the library.
  if (turnDocIds.length) await commitStagedDocuments(user.id, turnDocIds);
  // Sticky attachments: this turn's docs plus every doc attached on a prior turn, so
  // the model keeps seeing them for the whole conversation (deduped).
  const priorDocIds = (prior?.turns ?? []).flatMap((t) => t.attachmentDocIds ?? []);
  const attachedDocIds = [...new Set([...priorDocIds, ...turnDocIds])];
  messages.push({ role: "user", content: withAttachments(body.message, attachments) });

  // Matter scope: from the request (new chat) or the chat row (continuation).
  // Inject the matter's document index into the system prompt once per request.
  const matterId = body.matterId ?? prior?.matterId ?? undefined;
  const base = `${CITATIONS_INSTRUCTION}\n\n${REDLINE_INSTRUCTION}`;
  const system =
    (matterId
      ? base + (await matterContextBlock(user.id, matterId, body.activeDocumentId))
      : base) + (await attachmentsContextBlock(user.id, attachedDocIds));
  const toolCalls: Array<{ tool: string; input: unknown }> = [];
  let finalText = "";

  try {
    for (let i = 0; i < 8; i++) {
      const res = await streamComplete(
        client,
        {
          model,
          system,
          tools: tools.length ? tools : undefined,
          messages,
          reasoning,
          maxTokens: 4096,
          cache: true,
          cacheKey: `chat:${user.id}`,
        },
        { onText: handlers.onText, onReasoning: handlers.onReasoning }
      );
      finalText = res.text;
      // Meter this completion's token spend (log-only; never blocks the turn).
      if (res.usage)
        void recordLlmUsage({
          userId: user.id,
          tenantId,
          provider,
          model,
          inputTokens: res.usage.inputTokens,
          outputTokens: res.usage.outputTokens,
        });
      messages.push({
        role: "assistant",
        content: res.text,
        toolCalls: res.toolCalls,
        reasoning: res.reasoning,
      });
      if (res.stop !== "tool_use" || !res.toolCalls.length) break;

      for (const tc of res.toolCalls) {
        toolCalls.push({ tool: tc.name, input: tc.input });
        handlers.onTool?.(tc.name, tc.input);
        try {
          const internalFn = internal.get(tc.name);
          if (internalFn) {
            const out = await internalFn(tc.input);
            if (
              tc.name === "generate_docx" &&
              out &&
              typeof out === "object" &&
              "documentId" in out
            ) {
              const g = out as { documentId: string; title: string; download: string };
              generated.push({ id: g.documentId, title: g.title, download: g.download });
            }
            if (
              (tc.name === "propose_document_edit" || tc.name === "resolve_document_edit") &&
              out &&
              typeof out === "object" &&
              !("error" in out)
            ) {
              const documentId = (tc.input as { documentId?: string })?.documentId;
              // propose returns a changeId per applied edit; resolve carries one in its input.
              const changeIds =
                tc.name === "propose_document_edit"
                  ? ((out as { changeIds?: string[] }).changeIds ?? [])
                  : [(tc.input as { changeId?: string })?.changeId].filter((x): x is string => !!x);
              if (documentId)
                for (const changeId of changeIds) editRefs.push({ documentId, changeId });
            }
            messages.push({ role: "tool", toolCallId: tc.id, content: JSON.stringify(out) });
            continue;
          }
          const target = toolMap.get(tc.name);
          if (!target) {
            messages.push({
              role: "tool",
              toolCallId: tc.id,
              content: "Unknown tool",
              isError: true,
            });
            continue;
          }
          const out = await target.client.callTool({ name: target.realName, arguments: tc.input });
          messages.push({
            role: "tool",
            toolCallId: tc.id,
            content: mcpResultText(out.content),
            isError: Boolean(out.isError),
          });
        } catch (e) {
          messages.push({
            role: "tool",
            toolCallId: tc.id,
            content: e instanceof Error ? e.message : "tool failed",
            isError: true,
          });
        }
      }
    }
  } finally {
    await Promise.all(servers.map((s) => s.client.close().catch(() => {})));
  }

  // Split the citations block off the prose; store the array, show clean text.
  const { text: displayText, citations } = parseCitations(finalText);
  const edits = await getEditsByRef(editRefs);
  const chatId = await persistChat(
    user.id,
    {
      message: body.message,
      finalText: displayText,
      toolCalls,
      citations,
      edits,
      attachmentDocIds: turnDocIds.length ? turnDocIds : undefined,
    },
    body.chatId,
    body.matterId
  );

  return {
    chatId,
    text: displayText,
    toolCalls,
    tools: tools.map((t) => t.name),
    jurisdiction,
    documents: generated,
    edits,
    citations,
  };
}

// Buffered: returns the whole answer as one JSON response.
chatRoute.post("/api/chat", zValidator("json", chatSchema), async (c) => {
  const user = c.get("user");
  try {
    return c.json(await runAssistant(user, c.req.valid("json"), {}));
  } catch (e) {
    if (e instanceof HttpError) return c.json({ error: e.message }, e.status as 400);
    return c.json({ error: e instanceof Error ? e.message : "chat failed" }, 500);
  }
});

// Streaming: Server-Sent Events. `text`/`reasoning` carry token deltas, `tool`
// names a running tool, `done` carries the final payload, `error` a failure.
chatRoute.post("/api/chat/stream", zValidator("json", chatSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");
  return streamSSE(c, async (stream) => {
    try {
      const result = await runAssistant(user, body, {
        onText: (delta) => void stream.writeSSE({ event: "text", data: JSON.stringify(delta) }),
        onReasoning: (delta) =>
          void stream.writeSSE({ event: "reasoning", data: JSON.stringify(delta) }),
        onTool: (name, input) =>
          void stream.writeSSE({ event: "tool", data: JSON.stringify({ name, input }) }),
      });
      await stream.writeSSE({ event: "done", data: JSON.stringify(result) });
    } catch (e) {
      const message = e instanceof Error ? e.message : "chat failed";
      await stream.writeSSE({ event: "error", data: JSON.stringify(message) });
    }
  });
});

// List the user's conversations for the history panel. `?scope=all` returns every
// chat (global + matter-scoped) for the ChatGPT-style sidebar; `?matterId=` scopes
// to one matter; omitted returns global (unscoped) chats.
chatRoute.get("/api/chats", async (c) => {
  const userId = c.get("user").id;
  if (c.req.query("scope") === "all") return c.json(await listAllChats(userId));
  return c.json(await listChats(userId, c.req.query("matterId")));
});

// Pin/unpin a conversation so it floats to the sidebar's Pinned section.
chatRoute.patch("/api/chats/:id/pin", zValidator("json", pinSchema), async (c) => {
  await setChatPinned(c.get("user").id, c.req.param("id"), c.req.valid("json").pinned);
  return c.json({ ok: true });
});

// Delete a conversation (and its messages via cascade) — scoped to its owner.
chatRoute.delete("/api/chats/:id", async (c) => {
  await deleteChat(c.get("user").id, c.req.param("id"));
  return c.json({ ok: true });
});

// Load one conversation's turns to resume it.
chatRoute.get("/api/chats/:id", async (c) => {
  const chat = await getChat(c.get("user").id, c.req.param("id"));
  if (!chat) return c.json({ error: "Not found" }, 404);
  return c.json(chat);
});
