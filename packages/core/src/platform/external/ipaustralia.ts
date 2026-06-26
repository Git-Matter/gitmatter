import { getEnv } from "../../core/config.js";
import { fetchWithTimeout } from "../../core/fetch.js";

const DEFAULT_API_BASE_URL = "https://test.api.ipaustralia.gov.au/public/";
const DEFAULT_PATENT_PATH = "australian-patent-search-api/v1/";
const DEFAULT_TRADE_MARK_PATH = "australian-trade-mark-search-api/v1/";
const TOKEN_PATH = "external-token-api/v1/access_token";

function apiBaseUrl(): string {
  return getEnv("IPA_API_BASE_URL")?.trim() || DEFAULT_API_BASE_URL;
}

function tokenUrl(): string {
  return `${apiBaseUrl()}${TOKEN_PATH}`;
}

function patentBase(): string {
  return `${apiBaseUrl()}${getEnv("IPA_PATENT_SEARCH_API_BASE_URL")?.trim() || DEFAULT_PATENT_PATH}`;
}

function trademarkBase(): string {
  return `${apiBaseUrl()}${getEnv("IPA_TRADE_MARK_SEARCH_API_BASE_URL")?.trim() || DEFAULT_TRADE_MARK_PATH}`;
}

type Creds = { clientId: string; clientSecret: string };

function patentCreds(): Creds | null {
  const clientId = getEnv("IPA_PATENT_SEARCH_API_CLIENT_ID")?.trim();
  const clientSecret = getEnv("IPA_PATENT_SEARCH_API_CLIENT_SECRET")?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

function trademarkCreds(): Creds | null {
  const clientId = getEnv("IPA_TRADE_MARK_SEARCH_API_CLIENT_ID")?.trim();
  const clientSecret = getEnv("IPA_TRADE_MARK_SEARCH_API_CLIENT_SECRET")?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function hasPatentCreds(): boolean {
  return patentCreds() !== null;
}

export function hasTrademarkCreds(): boolean {
  return trademarkCreds() !== null;
}

// Bearer-token cache keyed by client_id. Refresh ~60s before the token expires so
// an in-flight request never races the expiry boundary.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken({ clientId, clientSecret }: Creds): Promise<string> {
  const url = tokenUrl();
  const cacheKey = `${url}:${clientId}`;
  const cached = tokenCache.get(cacheKey);
  if (cached && cached.expiresAt > Date.now()) return cached.token;

  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }).toString(),
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`IP Australia token error (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as {
    access_token: string;
    expires_in?: number;
  };
  const ttlMs = (data.expires_in ?? 3600) * 1000;
  tokenCache.set(cacheKey, {
    token: data.access_token,
    expiresAt: Date.now() + ttlMs - 60_000,
  });
  return data.access_token;
}

async function iaFetch<T>(
  base: string,
  creds: Creds,
  path: string,
  init?: RequestInit
): Promise<T> {
  const token = await getAccessToken(creds);
  const res = await fetchWithTimeout(`${base}${path}`, {
    ...init,
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`IP Australia error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

// ---- Patents ----

export async function searchPatents(args: {
  query: string;
  searchType?: "ID" | "DETAILS";
  pageSize?: number;
  pageNumber?: number;
  searchMode?:
    | "ADVANCED_FULL_TEXT"
    | "ADVANCED_NO_FULL_TEXT"
    | "QUICK_ABSTRACT"
    | "QUICK_NO_ABSTRACT";
  sort?: { field?: string; direction?: "ASC" | "DESC" };
}) {
  const creds = patentCreds();
  if (!creds) throw new Error("Patent credentials not configured");
  const searchType = args.searchType ?? "DETAILS";
  const body: Record<string, unknown> = { query: args.query, searchType };
  if (args.searchMode) body.searchMode = args.searchMode;
  if (args.sort) body.sort = args.sort;
  if (searchType === "DETAILS") {
    body.pageSize = Math.min(args.pageSize ?? 10, 50);
    body.pageNumber = args.pageNumber ?? 0;
  }
  const data = await iaFetch<{ totalHits?: number; results?: unknown }>(
    patentBase(),
    creds,
    "search/quick",
    { method: "POST", body: JSON.stringify(body) }
  );
  return {
    query: args.query,
    searchType,
    totalHits: data.totalHits ?? 0,
    results: data.results ?? [],
  };
}

export async function getPatent(id: string) {
  const creds = patentCreds();
  if (!creds) throw new Error("Patent credentials not configured");
  const p = await iaFetch<Record<string, unknown>>(
    patentBase(),
    creds,
    `patent/${encodeURIComponent(id)}`
  );
  const biblio = (p.bibliographicData ?? {}) as Record<string, unknown>;
  return {
    applicationNumber: biblio.applicationNumber ?? null,
    inventionTitle: biblio.inventionTitle ?? null,
    bibliographicData: p.bibliographicData ?? null,
    applicants: p.applicant ?? null,
    inventors: p.inventors ?? null,
    owners: p.owners ?? null,
    representatives: p.representatives ?? null,
    filedDate: p.filedDate ?? null,
    priorityDate: p.priorityDate ?? null,
    expiryDate: p.expiryDate ?? null,
    inforceToDate: p.inforceToDate ?? null,
    ipRightStatusCode: p.ipRightStatusCode ?? null,
    ipRightStatusEvent: p.ipRightStatusEvent ?? null,
    pctDetails: p.pctDetails ?? null,
    publications: p.publications ?? null,
    publishedDocuments: p.publishedDocuments ?? null,
    relatedPatents: p.relatedPatents ?? null,
  };
}

// ---- Trade marks ----

export async function searchTrademarks(args: {
  query: string;
  quickSearchType?: Array<"WORD" | "NAME" | "NUMBER" | "IR_NUMBER">;
  status?: string[];
  changedSinceDate?: string;
  sort?: { field?: string; direction?: "ASCENDING" | "DESCENDING" };
}) {
  const creds = trademarkCreds();
  if (!creds) throw new Error("Trade mark credentials not configured");
  const body: Record<string, unknown> = { query: args.query };
  const filters: Record<string, unknown> = {};
  if (args.quickSearchType?.length) filters.quickSearchType = args.quickSearchType;
  if (args.status?.length) filters.status = args.status;
  if (Object.keys(filters).length) body.filters = filters;
  if (args.changedSinceDate) body.changedSinceDate = args.changedSinceDate;
  if (args.sort) body.sort = args.sort;
  const data = await iaFetch<{ count?: number; trademarkIds?: string[] }>(
    trademarkBase(),
    creds,
    "search/quick",
    { method: "POST", body: JSON.stringify(body) }
  );
  return {
    query: args.query,
    count: data.count ?? 0,
    trademarkIds: data.trademarkIds ?? [],
  };
}

export async function searchTrademarksAdvanced(args: {
  rows: unknown[];
  changedSinceDate?: string;
  sort?: { field?: string; direction?: "ASCENDING" | "DESCENDING" };
}) {
  const creds = trademarkCreds();
  if (!creds) throw new Error("Trade mark credentials not configured");
  const body: Record<string, unknown> = { rows: args.rows };
  if (args.changedSinceDate) body.changedSinceDate = args.changedSinceDate;
  if (args.sort) body.sort = args.sort;
  const data = await iaFetch<{
    count?: number;
    trademarkIds?: string[];
    request?: unknown;
  }>(trademarkBase(), creds, "search/advanced", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    count: data.count ?? 0,
    trademarkIds: data.trademarkIds ?? [],
    request: data.request,
  };
}

export async function pageTrademarksAdvanced(args: {
  rows: unknown[];
  pageNumber?: number;
  pageSize?: number;
  changedSinceDate?: string;
  sort?: { field?: string; direction?: "ASCENDING" | "DESCENDING" };
}) {
  const creds = trademarkCreds();
  if (!creds) throw new Error("Trade mark credentials not configured");
  const body: Record<string, unknown> = {
    rows: args.rows,
    pageNumber: args.pageNumber ?? 0,
    pageSize: Math.min(args.pageSize ?? 10, 100),
  };
  if (args.changedSinceDate) body.changedSinceDate = args.changedSinceDate;
  if (args.sort) body.sort = args.sort;
  const data = await iaFetch<{
    count?: number;
    trademarks?: unknown[];
    request?: unknown;
  }>(trademarkBase(), creds, "page/advanced", {
    method: "POST",
    body: JSON.stringify(body),
  });
  return {
    count: data.count ?? 0,
    trademarks: data.trademarks ?? [],
    request: data.request,
  };
}

export async function getTrademark(id: string) {
  const creds = trademarkCreds();
  if (!creds) throw new Error("Trade mark credentials not configured");
  const t = await iaFetch<Record<string, unknown>>(
    trademarkBase(),
    creds,
    `trade-mark/${encodeURIComponent(id)}`
  );
  return {
    number: t.number ?? null,
    words: t.words ?? null,
    kind: t.kind ?? null,
    statusCode: t.statusCode ?? null,
    statusDetail: t.statusDetail ?? null,
    statusGroup: t.statusGroup ?? null,
    owner: t.owner ?? null,
    goodsAndServices: t.goodsAndServices ?? null,
    filingDate: t.filingDate ?? null,
    priorityDate: t.priorityDate ?? null,
    renewalDueDate: t.renewalDueDate ?? null,
  };
}
