import { createHash } from "node:crypto";
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { documentChunks, type Document, type DocumentChunk } from "@workspace/db/schema";

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
      text: markdown.slice(0, MAX_FULL_TEXT_CHARS),
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
      text: markdown.slice(0, MAX_FULL_TEXT_CHARS),
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

  let selected: DocumentChunk[];
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
  } else {
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

  return {
    mode: "chunks",
    pipeline,
    tokenEstimate: selected.reduce((n, c) => n + c.tokenEstimate, 0),
    text: selected.map(formatChunk).join("\n\n"),
    chunks: contextChunks(selected),
  };
}
