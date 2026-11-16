// EUR-Lex / EU Publications Office client, baked into the backend. EU law is
// open data: search goes through the public Cellar SPARQL endpoint, document
// text comes from the EUR-Lex HTML view. No API key required.

import { fetchWithTimeout } from "../../core/fetch.js";

const SPARQL_ENDPOINT = "https://publications.europa.eu/webapi/rdf/sparql";
const EURLEX_TXT = "https://eur-lex.europa.eu/legal-content/EN/TXT/";

const DEFAULT_LIMIT = 10;
const MAX_LIMIT = 25;
const MAX_TEXT_CHARS = 8000;

// Loose CELEX shape: sector digit, then year/type/number chars (e.g. 32016R0679).
const CELEX_RE = /^[0-9][0-9A-Za-z().]{4,24}$/;

/** Escape a user string for embedding in a SPARQL double-quoted literal. */
export function escapeSparqlLiteral(value: string): string {
  return value
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/[\r\n]+/g, " ");
}

/** SPARQL over the cdm ontology: works whose English title contains the query. */
export function buildSearchSparql(query: string, limit: number): string {
  const q = escapeSparqlLiteral(query.toLowerCase());
  return `PREFIX cdm: <http://publications.europa.eu/ontology/cdm#>
SELECT DISTINCT ?celex ?title ?date ?type WHERE {
  ?work cdm:resource_legal_id_celex ?celex .
  ?expr cdm:expression_belongs_to_work ?work .
  ?expr cdm:expression_uses_language <http://publications.europa.eu/resource/authority/language/ENG> .
  ?expr cdm:expression_title ?title .
  OPTIONAL { ?work cdm:work_date_document ?date . }
  OPTIONAL { ?work cdm:work_has_resource-type ?type . }
  FILTER(CONTAINS(LCASE(STR(?title)), "${q}"))
}
LIMIT ${limit}`;
}

type SparqlBinding = Record<string, { value?: string } | undefined>;

/** Shape Cellar SPARQL results-JSON bindings into trimmed result rows. */
export function shapeSearchResults(bindings: SparqlBinding[]): Array<{
  celex?: string;
  title?: string;
  date?: string;
  type?: string;
}> {
  return bindings.map((b) => ({
    celex: b.celex?.value,
    title: typeof b.title?.value === "string" ? b.title.value.slice(0, 300) : undefined,
    date: b.date?.value,
    // Resource type comes back as an authority URI; keep just the last segment.
    type: typeof b.type?.value === "string" ? b.type.value.split("/").pop() : undefined,
  }));
}

/** Strip an HTML document to plain text (drop script/style, tags, entities). */
export function stripHtmlToText(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

export async function searchEuLaw(args: { query: string; limit?: number }) {
  const limit = Math.min(Math.max(1, args.limit ?? DEFAULT_LIMIT), MAX_LIMIT);
  const params = new URLSearchParams({
    query: buildSearchSparql(args.query, limit),
    format: "application/sparql-results+json",
  });
  const res = await fetchWithTimeout(`${SPARQL_ENDPOINT}?${params.toString()}`, {
    headers: { Accept: "application/sparql-results+json" },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`EUR-Lex SPARQL error (${res.status}): ${detail.slice(0, 200)}`);
  }
  const data = (await res.json()) as { results?: { bindings?: SparqlBinding[] } };
  return { query: args.query, results: shapeSearchResults(data.results?.bindings ?? []) };
}

export async function getEuLaw(args: { celex: string }) {
  const celex = args.celex.trim();
  if (!CELEX_RE.test(celex)) {
    throw new Error(`Invalid CELEX number: "${celex}" (expected e.g. 32016R0679)`);
  }
  const url = `${EURLEX_TXT}?uri=CELEX:${encodeURIComponent(celex)}`;
  const res = await fetchWithTimeout(url, {
    headers: { Accept: "text/html" },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`EUR-Lex error (${res.status}): ${detail.slice(0, 200)}`);
  }
  const html = await res.text();
  const text = stripHtmlToText(html);
  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    celex,
    url,
    text: truncated
      ? `${text.slice(0, MAX_TEXT_CHARS)}\n[Truncated at ${MAX_TEXT_CHARS} characters. Full text: ${url}]`
      : text,
    truncated,
  };
}
