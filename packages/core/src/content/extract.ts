import * as mammoth from "mammoth";
import JSZip from "jszip";
import { XMLParser } from "fast-xml-parser";
import { fetchWithTimeout } from "../core/fetch.js";
import { getEnv } from "../core/config.js";

// mammoth ships markdown conversion at runtime but omits it from its type defs.
const convertToMarkdown = (
  mammoth as unknown as {
    convertToMarkdown: (input: { buffer: Buffer }) => Promise<{ value: string }>;
  }
).convertToMarkdown;

// File-type helpers. Lawyers upload PDF + DOCX; we normalize to markdown for
// LLM context (tabular reviews, chat). DOCX is extracted in-process via mammoth;
// PDF is sent to the docling-serve sidecar (mammoth can't read PDF).

export type SupportedFileType = "pdf" | "docx" | "doc";

export type ExtractResult = { markdown: string; pageCount: number | null };

export function fileTypeFromName(name: string): SupportedFileType | null {
  const ext = name.toLowerCase().split(".").pop();
  if (ext === "pdf" || ext === "docx" || ext === "doc") return ext;
  return null;
}

// Magic-byte prefixes for the formats we accept. Sniffing the bytes stops a
// renamed file (e.g. a .txt or .exe renamed to .pdf) from reaching docling/
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
  return extractPdfViaDocling(bytes);
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

async function extractPdfViaDocling(bytes: Buffer): Promise<ExtractResult> {
  const url = getEnv("DOCLING_URL") || "http://localhost:5001/v1/convert/source";
  const res = await fetchWithTimeout(url, {
    method: "POST",
    headers: { "content-type": "application/json", accept: "application/json" },
    body: JSON.stringify({
      // Ask for json too so we can read the page map for a reliable page count.
      options: { to_formats: ["md", "json"] },
      // docling-serve v1 uses `sources` with a `kind` discriminator (the legacy
      // `file_sources` key returns 422 on current builds).
      sources: [{ kind: "file", base64_string: bytes.toString("base64"), filename: "doc.pdf" }],
    }),
    // PDF conversion (incl. OCR) can be slow; allow a generous window.
    timeoutMs: 120_000,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(
      `docling-serve responded ${res.status} ${res.statusText}${body ? `: ${body.slice(0, 500)}` : ""}`
    );
  }
  const data = (await res.json()) as {
    document?: { md_content?: string; json_content?: { pages?: Record<string, unknown> } };
  };
  const pages = data.document?.json_content?.pages;
  const pageCount = pages ? Object.keys(pages).length || null : null;
  return { markdown: data.document?.md_content ?? "", pageCount };
}
