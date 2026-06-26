// CourtListener API client, baked into the backend (no longer a sidecar).
// Exposed as gitmatter's own tools — over our MCP server (to Claude/agents) and
// inside in-app chat. API-only; bring-your-own key (each user supplies their own
// CourtListener token in Settings → Legal research), with an optional shared
// server-env fallback (COURTLISTENER_API_TOKEN) for self-hosted instances.

import { fetchWithTimeout } from "../../core/fetch.js";
import { getEnv } from "../../core/config.js";
import { getUserApiKey } from "../../core/keys.js";

const BASE = "https://www.courtlistener.com/api/rest/v4";

/** User's own CourtListener key, else the shared server-env token, else null. */
export async function resolveCourtListenerKey(userId: string): Promise<string | null> {
  const userKey = await getUserApiKey(userId, "courtlistener");
  if (userKey) return userKey;
  return getEnv("COURTLISTENER_API_TOKEN")?.trim() || null;
}

function headers(token: string): Record<string, string> {
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Token ${token}`,
  };
}

async function clFetch<T>(token: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(path.startsWith("http") ? path : `${BASE}${path}`, {
    ...init,
    headers: headers(token),
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`CourtListener error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function searchCaseLaw(
  token: string,
  args: {
    query: string;
    court?: string;
    filedAfter?: string;
    filedBefore?: string;
    limit?: number;
  }
) {
  const params = new URLSearchParams({ type: "o", q: args.query });
  if (args.court) params.set("court", args.court);
  if (args.filedAfter) params.set("filed_after", args.filedAfter);
  if (args.filedBefore) params.set("filed_before", args.filedBefore);
  const data = await clFetch<{ results?: Array<Record<string, unknown>> }>(
    token,
    `/search/?${params.toString()}`
  );
  const results = (data.results ?? []).slice(0, args.limit ?? 10).map((r) => ({
    caseName: r.caseName,
    court: r.court,
    dateFiled: r.dateFiled,
    citation: r.citation,
    clusterId: r.cluster_id,
    snippet: typeof r.snippet === "string" ? r.snippet.slice(0, 300) : undefined,
    absoluteUrl:
      typeof r.absolute_url === "string"
        ? `https://www.courtlistener.com${r.absolute_url}`
        : undefined,
  }));
  return { query: args.query, results };
}

export async function verifyCitations(token: string, citations: string[]) {
  // v4 citation-lookup parses ALL citations in one text block. Send a single
  // request (CourtListener throttles authenticated users to ~5/min).
  const text = citations.join("\n");
  return clFetch<unknown>(token, `/citation-lookup/`, {
    method: "POST",
    body: JSON.stringify({ text }),
  });
}
