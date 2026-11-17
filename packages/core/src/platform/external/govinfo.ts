// govinfo API client (US GPO — federal statutes, public laws, CFR, Federal
// Register). Exposed as gitmatter's own tools — over our MCP server (to
// Claude/agents) and inside in-app chat. API-only; bring-your-own key (each
// user supplies their own api.data.gov key in Settings → Legal research), with
// an optional shared server-env fallback (GOVINFO_API_KEY) for self-hosted
// instances.

import { fetchWithTimeout } from "../../core/fetch.js";
import { getEnv } from "../../core/config.js";
import { getUserApiKey } from "../../core/keys.js";

const BASE = "https://api.govinfo.gov";

/** User's own govinfo key, else the shared server-env key, else null. */
export async function resolveGovinfoKey(userId: string): Promise<string | null> {
  const userKey = await getUserApiKey(userId, "govinfo");
  if (userKey) return userKey;
  return getEnv("GOVINFO_API_KEY")?.trim() || null;
}

async function giFetch<T>(key: string, path: string, init?: RequestInit): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-Api-Key": key,
    },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`govinfo error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

export async function searchUsFederalLaw(
  key: string,
  args: { query: string; collection?: string; limit?: number }
) {
  // govinfo's search query language filters by collection inline, e.g.
  // `chevron deference collection:(USCODE)`.
  const query = args.collection ? `${args.query} collection:(${args.collection})` : args.query;
  const pageSize = Math.min(args.limit ?? 10, 20);
  const data = await giFetch<{ count?: number; results?: Array<Record<string, unknown>> }>(
    key,
    "/search",
    {
      method: "POST",
      body: JSON.stringify({
        query,
        pageSize,
        offsetMark: "*",
        sorts: [{ field: "relevancy", sortOrder: "DESC" }],
      }),
    }
  );
  const results = (data.results ?? []).map((r) => ({
    packageId: r.packageId,
    granuleId: r.granuleId,
    title: r.title,
    collection: r.collectionCode,
    dateIssued: r.dateIssued,
    resultLink: r.resultLink,
  }));
  return { query: args.query, count: data.count, results };
}

export async function getUsFederalPackage(key: string, args: { packageId: string }) {
  const s = await giFetch<Record<string, unknown>>(
    key,
    `/packages/${encodeURIComponent(args.packageId)}/summary`
  );
  // The summary carries dozens of fields; keep the useful scalars + downloads.
  return {
    packageId: s.packageId,
    title: s.title,
    collectionCode: s.collectionCode,
    collectionName: s.collectionName,
    category: s.category,
    docClass: s.docClass,
    congress: s.congress,
    session: s.session,
    branch: s.branch,
    governmentAuthor1: s.governmentAuthor1,
    publisher: s.publisher,
    dateIssued: s.dateIssued,
    lastModified: s.lastModified,
    detailsLink: s.detailsLink,
    download: s.download,
  };
}
