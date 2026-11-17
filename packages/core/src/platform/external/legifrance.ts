// Légifrance (French law) client via the PISTE platform. Server-env OAuth2
// client-credentials only (LEGIFRANCE_CLIENT_ID / LEGIFRANCE_CLIENT_SECRET);
// exposed as gitmatter's own tools over MCP and inside in-app chat.

import { getEnv } from "../../core/config.js";
import { fetchWithTimeout } from "../../core/fetch.js";

const DEFAULT_OAUTH_URL = "https://oauth.piste.gouv.fr/api/oauth/token";
const DEFAULT_API_BASE_URL = "https://api.piste.gouv.fr/dila/legifrance/lf-engine-app";

function oauthUrl(): string {
  return getEnv("LEGIFRANCE_OAUTH_URL")?.trim() || DEFAULT_OAUTH_URL;
}

function apiBaseUrl(): string {
  return getEnv("LEGIFRANCE_API_BASE_URL")?.trim() || DEFAULT_API_BASE_URL;
}

type Creds = { clientId: string; clientSecret: string };

function creds(): Creds | null {
  const clientId = getEnv("LEGIFRANCE_CLIENT_ID")?.trim();
  const clientSecret = getEnv("LEGIFRANCE_CLIENT_SECRET")?.trim();
  return clientId && clientSecret ? { clientId, clientSecret } : null;
}

export function hasLegifranceCreds(): boolean {
  return creds() !== null;
}

// Bearer-token cache keyed by client_id. Refresh ~60s before the token expires so
// an in-flight request never races the expiry boundary.
const tokenCache = new Map<string, { token: string; expiresAt: number }>();

async function getAccessToken({ clientId, clientSecret }: Creds): Promise<string> {
  const url = oauthUrl();
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
      scope: "openid",
    }).toString(),
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Légifrance token error (${res.status}): ${detail.slice(0, 200)}`);
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

async function lfFetch<T>(path: string, body: unknown): Promise<T> {
  const c = creds();
  if (!c) throw new Error("Légifrance credentials not configured");
  const token = await getAccessToken(c);
  const res = await fetchWithTimeout(`${apiBaseUrl()}${path}`, {
    method: "POST",
    headers: {
      Accept: "application/json",
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Légifrance error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

function stripHtml(s: string): string {
  return s
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

const TEXT_CAP = 8000;

function capText(s: string): string {
  if (s.length <= TEXT_CAP) return s;
  return `${s.slice(0, TEXT_CAP)}\n[texte tronqué]`;
}

export type LegifranceFond = "LODA_ETAT" | "CODE_ETAT" | "JURI";

/** Build the Légifrance /search request DTO. Exported for tests. */
export function buildSearchBody(args: {
  query: string;
  fond?: LegifranceFond;
  limit?: number;
}): Record<string, unknown> {
  const pageSize = Math.min(Math.max(args.limit ?? 10, 1), 10);
  return {
    recherche: {
      champs: [
        {
          typeChamp: "ALL",
          criteres: [
            {
              typeRecherche: "TOUS_LES_MOTS_DANS_UN_CHAMP",
              valeur: args.query,
              operateur: "ET",
            },
          ],
          operateur: "ET",
        },
      ],
      pageNumber: 1,
      pageSize,
      operateur: "ET",
      typePagination: "DEFAUT",
      sort: "PERTINENCE",
    },
    fond: args.fond ?? "LODA_ETAT",
  };
}

type SearchResponse = {
  totalResultNumber?: number;
  results?: Array<{
    titles?: Array<{ id?: string; title?: string }>;
    nature?: string;
    date?: string | number;
    text?: string;
    sections?: Array<{
      extracts?: Array<{ id?: string; title?: string; values?: string[] }>;
    }>;
  }>;
};

/** Shape one raw /search result into { id, title, nature, date, snippet }. Exported for tests. */
export function shapeSearchResult(r: NonNullable<SearchResponse["results"]>[number]) {
  const firstTitle = r.titles?.[0];
  const extract = r.sections?.[0]?.extracts?.[0];
  const rawSnippet = extract?.values?.[0] ?? r.text ?? "";
  return {
    id: firstTitle?.id ?? extract?.id ?? null,
    title: firstTitle?.title ?? extract?.title ?? null,
    nature: r.nature ?? null,
    date: r.date ?? null,
    snippet: rawSnippet ? stripHtml(rawSnippet).slice(0, 300) : undefined,
  };
}

export async function searchFrenchLaw(args: {
  query: string;
  fond?: LegifranceFond;
  limit?: number;
}) {
  const data = await lfFetch<SearchResponse>("/search", buildSearchBody(args));
  const results = (data.results ?? []).map(shapeSearchResult);
  return {
    query: args.query,
    fond: args.fond ?? "LODA_ETAT",
    totalResults: data.totalResultNumber ?? results.length,
    results,
  };
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

type ConsultResponse = {
  // /consult/getArticle
  article?: { id?: string; num?: string; texte?: string; etat?: string; context?: unknown };
  // /consult/legiPart
  text?: {
    id?: string;
    title?: string;
    nature?: string;
    articles?: Array<{ id?: string; num?: string; content?: string }>;
    sections?: Array<{
      title?: string;
      articles?: Array<{ id?: string; num?: string; content?: string }>;
    }>;
  };
  title?: string;
};

export async function getFrenchLaw(args: { textId: string }) {
  const textId = args.textId.trim();
  const date = todayIso();

  if (textId.startsWith("LEGIARTI")) {
    const data = await lfFetch<ConsultResponse>("/consult/getArticle", { id: textId, date });
    const a = data.article;
    const body = typeof a?.texte === "string" ? stripHtml(a.texte) : "";
    return {
      id: a?.id ?? textId,
      title: a?.num ? `Article ${a.num}` : null,
      etat: a?.etat ?? null,
      text: capText(body),
    };
  }

  const data = await lfFetch<ConsultResponse>("/consult/legiPart", { textId, date });
  const t = data.text;
  const parts: string[] = [];
  for (const article of t?.articles ?? []) {
    if (typeof article?.content === "string") {
      parts.push(stripHtml(`Article ${article.num ?? ""} — ${article.content}`));
    }
  }
  for (const section of t?.sections ?? []) {
    if (section?.title) parts.push(stripHtml(section.title));
    for (const article of section?.articles ?? []) {
      if (typeof article?.content === "string") {
        parts.push(stripHtml(`Article ${article.num ?? ""} — ${article.content}`));
      }
    }
  }
  return {
    id: t?.id ?? textId,
    title: t?.title ?? data.title ?? null,
    nature: t?.nature ?? null,
    text: capText(parts.join("\n\n")),
  };
}
