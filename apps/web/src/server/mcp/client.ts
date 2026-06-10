import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { decrypt, listEnabledConnections, type McpConnection } from "@workspace/core";
import { providersFor } from "@workspace/registry";

export type ExternalTool = {
  serverSlug: string;
  name: string; // namespaced: "<slug>__<tool>"
  realName: string;
  description: string;
  inputSchema: Record<string, unknown>;
};

export type ConnectedServer = { slug: string; client: Client; tools: ExternalTool[] };

function authHeaders(conn: McpConnection): Record<string, string> | undefined {
  if (conn.authType === "none" || !conn.authEncrypted) return undefined;
  const secret = decrypt(JSON.parse(conn.authEncrypted));
  if (conn.authType === "bearer") return { Authorization: `Bearer ${secret}` };
  if (conn.authType === "header" && conn.authHeaderName) return { [conn.authHeaderName]: secret };
  return undefined;
}

async function connect(
  url: string,
  slug: string,
  headers?: Record<string, string>
): Promise<ConnectedServer> {
  const transport = new StreamableHTTPClientTransport(
    new URL(url),
    headers ? { requestInit: { headers } } : undefined
  );
  const client = new Client({ name: "gitcounsel", version: "0.1.0" });
  await client.connect(transport);
  const { tools } = await client.listTools();
  return {
    slug,
    client,
    tools: tools.map((t) => ({
      serverSlug: slug,
      name: `${slug}__${t.name}`,
      realName: t.name,
      description: t.description ?? "",
      inputSchema: (t.inputSchema as Record<string, unknown>) ?? { type: "object", properties: {} },
    })),
  };
}

/**
 * Connect to enabled MCP connections available to a user AND permitted for the
 * given jurisdiction (per the shared registry). CourtListener, for example, only
 * connects for US jurisdictions.
 */
export async function connectEnabledServers(
  userId: string,
  jurisdiction: string
): Promise<ConnectedServer[]> {
  const allowedProviderIds = new Set(providersFor(jurisdiction).map((p) => p.id));
  const rows = await listEnabledConnections(userId);
  const visible = rows.filter(
    // No providerId = unmanaged custom connection: always allowed.
    (r) => !r.providerId || allowedProviderIds.has(r.providerId)
  );
  const servers: ConnectedServer[] = [];
  for (const conn of visible) {
    const slug = (conn.providerId ?? conn.name).toLowerCase().replace(/[^a-z0-9]+/g, "_");
    try {
      servers.push(await connect(conn.url, slug, authHeaders(conn)));
    } catch {
      // Skip unreachable servers rather than failing the whole chat.
    }
  }
  return servers;
}
