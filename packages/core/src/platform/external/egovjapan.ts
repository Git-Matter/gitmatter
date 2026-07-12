// e-Gov 法令検索 Law API v2 client (Japanese statutes). Open API, no key.
// Exposed as gitmatter's own tools — over our MCP server (to Claude/agents) and
// inside in-app chat. Responses are Japanese; text is passed through as-is.

import { fetchWithTimeout } from "../../core/fetch.js";

const BASE = "https://laws.e-gov.go.jp/api/2";

/** Cap on flattened law text returned to the model. */
const MAX_TEXT_CHARS = 8000;

async function egovFetch<T>(path: string): Promise<T> {
  const res = await fetchWithTimeout(`${BASE}${path}`, {
    headers: { Accept: "application/json" },
    timeoutMs: 30_000,
  });
  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(`e-Gov error (${res.status}): ${detail.slice(0, 200)}`);
  }
  return (await res.json()) as T;
}

type LawEntry = {
  law_info?: Record<string, unknown>;
  revision_info?: Record<string, unknown>;
  current_revision_info?: Record<string, unknown>;
};

export async function searchJapanLaws(args: { query: string; limit?: number }) {
  const limit = args.limit ?? 10;
  const params = new URLSearchParams({
    law_title: args.query,
    limit: String(limit),
    response_format: "json",
  });
  const data = await egovFetch<{ total_count?: number; laws?: LawEntry[] }>(
    `/laws?${params.toString()}`
  );
  const results = (data.laws ?? []).slice(0, limit).map((entry) => {
    const info = entry.law_info ?? {};
    const revision = entry.current_revision_info ?? entry.revision_info ?? {};
    return {
      lawId: info.law_id ?? null,
      lawNum: info.law_num ?? null,
      lawTitle: revision.law_title ?? null,
      promulgationDate: info.promulgation_date ?? null,
    };
  });
  return { query: args.query, totalCount: data.total_count ?? results.length, results };
}

// law_full_text is the law XML rendered as JSON: elements are
// { tag, attr?, children? } nodes and text is plain strings. Flatten to text,
// breaking lines after title/sentence-level tags so articles stay readable.
type LawTextNode = string | { tag?: string; children?: LawTextNode[] };

const BLOCK_TAGS = new Set([
  "LawTitle",
  "EnactStatement",
  "PartTitle",
  "ChapterTitle",
  "SectionTitle",
  "SubsectionTitle",
  "DivisionTitle",
  "ArticleCaption",
  "ArticleTitle",
  "ParagraphNum",
  "SupplProvisionLabel",
  "Sentence",
]);

export function flattenLawText(node: LawTextNode | undefined | null): string {
  if (node == null) return "";
  if (typeof node === "string") return node;
  const inner = (node.children ?? []).map(flattenLawText).join("");
  return node.tag && BLOCK_TAGS.has(node.tag) ? `${inner}\n` : inner;
}

export async function getJapanLaw(args: { lawId: string }) {
  const data = await egovFetch<
    LawEntry & {
      law_full_text?: LawTextNode;
    }
  >(`/law_data/${encodeURIComponent(args.lawId)}?response_format=json`);
  const info = data.law_info ?? {};
  const revision = data.current_revision_info ?? data.revision_info ?? {};
  let text = flattenLawText(data.law_full_text)
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = text.length > MAX_TEXT_CHARS;
  if (truncated) {
    text = `${text.slice(0, MAX_TEXT_CHARS)}\n…[truncated at ${MAX_TEXT_CHARS} characters]`;
  }
  return {
    lawId: info.law_id ?? args.lawId,
    lawNum: info.law_num ?? null,
    lawTitle: revision.law_title ?? null,
    promulgationDate: info.promulgation_date ?? null,
    truncated,
    text,
  };
}
