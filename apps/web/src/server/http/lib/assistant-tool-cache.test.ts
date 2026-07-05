import { randomUUID } from "node:crypto";
import { readFile, rm } from "node:fs/promises";
import { dirname, join } from "node:path";
import { describe, expect, test } from "vite-plus/test";
import { readAssistantToolCache, writeAssistantToolCache } from "./assistant-tool-cache.js";

function restoreEnv(old: string | undefined) {
  if (old === undefined) delete process.env.ASSISTANT_TOOL_CACHE;
  else process.env.ASSISTANT_TOOL_CACHE = old;
}

function cacheKey() {
  return {
    documentId: randomUUID(),
    tool: "propose_document_edit",
  };
}

describe("assistant tool cache", () => {
  test("stays disabled unless ASSISTANT_TOOL_CACHE is set", async () => {
    const old = process.env.ASSISTANT_TOOL_CACHE;
    delete process.env.ASSISTANT_TOOL_CACHE;
    try {
      expect(await readAssistantToolCache(cacheKey())).toBeNull();
    } finally {
      restoreEnv(old);
    }
  });

  test("writes and reads a dev cache file", async () => {
    const old = process.env.ASSISTANT_TOOL_CACHE;
    process.env.ASSISTANT_TOOL_CACHE = "1";
    const key = cacheKey();
    try {
      await writeAssistantToolCache(key, {
        input: {
          documentId: key.documentId,
          edits: [{ find: "old", replace: "new" }],
        },
        finalText: "I proposed the edit.",
        original: {
          filename: "Fictional Agreement.txt",
          bytes: new TextEncoder().encode("original file"),
        },
      });
      const hit = await readAssistantToolCache(key);
      expect(hit?.documentId).toBe(key.documentId);
      expect(hit?.tool).toBe("propose_document_edit");
      expect(hit?.path).toContain(".scratch/assistant-cache/propose_document_edit-");
      expect(hit?.path.endsWith("/cache.json")).toBe(true);
      expect(hit?.finalText).toBe("I proposed the edit.");
      if (hit?.path) {
        expect(await readFile(join(dirname(hit.path), "Fictional Agreement.txt"), "utf8")).toBe(
          "original file"
        );
        await rm(dirname(hit.path), { recursive: true, force: true });
      }
    } finally {
      restoreEnv(old);
    }
  });
});
