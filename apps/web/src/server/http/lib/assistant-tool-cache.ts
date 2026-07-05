import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { getEnv, logEvent } from "@workspace/core";

const CACHE_DIR = join(process.cwd(), ".scratch", "assistant-cache");

type ToolCallCacheEntry = {
  version: 1;
  documentId: string;
  tool: string;
  input: unknown;
  finalText: string;
  citations?: unknown[];
  createdAt: string;
};

type CacheKey = {
  documentId: string;
  tool: string;
};

export type AssistantToolCacheHit = Pick<
  ToolCallCacheEntry,
  "documentId" | "tool" | "input" | "finalText" | "citations"
> & {
  path: string;
};

export function assistantToolCacheEnabled(): boolean {
  return getEnv("ASSISTANT_TOOL_CACHE") === "1";
}

function cachePath(key: CacheKey): string {
  return join(cacheEntryDir(key), "cache.json");
}

function cacheEntryDir(key: CacheKey): string {
  return join(CACHE_DIR, `${key.tool}-${key.documentId}`);
}

function isCacheEntry(value: unknown): value is ToolCallCacheEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as ToolCallCacheEntry;
  return (
    entry.version === 1 &&
    typeof entry.documentId === "string" &&
    typeof entry.tool === "string" &&
    "input" in entry &&
    typeof entry.finalText === "string"
  );
}

export async function readAssistantToolCache(key: CacheKey): Promise<AssistantToolCacheHit | null> {
  if (!assistantToolCacheEnabled()) {
    logEvent("info", "assistant_tool_cache.disabled", { tool: key.tool });
    return null;
  }
  const path = cachePath(key);
  try {
    const parsed = JSON.parse(await readFile(path, "utf8")) as unknown;
    if (!isCacheEntry(parsed)) {
      logEvent("warn", "assistant_tool_cache.invalid", {
        tool: key.tool,
        documentId: key.documentId,
        path,
      });
      return null;
    }
    logEvent("info", "assistant_tool_cache.hit", {
      tool: key.tool,
      documentId: key.documentId,
      path,
    });
    return { ...parsed, path };
  } catch {
    logEvent("info", "assistant_tool_cache.miss", {
      tool: key.tool,
      documentId: key.documentId,
      path,
    });
    return null;
  }
}

export async function writeAssistantToolCache(
  key: CacheKey,
  entry: {
    input: unknown;
    finalText: string;
    citations?: unknown[];
    original?: { filename: string; bytes: Uint8Array };
  }
): Promise<void> {
  if (!assistantToolCacheEnabled()) return;
  const dir = cacheEntryDir(key);
  await mkdir(dir, { recursive: true });
  const path = cachePath(key);
  const payload: ToolCallCacheEntry = {
    version: 1,
    documentId: key.documentId,
    tool: key.tool,
    input: entry.input,
    finalText: entry.finalText,
    ...(entry.citations?.length ? { citations: entry.citations } : {}),
    createdAt: new Date().toISOString(),
  };
  await writeFile(path, `${JSON.stringify(payload, null, 2)}\n`);
  if (entry.original) await writeFile(join(dir, entry.original.filename), entry.original.bytes);
  logEvent("info", "assistant_tool_cache.write", {
    tool: key.tool,
    documentId: key.documentId,
    path,
    original: Boolean(entry.original),
  });
}
