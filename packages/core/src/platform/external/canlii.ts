// CanLII API v1 client (Canadian case law). The API exposes metadata only —
// database browse and citator, no full-text search. API-only; bring-your-own key
// (each user supplies their own CanLII key in Settings → Legal research), with an
// optional shared server-env fallback (CANLII_API_KEY) for self-hosted instances.

import { fetchWithTimeout } from "../../core/fetch.js";
import { getEnv } from "../../core/config.js";
import { getUserApiKey } from "../../core/keys.js";

const BASE = "https://api.canlii.org/v1";

/** User's own CanLII key, else the shared server-env key, else null. */
export async function resolveCanliiKey(userId: string): Promise<string | null> {
  const userKey = await getUserApiKey(userId, "canlii");
  if (userKey) return userKey;
  return getEnv("CANLII_API_KEY")?.trim() || null;
}

/** Strip the API key from any text destined for an error message. */
function redact(key: string, text: string): string {
  return text.split(key).join("***");
}

async function canliiFetch<T>(
  key: string,
  path: string,
  params?: Record<string, string>
): Promise<T> {
  const url = new URL(`${BASE}${path}`);
  for (const [k, v] of Object.entries(params ?? {})) url.searchParams.set(k, v);
  url.searchParams.set("api_key", key);
  let res: Response;
  try {
    res = await fetchWithTimeout(url.toString(), {
      headers: { Accept: "application/json" },
      timeoutMs: 30_000,
    });
  } catch (err) {
    // Never let the key leak through error/URL text.
    throw new Error(redact(key, err instanceof Error ? err.message : String(err)));
  }
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`CanLII error (${res.status}): ${redact(key, detail).slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

/** Case ids come back as `{ en: "..." }` / `{ fr: "..." }` in browse listings. */
function caseIdOf(v: unknown): unknown {
  if (v && typeof v === "object") {
    const o = v as Record<string, unknown>;
    return o.en ?? o.fr ?? v;
  }
  return v;
}

export async function searchCanadianCaseLaw(
  key: string,
  args: {
    databaseId?: string;
    publishedAfter?: string;
    publishedBefore?: string;
    decisionDateAfter?: string;
    decisionDateBefore?: string;
    limit?: number;
  }
) {
  // Without a databaseId there is nothing to browse — return the database list
  // so the model can pick a court and call again.
  if (!args.databaseId) {
    const data = await canliiFetch<{ caseDatabases?: Array<Record<string, unknown>> }>(
      key,
      `/caseBrowse/en/`
    );
    return {
      note: "No databaseId given. Pick a court database below and call again with its databaseId.",
      databases: (data.caseDatabases ?? []).map((d) => ({
        databaseId: d.databaseId,
        jurisdiction: d.jurisdiction,
        name: d.name,
      })),
    };
  }
  const limit = Math.min(args.limit ?? 10, 20);
  const params: Record<string, string> = { offset: "0", resultCount: String(limit) };
  if (args.publishedAfter) params.publishedAfter = args.publishedAfter;
  if (args.publishedBefore) params.publishedBefore = args.publishedBefore;
  if (args.decisionDateAfter) params.decisionDateAfter = args.decisionDateAfter;
  if (args.decisionDateBefore) params.decisionDateBefore = args.decisionDateBefore;
  const data = await canliiFetch<{ cases?: Array<Record<string, unknown>> }>(
    key,
    `/caseBrowse/en/${encodeURIComponent(args.databaseId)}/`,
    params
  );
  const results = (data.cases ?? []).map((c) => ({
    databaseId: c.databaseId,
    caseId: caseIdOf(c.caseId),
    title: c.title,
    citation: c.citation,
  }));
  return { databaseId: args.databaseId, results };
}

export async function getCanadianCase(key: string, args: { databaseId: string; caseId: string }) {
  const dbSeg = encodeURIComponent(args.databaseId);
  const caseSeg = encodeURIComponent(args.caseId);
  const meta = await canliiFetch<Record<string, unknown>>(
    key,
    `/caseBrowse/en/${dbSeg}/${caseSeg}/`
  );
  // The citator is a separate CanLII permission tier — don't let it sink the
  // metadata we already have.
  let citedCases: unknown;
  try {
    const cited = await canliiFetch<{ citedCases?: unknown }>(
      key,
      `/caseCitator/en/${dbSeg}/${caseSeg}/citedCases`
    );
    citedCases = cited.citedCases;
  } catch {
    citedCases = undefined;
  }
  return {
    databaseId: args.databaseId,
    caseId: args.caseId,
    title: meta.title,
    citation: meta.citation,
    docketNumber: meta.docketNumber,
    decisionDate: meta.decisionDate,
    keywords: meta.keywords,
    url: meta.url,
    citedCases,
  };
}
