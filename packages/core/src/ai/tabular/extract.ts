import type { CellCitation, CellContent, TabularColumn } from "@workspace/db/schema";
import { DEFAULT_MODEL, completeText } from "../provider/index.js";
import { buildCellPrompt, buildRowPrompt, normalizeCell } from "../prompts/tabular.js";

// Pure extraction: turn a document + column prompt into a structured cell value
// via the LLM. No database access — callers pass the resolved apiKey. The
// persistence/commit side lives in runner.ts.

const FLAGS = ["green", "grey", "yellow", "red"] as const;

const CITATIONS_SCHEMA = {
  type: "array",
  items: {
    type: "object",
    properties: { page: { type: "number" }, quote: { type: "string" } },
    required: ["quote"],
    additionalProperties: false,
  },
} as const;

// Structured-output schema for one extracted cell — lets the provider return clean
// JSON instead of us scraping it out of free text.
const CELL_SCHEMA = {
  type: "object",
  properties: {
    summary: { type: "string" },
    flag: { type: "string", enum: FLAGS },
    reasoning: { type: "string" },
    citations: CITATIONS_SCHEMA,
  },
  required: ["summary", "flag", "reasoning"],
  additionalProperties: false,
} as const;

// Batch schema: every column for one document in a single call.
const ROW_SCHEMA = {
  type: "object",
  properties: {
    cells: {
      type: "array",
      items: {
        type: "object",
        properties: {
          column_index: { type: "number" },
          summary: { type: "string" },
          flag: { type: "string", enum: FLAGS },
          reasoning: { type: "string" },
          citations: CITATIONS_SCHEMA,
        },
        required: ["column_index", "summary", "flag", "reasoning"],
        additionalProperties: false,
      },
    },
  },
  required: ["cells"],
  additionalProperties: false,
} as const;

export type CellResult = { content: CellContent; citations: CellCitation[] };

export function coerceFlag(flag: unknown): CellContent["flag"] {
  return FLAGS.includes(flag as never) ? (flag as CellContent["flag"]) : "grey";
}

export function coerceCitations(raw: unknown): CellCitation[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((c): c is { page?: unknown; quote?: unknown } => !!c && typeof c === "object")
    .map((c) => ({
      quote: (typeof c.quote === "string" ? c.quote : "").trim(),
      ...(typeof c.page === "number" ? { page: c.page } : {}),
    }))
    .filter((c) => c.quote);
}

export function stripJsonFence(raw: string): string {
  return raw
    .replace(/^```(?:json)?\n?/i, "")
    .replace(/\n?```$/, "")
    .trim();
}

/** Extract a single cell value from a document. */
export async function queryCell(params: {
  model?: string;
  filename: string;
  documentText: string;
  columnPrompt: string;
  format?: string;
  tags?: string[];
  apiKey?: string | null;
  // Cache the document (it's in the system prefix) so the next column over the
  // same document reuses it instead of re-billing the full text. `cacheKey`
  // routes OpenAI to the same prompt cache for that document.
  cache?: boolean;
  cacheKey?: string;
  onUsage?: Parameters<typeof completeText>[0]["onUsage"];
}): Promise<CellResult> {
  const { system, user } = buildCellPrompt(params);
  const raw = await completeText({
    model: params.model ?? DEFAULT_MODEL,
    systemPrompt: system,
    user,
    maxTokens: 2048,
    apiKey: params.apiKey,
    // Deterministic, schema-constrained extraction so cell values are reproducible.
    temperature: 0,
    jsonSchema: CELL_SCHEMA as unknown as Record<string, unknown>,
    cache: params.cache,
    cacheKey: params.cacheKey,
    onUsage: params.onUsage,
  });
  try {
    const parsed = JSON.parse(stripJsonFence(raw)) as {
      summary?: string;
      value?: string;
      flag?: unknown;
      reasoning?: string;
      citations?: unknown;
    };
    return {
      content: normalizeCell(
        {
          summary: String(parsed.summary ?? parsed.value ?? "").trim() || "Not addressed",
          flag: coerceFlag(parsed.flag),
          reasoning: String(parsed.reasoning ?? ""),
        },
        params.format,
        params.tags
      ),
      citations: coerceCitations(parsed.citations),
    };
  } catch {
    return {
      content: {
        summary: raw.trim().slice(0, 500) || "Not addressed",
        flag: "grey",
        reasoning: "",
      },
      citations: [],
    };
  }
}

/**
 * Extract every column for one document in a single LLM call, keyed by column
 * index. One request per row instead of one per cell — the batch path used by
 * runDocument. Missing columns simply don't appear in the returned map.
 */
export async function queryRow(params: {
  model?: string;
  filename: string;
  documentText: string;
  columns: TabularColumn[];
  apiKey?: string | null;
  onUsage?: Parameters<typeof completeText>[0]["onUsage"];
}): Promise<Map<number, CellResult>> {
  const { system, user } = buildRowPrompt(params);
  const raw = await completeText({
    model: params.model ?? DEFAULT_MODEL,
    systemPrompt: system,
    user,
    maxTokens: 4096,
    apiKey: params.apiKey,
    temperature: 0,
    jsonSchema: ROW_SCHEMA as unknown as Record<string, unknown>,
    onUsage: params.onUsage,
  });
  const out = new Map<number, CellResult>();
  let cells: Array<Record<string, unknown>> = [];
  try {
    cells =
      (JSON.parse(stripJsonFence(raw)) as { cells?: Array<Record<string, unknown>> }).cells ?? [];
  } catch {
    return out;
  }
  for (const cell of cells) {
    const idx = cell.column_index;
    if (typeof idx !== "number") continue;
    const col = params.columns.find((c) => c.index === idx);
    if (!col) continue;
    out.set(idx, {
      content: normalizeCell(
        {
          summary: (typeof cell.summary === "string" ? cell.summary : "").trim() || "Not addressed",
          flag: coerceFlag(cell.flag),
          reasoning: typeof cell.reasoning === "string" ? cell.reasoning : "",
        },
        col.format,
        col.tags
      ),
      citations: coerceCitations(cell.citations),
    });
  }
  return out;
}
