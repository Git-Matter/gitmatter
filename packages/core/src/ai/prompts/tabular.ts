import type { CellContent } from "@workspace/db/schema";

function formatSuffix(format?: string, tags?: string[]): string {
  switch (format) {
    case "number":
      return " The summary must be a single number only — no units, currency symbols, or commentary.";
    case "percentage":
      return " The summary must be a single percentage value only (e.g. 42%) — no other text.";
    case "monetary_amount":
      return " The summary must be the monetary value only, including the currency symbol (e.g. $1,234.56) — no other text.";
    case "currency":
      return " The summary must be the currency code only (e.g. USD, EUR) — no other text.";
    case "date":
      return " The summary must be the date only in DD Month YYYY format (e.g. 1 January 2024); for a range, give both dates separated by an em dash. No other text.";
    case "yes_no":
      return " The summary must be exactly Yes or No. Put the supporting explanation in the reasoning field.";
    case "bulleted_list":
      return ' The summary must be a markdown bulleted list only — no prose. Each item on its own line, prefixed with "* " (asterisk + single space).';
    case "tag":
      return tags?.length
        ? ` The summary must be exactly one of these tags, copied verbatim: ${tags.join(", ")}. No other text. If none apply, respond "Not Found".`
        : " The summary must be a single short label or tag (1-3 words) — no other text.";
    case "text":
      return " Respond with plain prose.";
    default:
      return "";
  }
}

/**
 * Light post-extraction cleanup. Coerces a few formats to a canonical shape and
 * flags a clear mismatch (e.g. a currency column that came back with no number)
 * so a reviewer notices. Never throws — extraction quality is the model's job.
 */
export function normalizeCell(content: CellContent, format?: string, tags?: string[]): CellContent {
  const summary = content.summary.trim();
  if (format === "yes_no") {
    const lower = summary.toLowerCase();
    if (lower.startsWith("yes")) return { ...content, summary: "Yes" };
    if (lower.startsWith("no")) return { ...content, summary: "No" };
    if (summary && summary !== "Not Found") return { ...content, flag: "yellow" }; // not a clean yes/no
    return content;
  }
  if (format === "tag" && tags?.length) {
    if (summary === "Not Found") return content;
    const match = tags.find((t) => t.toLowerCase() === summary.toLowerCase());
    if (match) return { ...content, summary: match }; // canonical casing
    if (summary) return { ...content, flag: "yellow" }; // outside the allowed set
    return content;
  }
  if (format === "currency" || format === "monetary_amount" || format === "number") {
    const hasNumber = /\d/.test(summary);
    if (!hasNumber && summary && summary !== "Not Found") return { ...content, flag: "yellow" }; // expected a number, got none
  }
  return content;
}

export const EXTRACTION_SYSTEM = `Your task: pull one requested value out of the document below and report it as a single JSON object, nothing else.

Shape:
{"summary": string, "flag": "green"|"grey"|"yellow"|"red", "reasoning": string, "citations": [{"page": number, "quote": string}]}

- summary — the extracted value itself. Markdown is fine; write any newline as \\n. Keep all explanation out of this field.
- flag — a traffic-light read on what you found: green = clean / in the client's favour, yellow = worth a second look, red = adverse or a real problem, grey = nothing notable, or the value isn't present.
- reasoning — why you settled on that value and that flag.
- citations — the exact snippets backing the value, each a short excerpt (25 words or fewer) with its page when you know it. Use [] if you found nothing.

Output the JSON object on its own — no text before or after it.`;

/**
 * Build the system + user messages for a single tabular cell extraction. The
 * document goes in the SYSTEM block (with the extraction instructions) so it sits
 * in the cacheable prefix — every column of the same document then reuses the
 * cached document instead of re-billing it. Only the per-column instruction
 * varies, in the user message.
 */
export function buildCellPrompt(params: {
  filename: string;
  documentText: string;
  columnPrompt: string;
  format?: string;
  tags?: string[];
}): { system: string; user: string } {
  const instruction = `${params.columnPrompt}${formatSuffix(params.format, params.tags)} If not found, state "Not Found". Put all reasoning in the "reasoning" field only.`;
  return {
    system: `${EXTRACTION_SYSTEM}\n\n--- Document: ${params.filename} ---\n${params.documentText}`,
    user: `Instruction: ${instruction}`,
  };
}

/**
 * System + user messages for extracting EVERY column from one document in a
 * single LLM call. The model returns a JSON object keyed by column index, so one
 * call fills a whole row instead of one request per cell.
 */
export function buildRowPrompt(params: {
  filename: string;
  documentText: string;
  columns: Array<{ index: number; name: string; prompt: string; format?: string; tags?: string[] }>;
}): { system: string; user: string } {
  const colList = params.columns
    .map(
      (c) =>
        `- Column ${c.index} ("${c.name}"): ${c.prompt}${formatSuffix(c.format, c.tags)} If not found, state "Not Found".`
    )
    .join("\n");
  const system = `Your task: work through the listed columns and pull each requested value out of the document, then report them all as one JSON object.

Shape: {"cells": [{"column_index": number, "summary": string, "flag": "green"|"grey"|"yellow"|"red", "reasoning": string, "citations": [{"page": number, "quote": string}]}]}
Give exactly one entry per column listed, tagged with its column_index.

- summary — the extracted value (markdown fine; write any newline as \\n). Keep explanation out of it.
- flag — a traffic-light read: green = clean / in the client's favour, yellow = worth a second look, red = adverse or a real problem, grey = nothing notable, or the value isn't present.
- reasoning — why you settled on that value and flag.
- citations — short snippets (25 words or fewer) backing that cell, with a page when known; use [] if nothing was found.

Output the JSON object only — no text around it.`;
  return {
    system,
    user: `Document: ${params.filename}\n\n${params.documentText}\n\n---\nColumns to extract:\n${colList}`,
  };
}
