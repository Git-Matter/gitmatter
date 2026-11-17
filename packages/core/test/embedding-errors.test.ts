import { afterEach, describe, expect, test, vi } from "vite-plus/test";
import type { Document } from "@workspace/db/schema";
import * as embeddings from "../src/ai/embeddings.js";
import { getDocumentContext } from "../src/content/chunks.js";
import { enqueueEmbedding, startEmbeddingWorker } from "../src/platform/queue.js";

type FailedListener = (
  job: { data: { documentId: string }; attemptsMade: number },
  error: Error
) => void;
const fixture = vi.hoisted(() => ({
  select: vi.fn(),
  log: vi.fn(),
  add: vi.fn(),
  openaiCreate: vi.fn(),
  failed: undefined as FailedListener | undefined,
}));
vi.mock("@workspace/db/client", () => ({ db: { select: fixture.select } }));
vi.mock("../src/core/log.js", () => ({ logEvent: fixture.log }));
vi.mock("../src/platform/usage.js", () => ({ recordEmbeddingUsage: vi.fn() }));
vi.mock("openai", () => ({
  default: class {
    embeddings = { create: fixture.openaiCreate };
  },
}));
vi.mock("bullmq", () => ({
  Queue: class {
    add = fixture.add;
    on() {}
  },
  Worker: class {
    on(event: string, handler: unknown) {
      if (event === "failed") fixture.failed = handler as FailedListener;
    }
  },
}));

const marker = "SYNTHETIC_PRIVATE_PROVIDER_BODY";
const openaiProfile: embeddings.ResolvedEmbeddingProfile = {
  provider: "openai",
  model: "synthetic-embedding-model",
  dimensions: 1536,
  source: "env",
  key: "synthetic-embedding-key",
};
const envNames = ["EMBEDDING_PROVIDER", "VOYAGE_API_KEY", "OPENAI_API_KEY", "REDIS_URL"] as const;
const oldEnv = new Map(envNames.map((name) => [name, process.env[name]]));

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
  for (const name of envNames) {
    const value = oldEnv.get(name);
    if (value === undefined) delete process.env[name];
    else process.env[name] = value;
  }
});

function queryContext(provider: "voyage" | "openai" = "voyage") {
  process.env.EMBEDDING_PROVIDER = provider;
  process.env.VOYAGE_API_KEY = "synthetic-embedding-key";
  process.env.OPENAI_API_KEY = "synthetic-embedding-key";
  const rows = [
    { id: "chunk-0", index: 0, text: "The indemnity is mutual.", tokenEstimate: 6 },
    { id: "chunk-1", index: 1, text: "Fees are due monthly.", tokenEstimate: 5 },
  ];
  fixture.select
    .mockReturnValueOnce({ from: () => ({ where: () => ({ orderBy: async () => rows }) }) })
    .mockReturnValueOnce({ from: () => ({ where: async () => [] }) });
  return getDocumentContext(
    {
      id: "synthetic-document",
      tenantId: "synthetic-tenant",
      title: "Fictional agreement",
      currentVersionId: null,
      markdown: "The indemnity is mutual. Fees are due monthly.",
    } as Document,
    { mode: "query", query: "indemnity", maxChunks: 1, allowEmbedding: true }
  );
}

describe("embedding failure privacy (synthetic transport and queue, no database or network)", () => {
  test("a provider HTTP failure preserves keyword fallback and safe status without reading its body", async () => {
    const response = new Response(marker, { status: 503 });
    const readBody = vi.spyOn(response, "text");
    const discardBody = vi.spyOn(response.body!, "cancel");
    vi.spyOn(globalThis, "fetch").mockResolvedValue(response);

    const context = await queryContext();

    expect(context.text).toContain("The indemnity is mutual.");
    expect(context.text).toContain("Partial view: 1 of 2 chunks shown");
    expect(readBody).not.toHaveBeenCalled();
    expect(discardBody).toHaveBeenCalledOnce();
    expect(fixture.log).toHaveBeenCalledWith("warn", "document_embeddings.fallback", {
      documentId: "synthetic-document",
      stage: "retrieval",
      code: "embedding_failed",
      status: 503,
    });
    expect(JSON.stringify(fixture.log.mock.calls)).not.toContain(marker);
  });

  test("an SDK error becomes a safe queue failure and fallback log while retaining its HTTP status", async () => {
    fixture.openaiCreate.mockRejectedValue(Object.assign(new Error(marker), { status: 429 }));
    const failure = await embeddings
      .embedTexts(openaiProfile, ["Fictional indemnity"])
      .catch((error: unknown) => error);
    expect(failure).toMatchObject({ message: "Embedding provider request failed", status: 429 });
    expect(failure).not.toHaveProperty("cause");
    expect(String(failure)).not.toContain(marker);

    expect((await queryContext("openai")).chunks.map((chunk) => chunk.index)).toEqual([0]);
    expect(fixture.log).toHaveBeenCalledWith(
      "warn",
      "document_embeddings.fallback",
      expect.objectContaining({ code: "embedding_failed", status: 429, stage: "retrieval" })
    );
    expect(JSON.stringify(fixture.log.mock.calls)).not.toContain(marker);
  });

  test("successful embeddings retain vectors and usage while blank input makes no provider request", async () => {
    fixture.openaiCreate.mockResolvedValue({
      data: [{ index: 0, embedding: [0.2, 0.4] }],
      usage: { total_tokens: 3 },
    });
    expect(await embeddings.embedTexts(openaiProfile, ["Fictional indemnity"])).toEqual({
      vectors: [[0.2, 0.4]],
      inputTokens: 3,
    });
    expect(await embeddings.embedTexts(openaiProfile, [" "])).toEqual({ vectors: [] });
    expect(fixture.openaiCreate).toHaveBeenCalledOnce();
  });

  test("queue failures retain stage and attempt information without copying raw messages or invalid status", async () => {
    process.env.REDIS_URL = "redis://synthetic-queue";
    fixture.add.mockRejectedValue(new Error(marker));
    await enqueueEmbedding("synthetic-document");
    startEmbeddingWorker();
    expect(fixture.failed).toBeDefined();
    const job = { data: { documentId: "synthetic-document" }, attemptsMade: 2 };
    fixture.failed?.(job, Object.assign(new Error(marker), { status: 429 }));
    fixture.failed?.(job, Object.assign(new Error(marker), { status: marker }));

    expect(fixture.log).toHaveBeenCalledWith("warn", "queue.enqueue_failed", {
      documentId: "synthetic-document",
      stage: "enqueue",
      code: "queue_unavailable",
    });
    expect(fixture.log).toHaveBeenCalledWith("warn", "queue.embed_failed", {
      documentId: "synthetic-document",
      attempts: 2,
      stage: "indexing",
      code: "embedding_failed",
      status: 429,
    });
    expect(fixture.log.mock.calls.at(-1)?.[2]).not.toHaveProperty("status");
    expect(JSON.stringify(fixture.log.mock.calls)).not.toContain(marker);
  });
});
