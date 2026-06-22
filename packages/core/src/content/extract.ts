import * as mammoth from "mammoth";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { extractText, getDocumentProxy } from "unpdf";

// mammoth ships markdown conversion at runtime but omits it from its type defs.
const convertToMarkdown = (
  mammoth as unknown as {
    convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  }
).convertToMarkdown;

// File-type helpers. Lawyers upload PDF + DOCX; we normalize to markdown for
// LLM context (tabular reviews, chat). DOCX is extracted in-process via mammoth;
// PDF is parsed by pdf.js (via unpdf) in a worker thread — text-layer only, no
// OCR, so scanned PDFs come back empty (surfaced as a passive warning upstream).

export type SupportedFileType = "pdf" | "docx" | "doc";

export type ExtractResult = {
  markdown: string;
  pageCount: number | null;
};

export function fileTypeFromName(name: string): SupportedFileType | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf" || ext === "docx" || ext === "doc") return ext;
  return null;
}

// Magic-byte prefixes for the formats we accept. Sniffing the bytes stops a
// renamed file (e.g. a .txt or .exe renamed to .pdf) from reaching pdf.js/
// mammoth on the strength of its extension alone.
const PDF_MAGIC = Buffer.from("%PDF-", "ascii"); // 25 50 44 46 2D
const ZIP_MAGIC = Buffer.from([0x50, 0x4b, 0x03, 0x04]); // PK\x03\x04 — OOXML (.docx) is a zip
const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]); // legacy .doc

/**
 * Detect the file type from its leading bytes. Returns the container family,
 * not the exact extension: `docx` covers any OOXML zip and `doc` any OLE
 * compound file — the magic alone can't tell .docx from .xlsx or .doc from
 * .xls, so the extension (via {@link assertFileTypeMatches}) decides within a
 * family. Null when nothing matches.
 */
export function sniffFileType(bytes: Buffer): SupportedFileType | null {
  if (bytes.subarray(0, PDF_MAGIC.length).equals(PDF_MAGIC)) return "pdf";
  if (bytes.subarray(0, ZIP_MAGIC.length).equals(ZIP_MAGIC)) return "docx";
  if (bytes.subarray(0, OLE_MAGIC.length).equals(OLE_MAGIC)) return "doc";
  return null;
}

/**
 * Accept an upload only when its bytes match its declared extension. Returns the
 * resolved type on agreement, or a short mismatch reason for a 400. PDF must
 * sniff as pdf; docx/doc share their families with other Office formats, so we
 * only require the sniff to land in the same container family (zip↔docx,
 * OLE↔doc), not the exact extension.
 */
export function assertFileTypeMatches(
  name: string,
  bytes: Buffer
): { ok: true; fileType: SupportedFileType } | { ok: false; reason: string } {
  const declared = fileTypeFromName(name);
  if (!declared) return { ok: false, reason: "only PDF and DOCX/DOC are supported" };
  const sniffed = sniffFileType(bytes);
  const family = (t: SupportedFileType) => (t === "doc" ? "doc" : t === "docx" ? "docx" : "pdf");
  if (!sniffed || family(sniffed) !== family(declared)) {
    return { ok: false, reason: `file content does not match its .${declared} extension` };
  }
  return { ok: true, fileType: declared };
}

/** Extract markdown (and a best-effort page count) from a document's bytes. */
export async function extractMarkdown(
  bytes: Buffer,
  fileType: SupportedFileType
): Promise<ExtractResult> {
  if (fileType === "docx" || fileType === "doc") {
    const { value } = await convertToMarkdown({ buffer: bytes });
    return { markdown: value, pageCount: await docxPageCount(bytes) };
  }
  return extractPdfText(bytes);
}

/**
 * Word stamps the page count it computed at save time into docProps/app.xml as
 * `<Pages>`. Read it straight from the zip — null if absent (.doc binary, or a
 * generated file that never carried the property).
 */
async function docxPageCount(bytes: Buffer): Promise<number | null> {
  try {
    const zip = await JSZip.loadAsync(bytes);
    const xml = await zip.file("docProps/app.xml")?.async("string");
    if (!xml) return null;
    const parsed = new XMLParser().parse(xml) as { Properties?: { Pages?: number | string } };
    const pages = Number(parsed.Properties?.Pages);
    return Number.isFinite(pages) && pages > 0 ? pages : null;
  } catch {
    return null;
  }
}

/**
 * Extract page-anchored text from a PDF via pdf.js (unpdf). Text-layer only — no
 * OCR — so a scanned PDF yields empty markdown (surfaced as a passive warning
 * upstream). Each page is prefixed with a `[Page N]` marker so the model and
 * downstream citations can attribute by page.
 *
 * NOTE: pdf.js parsing is CPU-bound and runs on the main thread, so a very large
 * PDF can briefly stall the event loop. Extraction is already serialized per user
 * in a background queue, so this is acceptable at current scale; moving it to a
 * worker thread needs build-config work (the server bundle doesn't emit workers).
 */
async function extractPdfText(bytes: Buffer): Promise<ExtractResult> {
  const pdf = await getDocumentProxy(new Uint8Array(bytes));
  const { totalPages, text } = await extractText(pdf); // per-page array
  const markdown = text
    .map((pageText, i) => `[Page ${i + 1}]\n\n${pageText.trim()}`)
    .join("\n\n")
    .trim();
  return { markdown, pageCount: totalPages || null };
}
