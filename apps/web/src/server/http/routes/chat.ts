import { Hono } from "hono";
import { zValidator } from "@hono/zod-validator";
import Anthropic from "@anthropic-ai/sdk";
import {
  DEFAULT_MODEL,
  getUserApiKey,
  getUserJurisdiction,
  persistChat,
  searchCaseLaw,
  verifyCitations,
} from "@workspace/core";
import { providersFor, resolveJurisdiction } from "@workspace/registry";
import { connectEnabledServers } from "../../mcp/client.js";
import { type AuthEnv } from "../middleware/auth.js";
import { chatSchema } from "../schemas/chat.js";

export const chatRoute = new Hono<AuthEnv>();

chatRoute.post("/api/chat", zValidator("json", chatSchema), async (c) => {
  const user = c.get("user");

  const apiKey = await getUserApiKey(user.id, "anthropic");
  if (!apiKey) return c.json({ error: "No Anthropic key set" }, 400);

  const body = c.req.valid("json");

  // Jurisdiction: request override > user default > system default. It dictates
  // which MCP providers connect (e.g. CourtListener only for US).
  const jurisdiction = resolveJurisdiction(body.jurisdiction, await getUserJurisdiction(user.id));
  const servers = await connectEnabledServers(user.id, jurisdiction);
  const toolMap = new Map<
    string,
    { slug: string; realName: string; client: (typeof servers)[number]["client"] }
  >();
  const tools: Anthropic.Tool[] = servers.flatMap((s) =>
    s.tools.map((t) => {
      toolMap.set(t.name, { slug: s.slug, realName: t.realName, client: s.client });
      return {
        name: t.name,
        description: t.description,
        input_schema: t.inputSchema as Anthropic.Tool.InputSchema,
      };
    })
  );

  // Baked-in internal tools (jurisdiction-gated), dispatched in-process.
  const internal = new Map<string, (input: Record<string, unknown>) => Promise<unknown>>();
  if (providersFor(jurisdiction).some((p) => p.id === "courtlistener")) {
    tools.push({
      name: "search_case_law",
      description: "Search US case law opinions (CourtListener) by keyword.",
      input_schema: {
        type: "object",
        properties: { query: { type: "string" } },
        required: ["query"],
      },
    });
    internal.set("search_case_law", (i) => searchCaseLaw(i as { query: string }));
    tools.push({
      name: "verify_citations",
      description: "Verify US reporter citations against CourtListener.",
      input_schema: {
        type: "object",
        properties: { citations: { type: "array", items: { type: "string" } } },
        required: ["citations"],
      },
    });
    internal.set("verify_citations", (i) =>
      verifyCitations((i as { citations: string[] }).citations)
    );
  }

  const anthropic = new Anthropic({ apiKey });
  const messages: Anthropic.MessageParam[] = [{ role: "user", content: body.message }];
  const toolCalls: Array<{ tool: string; input: unknown }> = [];
  let finalText = "";

  try {
    for (let i = 0; i < 8; i++) {
      const res = await anthropic.messages.create({
        model: DEFAULT_MODEL,
        max_tokens: 2048,
        tools: tools.length ? tools : undefined,
        messages,
      });
      messages.push({ role: "assistant", content: res.content });
      finalText = res.content
        .filter((b): b is Anthropic.TextBlock => b.type === "text")
        .map((b) => b.text)
        .join("");
      if (res.stop_reason !== "tool_use") break;

      const results: Anthropic.ToolResultBlockParam[] = [];
      for (const block of res.content) {
        if (block.type !== "tool_use") continue;
        toolCalls.push({ tool: block.name, input: block.input });

        // Internal (baked-in) tool?
        const internalFn = internal.get(block.name);
        if (internalFn) {
          try {
            const out = await internalFn(block.input as Record<string, unknown>);
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: JSON.stringify(out),
            });
          } catch (e) {
            results.push({
              type: "tool_result",
              tool_use_id: block.id,
              content: e instanceof Error ? e.message : "tool failed",
              is_error: true,
            });
          }
          continue;
        }

        const target = toolMap.get(block.name);
        if (!target) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: "Unknown tool",
            is_error: true,
          });
          continue;
        }
        try {
          const out = await target.client.callTool({
            name: target.realName,
            arguments: block.input as Record<string, unknown>,
          });
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: out.content as Anthropic.ToolResultBlockParam["content"],
            is_error: Boolean(out.isError),
          });
        } catch (e) {
          results.push({
            type: "tool_result",
            tool_use_id: block.id,
            content: e instanceof Error ? e.message : "tool failed",
            is_error: true,
          });
        }
      }
      messages.push({ role: "user", content: results });
    }
  } catch (e) {
    return c.json({ error: e instanceof Error ? e.message : "chat failed" }, 500);
  } finally {
    await Promise.all(servers.map((s) => s.client.close().catch(() => {})));
  }

  // Persist conversation (append-only).
  await persistChat(user.id, { message: body.message, finalText, toolCalls });

  return c.json({ text: finalText, toolCalls, tools: tools.map((t) => t.name), jurisdiction });
});
