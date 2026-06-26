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
  type ChatTraceEvent,
  type ChatTraceKind,
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
import { type AuthEnv } from "../middleware/auth.js";
import { chatSchema, pinSchema } from "../schemas/chat.js";

export const chatRoute = new Hono<AuthEnv>();

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
// key instruction that the model does NOT retain document content between turns
// and must re-read on demand. Without this, a follow-up like
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
  onTrace?: (event: ChatTraceEvent) => void;
  onTool?: (name: string, input: unknown) => void;
};

type ChatResult = {
  chatId: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  trace: ChatTraceEvent[];
  tools: string[];
  jurisdiction: string;
  documents: Array<{ id: string; title: string; download: string }>;
  edits: ChatEdit[];
  citations: ReturnType<typeof parseCitations>["citations"];
};

function nowIso() {
  return new Date().toISOString();
}

function traceId() {
  return crypto.randomUUID();
}

function startTrace(
  trace: ChatTraceEvent[],
  handlers: RunHandlers,
  event: {
    kind: ChatTraceKind;
    label: string;
    summary?: string;
    detail?: Record<string, unknown>;
  }
) {
  const item: ChatTraceEvent = {
    id: traceId(),
    status: "running",
    startedAt: nowIso(),
    ...event,
  };
  trace.push(item);
  handlers.onTrace?.(item);
  return item;
}

function finishTrace(
  trace: ChatTraceEvent[],
  handlers: RunHandlers,
  item: ChatTraceEvent,
  patch: Partial<Pick<ChatTraceEvent, "status" | "summary" | "detail">> = {}
) {
  const endedAt = nowIso();
  const started = item.startedAt ? new Date(item.startedAt).getTime() : Date.now();
  const next: ChatTraceEvent = {
    ...item,
    ...patch,
    status: patch.status ?? "done",
    endedAt,
    durationMs: Math.max(0, Date.now() - started),
  };
  const index = trace.findIndex((e) => e.id === item.id);
  if (index >= 0) trace[index] = next;
  handlers.onTrace?.(next);
  return next;
}

function updateTrace(
  trace: ChatTraceEvent[],
  handlers: RunHandlers,
  item: ChatTraceEvent,
  patch: Partial<Pick<ChatTraceEvent, "summary" | "detail">>
) {
  const next: ChatTraceEvent = { ...item, ...patch };
  const index = trace.findIndex((e) => e.id === item.id);
  if (index >= 0) trace[index] = next;
  handlers.onTrace?.(next);
  return next;
}

function fileSummary(label: string, pageCount?: number | null) {
  return pageCount ? `${label} (${pageCount} pages)` : label;
}

function resultLabel(value: unknown): string | null {
  if (typeof value === "string" || typeof value === "number") return String(value);
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  for (const key of ["title", "name", "label", "source", "url", "number", "id"]) {
    const raw = item[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number") return String(raw);
  }
  return null;
}

// Flatten a tool result into its list of items, looking under the common
// container keys the tools use ("results", "sources", "trademarks", …).
function collectResults(output: unknown): unknown[] {
  if (Array.isArray(output)) return output;
  if (output && typeof output === "object") {
    const object = output as Record<string, unknown>;
    const values: unknown[] = [];
    for (const key of [
      "sources",
      "results",
      "items",
      "documents",
      "rows",
      "trademarks",
      "opinions",
    ]) {
      const raw = object[key];
      if (Array.isArray(raw)) values.push(...raw);
    }
    return values;
  }
  return [];
}

function resultLabels(output: unknown): string[] {
  return [
    ...new Set(
      collectResults(output)
        .map(resultLabel)
        .filter((label): label is string => !!label)
    ),
  ].slice(0, 6);
}

// One normalized result row for the activity drawer's "Sources" cards. Shape
// mirrors `SourceCard` on the web side (apps/web/src/lib/data/api.ts).
function pickStr(item: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const raw = item[key];
    if (typeof raw === "string" && raw.trim()) return raw.trim();
    if (typeof raw === "number") return String(raw);
  }
  return undefined;
}

function domainOf(url: string): string | undefined {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return undefined;
  }
}

// Richer per-result capture so the drawer can render Perplexity-style cards.
// Bounded (count + snippet length) to keep the persisted trace small. Returns
// undefined when the output has no list-like results.
function sourceCards(output: unknown) {
  const items = collectResults(output).filter(
    (v): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v)
  );
  const cards = items
    .slice(0, 20)
    .map((item) => {
      const title = pickStr(item, [
        "title",
        "caseName",
        "words",
        "inventionTitle",
        "name",
        "label",
        "number",
        "id",
      ]);
      if (!title) return null;
      const rawSnippet = pickStr(item, [
        "snippet",
        "text",
        "summary",
        "reasoning",
        "statusDetail",
        "description",
      ]);
      const snippet = rawSnippet
        ? rawSnippet.length > 300
          ? `${rawSnippet.slice(0, 300)}...`
          : rawSnippet
        : undefined;
      const url = pickStr(item, ["absoluteUrl", "url"]);
      const idVal = pickStr(item, ["id"]);
      // Internal artifact id: `document:{uuid}` / `review:{uuid}`, or a /documents|/reviews path.
      let docId: string | undefined;
      const idMatch = idVal?.match(/^(?:document|review):(.+)$/);
      if (idMatch) docId = idMatch[1];
      else if (url && /^\/(documents|reviews)\//.test(url))
        docId = url.split("/").pop() || undefined;
      const metadata = item.metadata;
      const source =
        pickStr(item, ["source", "court", "statusGroup"]) ??
        (metadata && typeof metadata === "object"
          ? pickStr(metadata as Record<string, unknown>, ["type"])
          : undefined) ??
        (url && /^https?:/.test(url) ? domainOf(url) : undefined);
      const page = typeof item.page === "number" ? item.page : undefined;
      return { title, snippet, source, url, docId, page };
    })
    .filter((card): card is NonNullable<typeof card> => card !== null);
  return cards.length ? cards : undefined;
}

function outputSummary(output: unknown): Record<string, unknown> {
  if (typeof output === "string")
    return {
      resultType: "string",
      length: output.length,
      preview: output.length > 240 ? `${output.slice(0, 240)}...` : output,
    };
  if (!output || typeof output !== "object") return { result: output };
  if (Array.isArray(output))
    return { resultType: "array", count: output.length, results: resultLabels(output) };
  const entries = Object.entries(output as Record<string, unknown>);
  return {
    resultType: "object",
    keys: entries.map(([key]) => key).slice(0, 12),
    results: resultLabels(output),
  };
}

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
  const trace: ChatTraceEvent[] = [];
  const assess = startTrace(trace, handlers, {
    kind: "assess_query",
    label: "Assessing query",
    summary: body.message,
  });

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
  const catalog = buildToolCatalog(actor, {
    jurisdiction,
    defaultMatterLabel: user.name,
    sourceIds: body.sourceIds,
  });
  const internal = new Map(catalog.map((t) => [t.name, t.handler]));
  const tools: ToolDef[] = catalog.map((t) => ({
    name: t.name,
    description: t.description,
    inputSchema: toJsonSchema(t.schema),
  }));

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
  for (const id of turnDocIds) {
    const doc = await getDocument(id);
    if (!doc) continue;
    const fileTrace = startTrace(trace, handlers, {
      kind: "review_file",
      label: "Reviewing attached file",
      summary: fileSummary(doc.title, doc.pageCount),
      detail: {
        documentId: doc.id,
        title: doc.title,
        fileType: doc.fileType,
        pageCount: doc.pageCount,
      },
    });
    finishTrace(trace, handlers, fileTrace);
  }
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
  finishTrace(trace, handlers, assess, {
    detail: {
      model,
      provider,
      jurisdiction,
      attachmentCount: attachedDocIds.length,
      matterId: matterId ?? null,
    },
  });
  const toolCalls: Array<{ tool: string; input: unknown }> = [];
  let finalText = "";
  let thinking: ChatTraceEvent | null = null;
  let thinkingText = "";

  for (let i = 0; i < 8; i++) {
    const draft = startTrace(trace, handlers, {
      kind: "draft_answer",
      label: i === 0 ? "Drafting answer" : "Continuing answer",
      detail: { pass: i + 1 },
    });
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
      {
        onText: handlers.onText,
        onReasoning: (delta) => {
          thinkingText += delta;
          if (thinking) {
            thinking = updateTrace(trace, handlers, thinking, {
              summary: thinkingText,
              detail: { text: thinkingText },
            });
          } else {
            thinking = startTrace(trace, handlers, {
              kind: "thinking_process",
              label: "Thinking process",
              summary: thinkingText,
              detail: { text: thinkingText },
            });
          }
          handlers.onReasoning?.(delta);
        },
      }
    );
    const activeThinking = thinking as ChatTraceEvent | null;
    if (activeThinking?.status === "running") {
      finishTrace(trace, handlers, activeThinking, {
        summary: thinkingText,
        detail: { text: thinkingText },
      });
      thinking = null;
      thinkingText = "";
    }
    finalText = res.text;
    finishTrace(trace, handlers, draft, {
      summary:
        res.stop === "tool_use" && res.toolCalls.length
          ? `Prepared ${res.toolCalls.length} tool call${res.toolCalls.length > 1 ? "s" : ""}`
          : "Prepared final response",
      detail: { pass: i + 1, stop: res.stop, toolCallCount: res.toolCalls.length },
    });
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
      const toolTrace = startTrace(trace, handlers, {
        kind: "tool_call",
        label: "Running tool",
        summary: tc.name.replace(/_/g, " "),
        detail: { tool: tc.name, input: tc.input },
      });
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
          const cards = sourceCards(out);
          finishTrace(trace, handlers, toolTrace, {
            summary: tc.name.replace(/_/g, " "),
            detail: {
              tool: tc.name,
              input: tc.input,
              output: outputSummary(out),
              ...(cards ? { sources: cards } : {}),
            },
          });
          continue;
        }
        // Not an internal catalog tool — nothing else is exposed.
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          content: "Unknown tool",
          isError: true,
        });
        finishTrace(trace, handlers, toolTrace, {
          status: "error",
          summary: "Unknown tool",
          detail: { tool: tc.name, input: tc.input, error: "Unknown tool" },
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : "tool failed";
        messages.push({
          role: "tool",
          toolCallId: tc.id,
          content: message,
          isError: true,
        });
        finishTrace(trace, handlers, toolTrace, {
          status: "error",
          summary: message,
          detail: { tool: tc.name, input: tc.input, error: message },
        });
      }
    }
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
      trace,
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
    trace,
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
        onTrace: (event) => void stream.writeSSE({ event: "trace", data: JSON.stringify(event) }),
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
