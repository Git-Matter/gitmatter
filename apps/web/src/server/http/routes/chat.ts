import { Hono } from "hono";
import { streamSSE } from "hono/streaming";
import { zValidator } from "@hono/zod-validator";
import { z } from "zod";
import {
  type Actor,
  buildToolCatalog,
  CITATIONS_INSTRUCTION,
  type ChatMessage,
  DEFAULT_MODEL,
  getChat,
  getLlmClient,
  getUserJurisdiction,
  listChats,
  LLM_MODELS,
  parseCitations,
  persistChat,
  providerForModel,
  resolveLlmKey,
  streamComplete,
  type ToolDef,
} from "@workspace/core";
import { resolveJurisdiction } from "@workspace/registry";
import { connectEnabledServers } from "../../mcp/client.js";
import { type AuthEnv } from "../middleware/auth.js";
import { chatSchema } from "../schemas/chat.js";

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

// Labels for the attachment reference line, by attachment kind.
const ATTACH_LABELS: Record<string, string> = {
  document: "Document",
  matter: "Matter",
  client: "Client",
  review: "Review",
};

// Prepend a note listing what the user attached, so the model knows to read those
// artifacts via the catalog tools (fetch / get_review / list_matters / …).
function withAttachments(
  message: string,
  attachments: { kind: string; id: string; label: string }[]
) {
  if (!attachments.length) return message;
  const lines = attachments.map(
    (a) => `- ${ATTACH_LABELS[a.kind] ?? a.kind}: ${a.label} (id: ${a.id})`
  );
  return `[The user attached the following for context. Read them with the available tools (fetch, get_review, get_contract, list_matters, list_clients) as needed:\n${lines.join("\n")}]\n\n${message}`;
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
  onTool?: (name: string) => void;
};

type ChatResult = {
  chatId: string;
  text: string;
  toolCalls: Array<{ tool: string; input: unknown }>;
  tools: string[];
  jurisdiction: string;
  documents: Array<{ id: string; title: string; download: string }>;
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

  // Shared gitcounsel tools — the same catalog the MCP server exposes.
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

  // Continue a conversation: replay prior user/assistant turns (text only) so the
  // model has context, then append this turn.
  const messages: ChatMessage[] = [];
  if (body.chatId) {
    const prior = await getChat(user.id, body.chatId);
    for (const turn of prior?.turns ?? [])
      messages.push(
        turn.role === "user"
          ? { role: "user", content: turn.text }
          : { role: "assistant", content: turn.text }
      );
  }
  messages.push({ role: "user", content: withAttachments(body.message, body.attachments ?? []) });
  const toolCalls: Array<{ tool: string; input: unknown }> = [];
  let finalText = "";

  try {
    for (let i = 0; i < 8; i++) {
      const res = await streamComplete(
        client,
        {
          model,
          system: CITATIONS_INSTRUCTION,
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
      messages.push({
        role: "assistant",
        content: res.text,
        toolCalls: res.toolCalls,
        reasoning: res.reasoning,
      });
      if (res.stop !== "tool_use" || !res.toolCalls.length) break;

      for (const tc of res.toolCalls) {
        toolCalls.push({ tool: tc.name, input: tc.input });
        handlers.onTool?.(tc.name);
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
  const chatId = await persistChat(
    user.id,
    { message: body.message, finalText: displayText, toolCalls, citations },
    body.chatId
  );

  return {
    chatId,
    text: displayText,
    toolCalls,
    tools: tools.map((t) => t.name),
    jurisdiction,
    documents: generated,
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
        onTool: (name) => void stream.writeSSE({ event: "tool", data: JSON.stringify(name) }),
      });
      await stream.writeSSE({ event: "done", data: JSON.stringify(result) });
    } catch (e) {
      const message = e instanceof Error ? e.message : "chat failed";
      await stream.writeSSE({ event: "error", data: JSON.stringify(message) });
    }
  });
});

// List the user's conversations for the history panel.
chatRoute.get("/api/chats", async (c) => c.json(await listChats(c.get("user").id)));

// Load one conversation's turns to resume it.
chatRoute.get("/api/chats/:id", async (c) => {
  const chat = await getChat(c.get("user").id, c.req.param("id"));
  if (!chat) return c.json({ error: "Not found" }, 404);
  return c.json(chat);
});
