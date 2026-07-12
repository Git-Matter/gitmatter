// legislation.gov.uk API client — UK statutes and statutory instruments. Open
// data, no API key. Search uses the Atom feed; document fetches use the CLML
// XML rendering, stripped down to plain text for the model. Both endpoints are
// parsed with lightweight string/regex handling (no XML dependency).

import { fetchWithTimeout } from "../../core/fetch.js";

const BASE = "https://www.legislation.gov.uk";

/** Cap on plain-text output returned to the model. */
const MAX_TEXT_CHARS = 8_000;

async function ukFetch(url: string): Promise<string> {
  const res = await fetchWithTimeout(url, {
    headers: { Accept: "application/xml" },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`legislation.gov.uk error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return res.text();
}

function decodeEntities(s: string): string {
  return s
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");
}

export type UkLegislationEntry = {
  title: string;
  href?: string;
  id?: string;
  type?: string;
  year?: string;
  number?: string;
};

/** Parse entries out of a legislation.gov.uk Atom search feed. */
export function parseAtomEntries(xml: string): UkLegislationEntry[] {
  const entries: UkLegislationEntry[] = [];
  for (const [, block] of xml.matchAll(/<entry[\s>]([\s\S]*?)<\/entry>/g)) {
    const title = decodeEntities(block.match(/<title[^>]*>([\s\S]*?)<\/title>/)?.[1]?.trim() ?? "");
    const id = block.match(/<id>([\s\S]*?)<\/id>/)?.[1]?.trim();
    // Prefer the plain alternate link; fall back to the first href in the entry.
    const href =
      block.match(/<link[^>]*rel="alternate"[^>]*href="([^"]+)"/)?.[1] ??
      block.match(/<link[^>]*href="([^"]+)"/)?.[1];
    // Entry ids look like http://www.legislation.gov.uk/id/{type}/{year}/{number}.
    const path = id?.match(/\/id\/([a-z]+)\/(\d{4})\/(\d+)/);
    entries.push({
      title,
      href: href ? decodeEntities(href) : undefined,
      id,
      type: path?.[1],
      year: path?.[2],
      number: path?.[3],
    });
  }
  return entries;
}

/** Strip CLML/XML markup down to whitespace-normalized plain text. */
export function xmlToText(xml: string): string {
  return decodeEntities(
    xml
      .replace(/<\?[\s\S]*?\?>/g, " ")
      .replace(/<!--[\s\S]*?-->/g, " ")
      .replace(/<[^>]+>/g, " ")
  )
    .replace(/\s+/g, " ")
    .trim();
}

/** URL for one piece of legislation (optionally a single section), CLML XML. */
export function buildDocumentUrl(args: {
  type: string;
  year: string;
  number: string;
  section?: string;
}): string {
  const parts = [args.type, args.year, args.number].map(encodeURIComponent);
  if (args.section) parts.push("section", encodeURIComponent(args.section));
  return `${BASE}/${parts.join("/")}/data.xml`;
}

export async function searchUkLegislation(args: { query: string; limit?: number }) {
  const xml = await ukFetch(`${BASE}/all/data.feed?text=${encodeURIComponent(args.query)}`);
  const results = parseAtomEntries(xml).slice(0, args.limit ?? 10);
  return { query: args.query, results };
}

export async function getUkLegislation(args: {
  type: string;
  year: string;
  number: string;
  section?: string;
}) {
  const url = buildDocumentUrl(args);
  const text = xmlToText(await ukFetch(url));
  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    type: args.type,
    year: args.year,
    number: args.number,
    section: args.section,
    url,
    text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
    truncated,
    ...(truncated ? { note: `Text truncated to ${MAX_TEXT_CHARS} characters.` } : {}),
  };
}
