import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import {
  buildDocxSpec,
  CITATIONS_INSTRUCTION,
  type ChatMessage,
  createGeneratedDocument,
  DEFAULT_MODEL,
  getLlmClient,
  getUserJurisdiction,
  type LooseDocxBlock,
  parseCitations,
  persistChat,
  providerForModel,
  resolveLlmKey,
  searchCaseLaw,
  type ToolDef,
  verifyCitations,
} from "@workspace/core";
import { providersFor, resolveJurisdiction } from "@workspace/registry";
import { connectEnabledServers } from "../../mcp/client.js";
import { type AuthEnv } from "../middleware/auth.js";
import { resolveCreateMatter } from "../lib/matter.js";
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

chatRoute.post("/api/chat", zValidator("json", chatSchema), async (c) => {
  const user = c.get("user");
  const body = c.req.valid("json");

  // Model picks the provider; the key is the user's own, else the server's.
  const model = body.model ?? DEFAULT_MODEL;
  const provider = providerForModel(model);
  const { key } = await resolveLlmKey(user.id, provider);
  if (!key) return c.json({ error: `No API key for ${provider} (set one in Settings)` }, 400);
  const client = getLlmClient(provider, key);

  // Jurisdiction: request override > user default > system default. It dictates
  // which MCP providers connect (e.g. CourtListener only for US).
  const jurisdiction = resolveJurisdiction(body.jurisdiction, await getUserJurisdiction(user.id));
  const servers = await connectEnabledServers(user.id, jurisdiction);
  const toolMap = new Map<
    string,
    { realName: string; client: (typeof servers)[number]["client"] }
  >();
  const tools: ToolDef[] = servers.flatMap((s) =>
    s.tools.map((t) => {
      toolMap.set(t.name, { realName: t.realName, client: s.client });
      return {
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema as Record<string, unknown>,
      };
    })
  );

  // Baked-in internal tools, dispatched in-process.
  const internal = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
  if (providersFor(jurisdiction).some((p) => p.id === "courtlistener")) {
    tools.push({
      name: "search_case_law",
      description: "Search US case law opinions (CourtListener) by keyword.",
      inputSchema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    });
    internal.set("search_case_law", (i) => searchCaseLaw(i as { query: string }));
    tools.push({
      name: "verify_citations",
      description: "Verify US reporter citations against CourtListener.",
      inputSchema: {
        type: "object",
        properties: { citations: { type: "array", items: { type: "string" } } },
        required: ["citations"],
      },
    });
    internal.set("verify_citations", (i) =>
      verifyCitations((i as { citations: string[] }).citations)
    );
  }

  // Document generation — always available. Generated files land as document
  // artifacts and surface as download cards in the UI.
  const generated: Array<{ id: string; title: string; download: string }> = [];
  tools.push({
    name: "generate_docx",
    description:
      "Generate a downloadable Word (.docx) from structured blocks: {type:'heading',text,level?} | {type:'paragraph',text} | {type:'table',rows:[[..]]} (first row is the header).",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string" },
        blocks: { type: "array", items: { type: "object" } },
      },
      required: ["title", "blocks"],
    },
  });
  internal.set("generate_docx", async (i) => {
    const matterId = await resolveCreateMatter(user);
    if (!matterId) return { error: "No matter to file the document under" };
    const { title, blocks } = i as { title: string; blocks: LooseDocxBlock[] };
    const doc = await createGeneratedDocument(
      { type: "agent", userId: user.id, agentLabel: "chat" },
      { matterId, spec: buildDocxSpec(title, blocks ?? []) }
    );
    const download = `/api/documents/${doc.id}/download`;
    generated.push({ id: doc.id, title: doc.title, download });
    return { documentId: doc.id, title: doc.title, download };
  });

  const messages: ChatMessage[] = [{ role: "user", content: body.message }];
  const toolCalls: Array<{ tool: string; input: unknown }> = [];
  let finalText = "";

  try {
    for (let i = 0; i < 8; i++) {
      const res = await client.complete({
        model,
        system: CITATIONS_INSTRUCTION,
        tools: tools.length ? tools : undefined,
        messages,
      });
      finalText = res.text;
      messages.push({ role: "assistant", content: res.text, toolCalls: res.toolCalls });
      if (res.stop !== "tool_use" || !res.toolCalls.length) break;

      for (const tc of res.toolCalls) {
        toolCalls.push({ tool: tc.name, input: tc.input });
        try {
          const internalFn = internal.get(tc.name);
          if (internalFn) {
            const out = await internalFn(tc.input);
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
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "chat failed" }, 500);
  } finally {
    await Promise.all(servers.map((s) => s.client.close().catch(() => {})));
  }

  // Split the citations block off the prose; store the array, show clean text.
  const { text: displayText, citations } = parseCitations(finalText);
  await persistChat(user.id, {
    message: body.message,
    finalText: displayText,
    toolCalls,
    citations,
  });

  return c.json({
    text: displayText,
    toolCalls,
    tools: tools.map((t) => t.name),
    jurisdiction,
    documents: generated,
    citations,
  });
});
