// de Rechtspraak open data client (Dutch court decisions), baked into the
// backend. Open API — no key required. Exposed as gitmatter's own tools over
// our MCP server and inside in-app chat.
//
// NOTE: the search index (/uitspraken/zoeken) filters by METADATA only —
// decision date, court (creator), and subject area (rechtsgebied) — it has NO
// free-text search. An optional `query` keyword is therefore matched
// client-side against the titles/summaries of the returned entries, as a
// best-effort. Responses are Atom/XML; we parse them with lightweight
// string/regex extraction (no XML dependency).

import { fetchWithTimeout } from "../../core/fetch.js";

const BASE = "https://data.rechtspraak.nl/uitspraken";
const MAX_TEXT_CHARS = 8000;

function decodeXml(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

/** Text content of the first `<tag ...>...</tag>` in the fragment, decoded. */
function tagText(xml: string, tag: string): string | undefined {
  const m = xml.match(new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)</${tag}>`));
  return m ? decodeXml(m[1].trim()) : undefined;
}

/** Drop tags, decode entities, collapse whitespace. */
function stripTags(xml: string): string {
  return decodeXml(xml.replace(/<[^>]+>/g, " "))
    .replace(/[ \t]+/g, " ")
    .replace(/\s*\n\s*/g, "\n")
    .trim();
}

async function rsFetch(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {
    headers: { Accept: "application/xml" },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`Rechtspraak error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.text();
}

export type RechtspraakSearchArgs = {
  /** Keyword matched client-side against titles/summaries (index has no full-text search). */
  query?: string;
  /** Decision date, YYYY-MM-DD (exact day). */
  date?: string;
  /** Court identifier, e.g. "Hoge Raad" or a rechtspraak.nl creator code. */
  creator?: string;
  /** Subject area (rechtsgebied) URI/code. */
  subject?: string;
  limit?: number;
};

/** The metadata filters the index actually supports; `query` is not sent. */
export function buildSearchUrl(args: RechtspraakSearchArgs): string {
  const limit = args.limit ?? 10;
  // When filtering client-side by keyword, over-fetch so there is something to match.
  const max = args.query ? Math.max(limit, 50) : limit;
  const params = new URLSearchParams({ max: String(max) });
  if (args.date) params.set("date", args.date);
  if (args.creator) params.set("creator", args.creator);
  if (args.subject) params.set("subject", args.subject);
  return `${BASE}/zoeken?${params.toString()}`;
}

export type RechtspraakEntry = {
  ecli: string;
  title: string;
  summary: string;
  link: string;
};

/** Parse the Atom feed returned by /uitspraken/zoeken into plain entries. */
export function parseAtomEntries(xml: string): RechtspraakEntry[] {
  const entries = xml.match(/<entry>[\s\S]*?<\/entry>/g) ?? [];
  return entries.map((entry) => {
    const ecli = tagText(entry, "id") ?? "";
    const linkHref = entry.match(/<link[^>]*\shref="([^"]+)"/)?.[1];
    return {
      ecli,
      title: tagText(entry, "title") ?? "",
      summary: (tagText(entry, "summary") ?? "").slice(0, 300),
      link: linkHref
        ? decodeXml(linkHref)
        : `https://uitspraken.rechtspraak.nl/details?id=${encodeURIComponent(ecli)}`,
    };
  });
}

export async function searchDutchCaseLaw(args: RechtspraakSearchArgs) {
  const limit = args.limit ?? 10;
  const xml = await rsFetch(buildSearchUrl(args));
  let results = parseAtomEntries(xml);
  const query = args.query?.trim();
  if (query) {
    const q = query.toLowerCase();
    results = results.filter(
      (r) => r.title.toLowerCase().includes(q) || r.summary.toLowerCase().includes(q)
    );
  }
  return {
    query: query || undefined,
    note: "The rechtspraak.nl index filters by metadata (date, creator, subject) only; keyword matching is applied client-side to titles/summaries.",
    results: results.slice(0, limit),
  };
}

export async function getDutchCaseLaw(args: { ecli: string }) {
  const ecli = args.ecli.trim();
  const xml = await rsFetch(`${BASE}/content?id=${encodeURIComponent(ecli)}`);

  const title = tagText(xml, "dcterms:title");
  const court = tagText(xml, "dcterms:creator");
  const date = tagText(xml, "dcterms:date");
  // Judgment body is <uitspraak>; advisory opinions use <conclusie>.
  const body =
    xml.match(/<uitspraak(?:\s[^>]*)?>([\s\S]*?)<\/uitspraak>/)?.[1] ??
    xml.match(/<conclusie(?:\s[^>]*)?>([\s\S]*?)<\/conclusie>/)?.[1];
  if (!title && !body) {
    throw new Error(`Rechtspraak: no decision found for ${ecli}`);
  }

  const link = `https://uitspraken.rechtspraak.nl/details?id=${encodeURIComponent(ecli)}`;
  const full = body ? stripTags(body) : "";
  const truncated = full.length > MAX_TEXT_CHARS;
  const text = truncated
    ? `${full.slice(0, MAX_TEXT_CHARS)}\n\n[Truncated at ${MAX_TEXT_CHARS} characters — full decision at ${link}]`
    : full;

  return { ecli, title, court, date, link, truncated, text };
}
