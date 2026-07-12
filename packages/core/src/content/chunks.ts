import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, or, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  documentChunkEmbeddings,
  documentChunks,
  documents,
  type Document,
  type DocumentChunk,
} from "@workspace/db/schema";
import {
  embedTexts,
  resolveEmbeddingProfile,
  type ResolvedEmbeddingProfile,
} from "../ai/embeddings.js";
import { logEvent } from "../core/log.js";
import { enqueueEmbedding } from "../platform/queue.js";
import { recordEmbeddingUsage } from "../platform/usage.js";

export const FULL_TEXT_TOKEN_LIMIT = 8_000;
// Safety cap on raw markdown handed to a provider when no chunk index applies
// (small docs, or legacy docs extracted before chunking). ~120k tokens.
export const MAX_FULL_TEXT_CHARS = 480_000;
export const CHUNK_PREFERRED_TOKEN_LIMIT = 30_000;
export const TARGET_CHUNK_TOKENS = 800;
export const CHUNK_OVERLAP_TOKENS = 200;

export type ContextPipeline = "chunk_first" | "cache_first" | "hybrid";
export type ContextMode = "auto" | "full" | "overview" | "query" | "chunks";

export type ChunkInput = {
  index: number;
  text: string;
  tokenEstimate: number;
  pageStart: number | null;
  pageEnd: number | null;
  label: string | null;
  contentHash: string;
};

export type DocumentContext = {
  mode: "full" | "overview" | "chunks";
  pipeline: ContextPipeline;
  tokenEstimate: number;
  text: string;
  chunks: Array<{
    ref: string;
    index: number;
    label: string | null;
    pageStart: number | null;
    pageEnd: number | null;
    tokenEstimate: number;
    text: string;
  }>;
};

export function estimateTokens(text: string): number {
  if (!text.trim()) return 0;
  return Math.ceil(text.length / 4);
}

function hashText(text: string): string {
  return createHash("sha256").update(text).digest("hex");
}

// Raw full text for agent context, with a truncation note when the size cap
// clipped it — so the model knows it is not seeing the whole document.
function fullText(markdown: string): string {
  if (markdown.length <= MAX_FULL_TEXT_CHARS) return markdown;
  return `${markdown.slice(0, MAX_FULL_TEXT_CHARS)}\n\n[Truncated: document exceeds the ${MAX_FULL_TEXT_CHARS}-character context cap. Call get_document with mode "query" and a focused question to reach the rest.]`;
}

// Prepended to any partial (chunked) view so the model treats it as a subset
// and pages the rest instead of answering as if it saw the full document.
function partialBanner(shown: number, total: number): string {
  return `[Partial view: ${shown} of ${total} chunks shown. To read other parts, call get_document again with mode "query" and a focused question, or mode "chunks" with refs chunk:0 through chunk:${total - 1}.]`;
}

function words(text: string): string[] {
  return text.match(/\S+/g) ?? [];
}

function textFromWords(items: string[], start: number, end: number): string {
  return items.slice(start, end).join(" ").trim();
}

function pageLabel(page: number | null): string | null {
  return page ? `Page ${page}` : null;
}

function chunkLongText(
  text: string,
  startIndex: number,
  meta: { pageStart?: number | null; pageEnd?: number | null; label?: string | null }
): ChunkInput[] {
  const items = words(text);
  if (items.length === 0) return [];
  const target = TARGET_CHUNK_TOKENS;
  const overlap = Math.min(CHUNK_OVERLAP_TOKENS, Math.floor(target / 2));
  const out: ChunkInput[] = [];
  let index = startIndex;
  let start = 0;
  while (start < items.length) {
    const end = Math.min(items.length, start + target);
    const chunkText = textFromWords(items, start, end);
    if (chunkText) {
      out.push({
        index: index++,
        text: chunkText,
        tokenEstimate: estimateTokens(chunkText),
        pageStart: meta.pageStart ?? null,
        pageEnd: meta.pageEnd ?? meta.pageStart ?? null,
        label: meta.label ?? pageLabel(meta.pageStart ?? null),
        contentHash: hashText(chunkText),
      });
    }
    if (end >= items.length) break;
    start = Math.max(end - overlap, start + 1);
  }
  return out;
}

function splitPdfPages(markdown: string): Array<{ page: number; text: string }> {
  const matches = [...markdown.matchAll(/(?:^|\n)\[Page (\d+)\]\s*\n?/g)];
  if (!matches.length) return [];
  const pages: Array<{ page: number; text: string }> = [];
  for (let i = 0; i < matches.length; i++) {
    const match = matches[i]!;
    const next = matches[i + 1];
    const start = (match.index ?? 0) + match[0].length;
    const end = next?.index ?? markdown.length;
    pages.push({ page: Number(match[1]), text: markdown.slice(start, end).trim() });
  }
  return pages;
}

function splitSections(markdown: string): Array<{ label: string | null; text: string }> {
  const lines = markdown.split(/\n/);
  const sections: Array<{ label: string | null; text: string }> = [];
  let label: string | null = null;
  let buffer: string[] = [];
  const heading = (line: string) => {
    const trimmed = line.trim();
    if (/^#{1,6}\s+\S/.test(trimmed)) return trimmed.replace(/^#{1,6}\s+/, "");
    if (/^(section|article|clause)\s+\d+[\w.-]*\b/i.test(trimmed)) return trimmed;
    if (/^\d+(\.\d+)*[.)]?\s+\S/.test(trimmed)) return trimmed;
    return null;
  };
  const flush = () => {
    const text = buffer.join("\n").trim();
    if (text) sections.push({ label, text });
    buffer = [];
  };
  for (const line of lines) {
    const nextLabel = heading(line);
    if (nextLabel && buffer.length) {
      flush();
      label = nextLabel;
    }
    buffer.push(line);
    if (nextLabel && !label) label = nextLabel;
  }
  flush();
  return sections.length ? sections : [{ label: null, text: markdown.trim() }];
}

export function chunkMarkdown(markdown: string, fileType?: string): ChunkInput[] {
  const trimmed = markdown.trim();
  if (!trimmed) return [];
  const chunks: ChunkInput[] = [];
  if (fileType === "pdf") {
    const pages = splitPdfPages(trimmed);
    if (pages.length) {
      for (const page of pages) {
        chunks.push(
          ...chunkLongText(page.text, chunks.length, {
            pageStart: page.page,
            pageEnd: page.page,
            label: pageLabel(page.page),
          })
        );
      }
      return chunks;
    }
  }

  for (const section of splitSections(trimmed)) {
    chunks.push(...chunkLongText(section.text, chunks.length, { label: section.label }));
  }
  return chunks;
}

export async function replaceDocumentChunks(
  tx: Pick<typeof db, "delete" | "insert">,
  input: {
    documentId: string;
    versionId: string | null;
    markdown: string;
    fileType?: string;
  }
): Promise<void> {
  await tx.delete(documentChunks).where(eq(documentChunks.documentId, input.documentId));
  const chunks = chunkMarkdown(input.markdown, input.fileType);
  if (!chunks.length) return;
  await tx.insert(documentChunks).values(
    chunks.map((chunk) => ({
      documentId: input.documentId,
      versionId: input.versionId,
      index: chunk.index,
      text: chunk.text,
      tokenEstimate: chunk.tokenEstimate,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      label: chunk.label,
      contentHash: chunk.contentHash,
    }))
  );
  // Warm the vector index off the request path. Fire-and-forget and idempotent
  // (dedup by document id) — a no-op when Redis is unconfigured, in which case
  // ensureEmbeddings embeds lazily on the next query. Embeddings are a derived
  // index, so it is safe if this runs before an outer transaction commits: the
  // worker embeds whatever state is committed when it runs.
  void enqueueEmbedding(input.documentId);
}

export function choosePipeline(input: {
  tokenEstimate: number;
  repeated?: boolean;
  task?: "chat" | "tabular" | "playbook" | "whole_document";
}): ContextPipeline {
  if (input.tokenEstimate <= FULL_TEXT_TOKEN_LIMIT) return "cache_first";
  if (input.tokenEstimate > CHUNK_PREFERRED_TOKEN_LIMIT && !input.repeated) return "chunk_first";
  return "hybrid";
}

function cleanTerms(query: string): string[] {
  return [...new Set(query.toLowerCase().match(/[a-z0-9$€£%][a-z0-9$€£%.-]{2,}/g) ?? [])].slice(
    0,
    80
  );
}

function scoreChunk(chunk: DocumentChunk, terms: string[]): number {
  if (!terms.length) return 0;
  const text = `${chunk.label ?? ""}\n${chunk.text}`.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (text.includes(term)) score += term.length > 6 ? 3 : 1;
  }
  return score;
}

function formatChunk(chunk: DocumentChunk): string {
  const ref = `chunk:${chunk.index}`;
  const page =
    chunk.pageStart && chunk.pageEnd
      ? chunk.pageStart === chunk.pageEnd
        ? `page ${chunk.pageStart}`
        : `pages ${chunk.pageStart}-${chunk.pageEnd}`
      : "page unknown";
  const label = chunk.label ? `${chunk.label}, ${page}` : page;
  return `[${ref}; ${label}]\n${chunk.text}`;
}

function contextChunks(chunks: DocumentChunk[]) {
  return chunks.map((chunk) => ({
    ref: `chunk:${chunk.index}`,
    index: chunk.index,
    label: chunk.label,
    pageStart: chunk.pageStart,
    pageEnd: chunk.pageEnd,
    tokenEstimate: chunk.tokenEstimate,
    text: chunk.text,
  }));
}

function vectorLiteral(vector: number[]): string {
  return `[${vector.join(",")}]`;
}

// Embed and store any chunk rows missing a vector under the active profile.
// Idempotent (the profile-unique constraint + onConflictDoNothing make repeat
// calls safe) and side-effect only, so it serves both the lazy query path and
// the background embed worker. Returns false when embedding could not complete
// (provider returned the wrong vector count), so the lazy caller can fall back.
async function storeMissingChunkEmbeddings(
  doc: Document,
  rows: DocumentChunk[],
  profile: ResolvedEmbeddingProfile
): Promise<boolean> {
  const chunkIds = rows.map((chunk) => chunk.id);
  const existing = chunkIds.length
    ? await db
        .select({
          chunkId: documentChunkEmbeddings.chunkId,
          contentHash: documentChunkEmbeddings.contentHash,
        })
        .from(documentChunkEmbeddings)
        .where(
          and(
            inArray(documentChunkEmbeddings.chunkId, chunkIds),
            eq(documentChunkEmbeddings.provider, profile.provider),
            eq(documentChunkEmbeddings.model, profile.model),
            eq(documentChunkEmbeddings.dimensions, profile.dimensions)
          )
        )
    : [];
  const currentHashByChunk = new Map(rows.map((chunk) => [chunk.id, chunk.contentHash]));
  const existingIds = new Set(
    existing
      .filter((row) => currentHashByChunk.get(row.chunkId) === row.contentHash)
      .map((row) => row.chunkId)
  );
  const missing = rows.filter((chunk) => !existingIds.has(chunk.id));
  if (!missing.length) return true;

  const embedded = await embedTexts(
    profile,
    missing.map((chunk) => chunk.text)
  );
  if (embedded.vectors.length !== missing.length) return false;
  await db
    .insert(documentChunkEmbeddings)
    .values(
      missing.map((chunk, index) => ({
        chunkId: chunk.id,
        tenantId: doc.tenantId,
        documentId: doc.id,
        versionId: chunk.versionId,
        provider: profile.provider,
        model: profile.model,
        dimensions: profile.dimensions,
        contentHash: chunk.contentHash,
        embedding: embedded.vectors[index]!,
      }))
    )
    .onConflictDoNothing();
  void recordEmbeddingUsage({
    userId: doc.userId,
    tenantId: doc.tenantId,
    matterId: doc.matterId,
    provider: profile.provider,
    model: profile.model,
    inputTokens: embedded.inputTokens,
  });
  return true;
}

// Background embed entry point: build the vector index for a document's current
// chunks so the retrieval path stays warm. Called off the request path (from the
// embed queue) after extraction/edit rebuilds chunks. No-op when no embedding
// profile is configured or the document has no chunks yet.
export async function embedDocumentChunks(documentId: string): Promise<void> {
  const profile = resolveEmbeddingProfile();
  if (!profile) return;
  const [doc] = await db.select().from(documents).where(eq(documents.id, documentId)).limit(1);
  if (!doc) return;
  const rows = await db
    .select()
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, doc.id),
        doc.currentVersionId
          ? or(eq(documentChunks.versionId, doc.currentVersionId), isNull(documentChunks.versionId))
          : undefined
      )
    )
    .orderBy(asc(documentChunks.index));
  if (!rows.length) return;
  await storeMissingChunkEmbeddings(doc, rows, profile);
}

async function ensureEmbeddings(
  doc: Document,
  rows: DocumentChunk[],
  input: { query: string; maxChunks: number }
): Promise<DocumentChunk[] | null> {
  const profile = resolveEmbeddingProfile();
  if (!profile || !input.query.trim()) return null;

  // Warm any missing vectors first (also the background job's responsibility, but
  // done here too so a query never returns stale-index results).
  const stored = await storeMissingChunkEmbeddings(doc, rows, profile);
  if (!stored) return null;

  const query = await embedTexts(profile, [input.query], "query");
  const queryVector = query.vectors[0];
  if (!queryVector) return null;
  void recordEmbeddingUsage({
    userId: doc.userId,
    tenantId: doc.tenantId,
    matterId: doc.matterId,
    provider: profile.provider,
    model: profile.model,
    inputTokens: query.inputTokens,
  });

  const distance = sql<number>`(${documentChunkEmbeddings.embedding}::vector(${profile.dimensions}) <=> ${vectorLiteral(queryVector)}::vector(${profile.dimensions}))`;
  const selected = await db
    .select({ chunk: documentChunks, distance })
    .from(documentChunkEmbeddings)
    .innerJoin(documentChunks, eq(documentChunks.id, documentChunkEmbeddings.chunkId))
    .where(
      and(
        eq(documentChunkEmbeddings.tenantId, doc.tenantId),
        eq(documentChunkEmbeddings.documentId, doc.id),
        doc.currentVersionId
          ? or(
              eq(documentChunkEmbeddings.versionId, doc.currentVersionId),
              isNull(documentChunkEmbeddings.versionId)
            )
          : undefined,
        eq(documentChunkEmbeddings.provider, profile.provider),
        eq(documentChunkEmbeddings.model, profile.model),
        eq(documentChunkEmbeddings.dimensions, profile.dimensions),
        eq(documentChunkEmbeddings.contentHash, documentChunks.contentHash)
      )
    )
    .orderBy(distance)
    .limit(input.maxChunks);

  return selected.map((row) => row.chunk).sort((a, b) => a.index - b.index);
}

export async function getDocumentContext(
  doc: Document,
  opts: {
    mode?: ContextMode;
    query?: string;
    chunkRefs?: Array<string | number>;
    maxChunks?: number;
    repeated?: boolean;
    task?: "chat" | "tabular" | "playbook" | "whole_document";
  } = {}
): Promise<DocumentContext> {
  const markdown = doc.markdown ?? "";
  const totalTokens = estimateTokens(markdown);
  const pipeline = choosePipeline({
    tokenEstimate: totalTokens,
    repeated: opts.repeated,
    task: opts.task,
  });
  const mode = opts.mode ?? "auto";

  if (mode === "full" || (mode === "auto" && pipeline === "cache_first")) {
    return {
      mode: "full",
      pipeline,
      tokenEstimate: totalTokens,
      text: fullText(markdown),
      chunks: [],
    };
  }

  const rows = await db
    .select()
    .from(documentChunks)
    .where(
      and(
        eq(documentChunks.documentId, doc.id),
        doc.currentVersionId
          ? or(eq(documentChunks.versionId, doc.currentVersionId), isNull(documentChunks.versionId))
          : undefined
      )
    )
    .orderBy(asc(documentChunks.index));

  if (!rows.length) {
    return {
      mode: "full",
      pipeline,
      tokenEstimate: totalTokens,
      text: fullText(markdown),
      chunks: [],
    };
  }

  if (mode === "overview" && !opts.query) {
    const sample = rows.slice(0, Math.min(rows.length, opts.maxChunks ?? 8));
    return {
      mode: "overview",
      pipeline,
      tokenEstimate: sample.reduce((n, c) => n + c.tokenEstimate, 0),
      text: [
        `Document "${doc.title}" has about ${totalTokens} tokens in ${rows.length} chunks.`,
        `Use query mode or exact chunk refs to read relevant text.`,
        sample.map(formatChunk).join("\n\n"),
      ].join("\n\n"),
      chunks: contextChunks(sample),
    };
  }

  let selected: DocumentChunk[] | null = null;
  if (opts.query) {
    try {
      selected = await ensureEmbeddings(doc, rows, {
        query: opts.query,
        maxChunks: opts.maxChunks ?? (opts.task === "tabular" ? 8 : 12),
      });
    } catch (err) {
      logEvent("warn", "document_embeddings.fallback", {
        documentId: doc.id,
        error: err instanceof Error ? err.message : String(err),
      });
    }
  }

  if (mode === "chunks" && opts.chunkRefs?.length) {
    const indexes = opts.chunkRefs
      .map((ref) => (typeof ref === "number" ? ref : Number(String(ref).replace(/^chunk:/, ""))))
      .filter((n) => Number.isInteger(n));
    selected = indexes.length
      ? await db
          .select()
          .from(documentChunks)
          .where(and(eq(documentChunks.documentId, doc.id), inArray(documentChunks.index, indexes)))
          .orderBy(asc(documentChunks.index))
      : [];
  } else if (!selected?.length) {
    const terms = cleanTerms(opts.query ?? "");
    selected = rows
      .map((chunk) => ({ chunk, score: scoreChunk(chunk, terms) }))
      .filter((item) => (terms.length ? item.score > 0 : true))
      .sort((a, b) => b.score - a.score || a.chunk.index - b.chunk.index)
      .slice(0, opts.maxChunks ?? (opts.task === "tabular" ? 8 : 12))
      .map((item) => item.chunk)
      .sort((a, b) => a.index - b.index);
    if (!selected.length) selected = rows.slice(0, Math.min(rows.length, opts.maxChunks ?? 4));
  }

  const body = selected.map(formatChunk).join("\n\n");
  const partial = selected.length < rows.length;
  return {
    mode: "chunks",
    pipeline,
    tokenEstimate: selected.reduce((n, c) => n + c.tokenEstimate, 0),
    text: partial ? `${partialBanner(selected.length, rows.length)}\n\n${body}` : body,
    chunks: contextChunks(selected),
  };
}
