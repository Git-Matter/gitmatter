// CourtListener API client, baked into the backend (no longer a sidecar).
// Exposed as gitcounsel's own tools — over our MCP server (to Claude/agents) and
// inside in-app chat. API-only; needs COURTLISTENER_API_TOKEN.

import { fetchWithTimeout } from "../core/fetch.js";
import { getEnv } from "../core/config.js";

const BASE = "https://www.courtlistener.com/api/rest/v4";

function headers(): Record<string, string> {
  const token = getEnv("COURTLISTENER_API_TOKEN")?.trim();
  if (!token) throw new Error("COURTLISTENER_API_TOKEN must be set");
  return {
    Accept: "application/json",
    "Content-Type": "application/json",
    Authorization: `Token ${token}`,
  };
}

async function clFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(path.startsWith("http") ? path : `${BASE}${path}`, {
    ...init,
    headers: headers(),
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`CourtListener error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function searchCaseLaw(args: {
  query: string;
  court?: string;
  filedAfter?: string;
  filedBefore?: string;
  limit?: number;
}) {
  const params = new URLSearchParams({ type: "o", q: args.query });
  if (args.court) params.set("court", args.court);
  if (args.filedAfter) params.set("filed_after", args.filedAfter);
  if (args.filedBefore) params.set("filed_before", args.filedBefore);
  const data = await clFetch<{ results?: Array<Record<string, unknown>> }>(
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

export async function verifyCitations(citations: string[]) {
  // v4 citation-lookup parses ALL citations in one text block. Send a single
  // request (CourtListener throttles authenticated users to ~5/min).
  const text = citations.join("\n");
  return clFetch<unknown>(`/citation-lookup/`, { method: "POST", body: JSON.stringify({ text }) });
}
