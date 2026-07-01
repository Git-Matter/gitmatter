import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { type Actor, type TokenScope, buildToolCatalog, recordToolCall } from "@workspace/core";

function json(value: unknown) {
  return { content: [{ type: "text" as const, text: JSON.stringify(value, null, 2) }] };
}

/**
 * The MCP server gitmatter exposes to Claude Desktop / CLI / Cowork. Every tool
 * acts as the gitmatter user the token was minted by, attributed as an agent so
 * its mutations land in the same git-style audit log as human actions. The tools
 * come from the shared catalog (server/tools/catalog.ts) — the same definitions
 * the in-app assistant uses, so MCP and chat never drift.
 */
export function buildMcpServer(account: {
  userId: string;
  label: string;
  jurisdiction: string;
  tokenId?: string;
  tenantId?: string | null;
  scope?: TokenScope | null;
}) {
  const actor: Actor = {
    type: "agent",
    userId: account.userId,
    agentLabel: `mcp:${account.label}`,
    ...(account.scope ? { scope: account.scope } : {}),
  };
  const server = new McpServer({ name: "gitmatter", version: "0.1.0" });
  const catalog = buildToolCatalog(actor, {
    jurisdiction: account.jurisdiction,
    defaultMatterLabel: account.label,
  });

  for (const tool of catalog) {
    server.registerTool(
      tool.name,
      { description: tool.description, inputSchema: tool.schema },
      async (input: Record<string, unknown>) => {
        // Meter the call against the token's budget (log-only; never blocks).
        // Matter attribution is best-effort from the tool's own argument.
        void recordToolCall({
          tokenId: account.tokenId,
          userId: account.userId,
          tenantId: account.tenantId,
          matterId: typeof input.matterId === "string" ? input.matterId : null,
          tool: tool.name,
        });
        return json(await tool.handler(input));
      }
    );
  }

  return server;
}
