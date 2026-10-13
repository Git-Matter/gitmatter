import { createHash } from "node:crypto";
import JSZip from "jszip";
import { XMLParser, XMLValidator } from "fast-xml-parser";
import {
  wordInspectionSchema,
  type WordInspection,
  type WordInspectionReason,
} from "@workspace/contracts";
import { elAttrs, elChildren, elName, getTextContent, type XNode } from "./xml.js";

const WORD_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const STRICT_NS = "http://purl.oclc.org/ooxml/wordprocessingml/main";
const WORD_2010_NS = "http://schemas.microsoft.com/office/word/2010/wordml";
const MAX_ARCHIVE = 32 * 1024 * 1024;
const MAX_EXPANDED = 64 * 1024 * 1024;
const MAX_XML = 4 * 1024 * 1024;
const MAX_ENTRIES = 2048;
const MAX_NODES = 200_000;
const MAX_DEPTH = 100;
const moves = new Set([
  "moveFrom",
  "moveTo",
  "moveFromRangeStart",
  "moveFromRangeEnd",
  "moveToRangeStart",
  "moveToRangeEnd",
]);
const formatting = new Set([
  "rPrChange",
  "pPrChange",
  "sectPrChange",
  "tblPrChange",
  "tblPrExChange",
  "tblGridChange",
  "trPrChange",
  "tcPrChange",
  "numberingChange",
]);
const others = new Set([
  "cellIns",
  "cellDel",
  "cellMerge",
  "customXmlInsRangeStart",
  "customXmlInsRangeEnd",
  "customXmlDelRangeStart",
  "customXmlDelRangeEnd",
  "customXmlMoveFromRangeStart",
  "customXmlMoveFromRangeEnd",
  "customXmlMoveToRangeStart",
  "customXmlMoveToRangeEnd",
  "conflictIns",
  "conflictDel",
  "customXmlConflictInsRangeStart",
  "customXmlConflictInsRangeEnd",
  "customXmlConflictDelRangeStart",
  "customXmlConflictDelRangeEnd",
]);

export function wordTextHash(kind: "ins" | "del", text: string): string {
  return createHash("sha256").update(`${kind}\0${text}`).digest("hex");
}

export class WordInspectionMismatchError extends Error {
  constructor() {
    super("Word source bytes do not match the recorded version inspection.");
  }
}

/** Verify storage still returned the exact published version before an engine
 * action or extraction. A legacy null has no invented historical byte hash. */
export async function inspectVersionWordBytes(
  bytes: Buffer,
  recorded: unknown
): Promise<WordInspection> {
  const inspected = await inspectDocx(bytes);
  if (recorded !== null && recorded !== undefined) {
    const expected = wordInspectionSchema.safeParse(recorded);
    if (!expected.success || expected.data.sourceHash !== inspected.sourceHash)
      throw new WordInspectionMismatchError();
  }
  return inspected;
}

function emptyInspection(bytes: Buffer): WordInspection {
  return {
    schemaVersion: 1,
    sourceHash: createHash("sha256").update(bytes).digest("hex"),
    status: "complete",
    textView: "accepted_body",
    stories: { body: 0, headers: 0, footers: 0, footnotes: 0, endnotes: 0, comments: 0, other: 0 },
    revisions: { insertions: 0, deletions: 0, moves: 0, formatting: 0, other: 0 },
    reasons: [],
    bodyBindings: [],
  };
}

class InspectionFailure extends Error {
  constructor(readonly code: WordInspectionReason) {
    super(code);
  }
}

/** Check declared bounds before JSZip can inflate anything. ZIP64/encryption and
 * ambiguous or traversal paths are deliberately outside this bounded inspector. */
function validateArchive(bytes: Buffer): void {
  if (bytes.length > MAX_ARCHIVE) throw new InspectionFailure("archive_limits");
  if (bytes.length < 22) throw new InspectionFailure("invalid_archive");
  let end = -1;
  for (let i = bytes.length - 22; i >= Math.max(0, bytes.length - 65_557); i--) {
    if (
      bytes.readUInt32LE(i) === 0x06054b50 &&
      i + 22 + bytes.readUInt16LE(i + 20) === bytes.length
    ) {
      end = i;
      break;
    }
  }
  if (end < 0 || bytes.readUInt16LE(end + 4) || bytes.readUInt16LE(end + 6))
    throw new InspectionFailure("invalid_archive");
  const count = bytes.readUInt16LE(end + 10);
  const size = bytes.readUInt32LE(end + 12);
  let offset = bytes.readUInt32LE(end + 16);
  if (count > MAX_ENTRIES || size === 0xffffffff || offset === 0xffffffff)
    throw new InspectionFailure("archive_limits");
  if (count !== bytes.readUInt16LE(end + 8) || offset + size !== end)
    throw new InspectionFailure("invalid_archive");
  const directoryStart = offset;
  const directoryEnd = offset + size;
  const names = new Set<string>();
  const ranges: Array<[number, number]> = [];
  let expanded = 0;
  for (let i = 0; i < count; i++) {
    if (offset + 46 > directoryEnd || bytes.readUInt32LE(offset) !== 0x02014b50)
      throw new InspectionFailure("invalid_archive");
    const flags = bytes.readUInt16LE(offset + 8),
      method = bytes.readUInt16LE(offset + 10);
    const compressed = bytes.readUInt32LE(offset + 20),
      uncompressed = bytes.readUInt32LE(offset + 24);
    const nameLength = bytes.readUInt16LE(offset + 28),
      extraLength = bytes.readUInt16LE(offset + 30),
      commentLength = bytes.readUInt16LE(offset + 32);
    const next = offset + 46 + nameLength + extraLength + commentLength;
    if (
      next > directoryEnd ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      uncompressed === 0xffffffff ||
      compressed === 0xffffffff
    )
      throw new InspectionFailure("invalid_archive");
    const name = bytes
      .subarray(offset + 46, offset + 46 + nameLength)
      .toString("utf8")
      .replace(/\\/g, "/");
    if (
      !name ||
      name.startsWith("/") ||
      name.includes("\0") ||
      name.includes(":") ||
      name.split("/").some((part) => part === ".." || part === ".") ||
      names.has(name.toLowerCase())
    )
      throw new InspectionFailure("invalid_archive");
    names.add(name.toLowerCase());
    const local = bytes.readUInt32LE(offset + 42);
    if (
      bytes.readUInt16LE(offset + 34) ||
      local + 30 > directoryStart ||
      bytes.readUInt32LE(local) !== 0x04034b50 ||
      bytes.readUInt16LE(local + 6) !== flags ||
      bytes.readUInt16LE(local + 8) !== method
    )
      throw new InspectionFailure("invalid_archive");
    const localNameLength = bytes.readUInt16LE(local + 26),
      localExtraLength = bytes.readUInt16LE(local + 28);
    const dataStart = local + 30 + localNameLength + localExtraLength;
    if (
      dataStart + compressed > directoryStart ||
      localNameLength !== nameLength ||
      !bytes
        .subarray(local + 30, local + 30 + localNameLength)
        .equals(bytes.subarray(offset + 46, offset + 46 + nameLength))
    )
      throw new InspectionFailure("invalid_archive");
    ranges.push([local, dataStart + compressed]);
    expanded += uncompressed;
    if (
      expanded > MAX_EXPANDED ||
      (name.endsWith(".xml") && uncompressed > MAX_XML) ||
      uncompressed / Math.max(1, compressed) > 500
    )
      throw new InspectionFailure("archive_limits");
    offset = next;
  }
  if (offset !== directoryEnd) throw new InspectionFailure("invalid_archive");
  ranges.sort((a, b) => a[0] - b[0]);
  if (ranges.some((range, index) => index > 0 && range[0] < ranges[index - 1]![1]))
    throw new InspectionFailure("invalid_archive");
}

async function boundedContent(
  entry: JSZip.JSZipObject,
  max: number,
  collect: boolean,
  budget: { expanded: number }
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    let length = 0,
      ended = false;
    // JSZip documents this public streaming API but omits it from JSZipObject's
    // shipped declaration. Streaming bounds actual expansion, not just ZIP hints.
    type XmlStream = {
      on(event: "data", callback: (chunk: Uint8Array) => void): XmlStream;
      on(event: "error" | "end", callback: () => void): XmlStream;
      pause(): void;
      resume(): void;
    };
    const stream = (
      entry as JSZip.JSZipObject & { internalStream(type: "uint8array"): XmlStream }
    ).internalStream("uint8array");
    stream
      .on("data", (chunk: Uint8Array) => {
        if (ended) return;
        length += chunk.length;
        budget.expanded += chunk.length;
        if (length > max || budget.expanded > MAX_EXPANDED) {
          ended = true;
          stream.pause();
          reject(new InspectionFailure("archive_limits"));
          return;
        }
        if (collect) chunks.push(Buffer.from(chunk));
      })
      .on("error", () => {
        if (!ended) {
          ended = true;
          reject(new InspectionFailure("invalid_archive"));
        }
      })
      .on("end", () => {
        if (!ended) {
          ended = true;
          resolve(Buffer.concat(chunks));
        }
      })
      .resume();
  });
}

function storyFor(path: string): keyof WordInspection["stories"] {
  if (path === "word/document.xml") return "body";
  if (/^word\/header[^/]*\.xml$/.test(path)) return "headers";
  if (/^word\/footer[^/]*\.xml$/.test(path)) return "footers";
  if (path === "word/footnotes.xml") return "footnotes";
  if (path === "word/endnotes.xml") return "endnotes";
  if (path === "word/comments.xml") return "comments";
  return "other";
}

/** Inspect every Word XML part, including non-body stories. Original bytes are
 * untouched; counters do not expose source text, revision authors, or XML. */
export async function inspectDocx(bytes: Buffer): Promise<WordInspection> {
  const result = emptyInspection(bytes);
  const reason = (code: WordInspectionReason) => {
    if (!result.reasons.includes(code)) result.reasons.push(code);
  };
  try {
    validateArchive(bytes);
    const zip = await JSZip.loadAsync(bytes);
    const budget = { expanded: 0 };
    let hasBody = false,
      nodes = 0;
    const ids = new Set<string>();
    for (const part of Object.values(zip.files).filter((entry) => !entry.dir)) {
      const path = part.name.replace(/\\/g, "/");
      const xmlExtension = /\.(?:xml|rels)$/i.test(path);
      const content = await boundedContent(
        part,
        xmlExtension ? MAX_XML : MAX_ARCHIVE,
        true,
        budget
      );
      // OPC parts need not use .xml in their name. Detect XML content as well so
      // a relationship to an unusually named story cannot bypass inspection.
      const isXml =
        xmlExtension || /^\s*(?:\uFEFF)?\s*</.test(content.subarray(0, 256).toString("utf8"));
      if (!isXml) continue;
      if (content.length > MAX_XML) throw new InspectionFailure("archive_limits");
      const story = storyFor(path);
      result.stories[story]++;
      const raw = content.toString("utf8");
      if (/<!DOCTYPE|<!ENTITY/i.test(raw)) throw new InspectionFailure("unsafe_xml");
      // Bound nesting before handing the XML to a tree-building parser.
      let xmlDepth = 0;
      for (const tag of raw.matchAll(/<\/?[A-Za-z_][^>]*>/g)) {
        if (tag[0].startsWith("</")) xmlDepth--;
        else if (!tag[0].endsWith("/>")) xmlDepth++;
        if (xmlDepth > MAX_DEPTH) throw new InspectionFailure("archive_limits");
      }
      if (XMLValidator.validate(raw) !== true) throw new InspectionFailure("malformed_xml");
      const tree = new XMLParser({
        preserveOrder: true,
        ignoreAttributes: false,
        trimValues: false,
        parseTagValue: false,
        processEntities: true,
      }).parse(raw) as XNode[];
      const visit = (
        node: XNode,
        parents: string[],
        namespaces: Record<string, string>,
        depth: number
      ) => {
        if (++nodes > MAX_NODES || depth > MAX_DEPTH) throw new InspectionFailure("archive_limits");
        const name = elName(node);
        if (!name) return;
        const attrs = elAttrs(node);
        const scope = { ...namespaces };
        for (const [key, value] of Object.entries(attrs)) {
          if (key.startsWith("@_xmlns:")) scope[key.slice(8)] = value;
          if (key === "@_xmlns") scope[""] = value;
        }
        const [prefix, local] = name.includes(":") ? name.split(":") : ["", name];
        const uri = scope[prefix];
        const word = uri === WORD_NS || uri === STRICT_NS;
        const wordExtension = uri === WORD_2010_NS;
        if (name.startsWith("w:") && !word) reason("unsupported_namespace");
        if (word && (prefix !== "w" || uri !== WORD_NS)) reason("unsupported_namespace");
        if (
          story === "body" &&
          word &&
          [
            "hyperlink",
            "sdt",
            "txbxContent",
            "altChunk",
            "fldSimple",
            "fldChar",
            "instrText",
          ].includes(local)
        )
          reason("limited_body_content");
        if (story === "body" && word && local === "body" && parents.at(-1) === "w:document")
          hasBody = true;
        const category =
          wordExtension && others.has(local)
            ? "other"
            : !word
              ? null
              : local === "ins"
                ? "insertions"
                : local === "del"
                  ? "deletions"
                  : moves.has(local)
                    ? "moves"
                    : formatting.has(local)
                      ? "formatting"
                      : others.has(local)
                        ? "other"
                        : null;
        if (category) {
          result.revisions[category]++;
          if (story !== "body") reason("non_body_revision");
          const simple =
            (local === "ins" || local === "del") &&
            story === "body" &&
            prefix === "w" &&
            uri === WORD_NS &&
            parents.at(-1) === "w:p" &&
            !parents.some((parent) => parent === "w:ins" || parent === "w:del") &&
            elChildren(node).every((child) => elName(child) === "w:r");
          if (!simple) reason("unsupported_revision");
          else {
            const id = attrs["@_w:id"];
            if (!id || !/^\d{1,64}$/.test(id) || ids.has(id)) reason("invalid_revision_binding");
            else {
              ids.add(id);
              const kind = local as "ins" | "del";
              let text = "";
              for (const run of elChildren(node))
                for (const child of elChildren(run)) {
                  if (elName(child) === (kind === "ins" ? "w:t" : "w:delText"))
                    text += getTextContent(child);
                  else if (elName(child) === "w:br") text += "\n";
                  else if (elName(child) !== "w:rPr") reason("unsupported_revision");
                }
              result.bodyBindings.push({ id, kind, textHash: wordTextHash(kind, text) });
            }
          }
        }
        for (const child of elChildren(node)) visit(child, [...parents, name], scope, depth + 1);
      };
      for (const top of tree) visit(top, [], {}, 0);
    }
    if (!hasBody) throw new InspectionFailure("missing_body");
    if (result.reasons.length) result.textView = "limited_body";
  } catch (error) {
    result.status = "uninspectable";
    result.textView = "limited_body";
    reason(error instanceof InspectionFailure ? error.code : "invalid_archive");
    // A partial scan is never evidence of a revision-free archive.
    result.bodyBindings = [];
  }
  return result;
}

export type RegisteredWordEdit = {
  delWId: string | null;
  insWId: string | null;
  deletedText: string | null;
  insertedText: string | null;
};
export function wordInspectionSafety(inspection: WordInspection, edits: RegisteredWordEdit[]) {
  const registered = new Map<string, { kind: "ins" | "del"; textHash: string }>();
  let duplicateRegistry = false;
  for (const edit of edits) {
    if (edit.delWId) {
      if (registered.has(edit.delWId)) duplicateRegistry = true;
      registered.set(edit.delWId, {
        kind: "del",
        textHash: wordTextHash("del", edit.deletedText ?? ""),
      });
    }
    if (edit.insWId) {
      if (registered.has(edit.insWId)) duplicateRegistry = true;
      registered.set(edit.insWId, {
        kind: "ins",
        textHash: wordTextHash("ins", edit.insertedText ?? ""),
      });
    }
  }
  let registeredRevisions = 0;
  for (const binding of inspection.bodyBindings) {
    const match = registered.get(binding.id);
    if (match?.kind === binding.kind && match.textHash === binding.textHash) registeredRevisions++;
  }
  const revisions = Object.values(inspection.revisions).reduce((sum, value) => sum + value, 0);
  const incomingRevisions = revisions - registeredRevisions;
  const supported = inspection.status === "complete" && inspection.reasons.length === 0;
  const safeToEdit =
    supported &&
    !duplicateRegistry &&
    incomingRevisions === 0 &&
    registeredRevisions === registered.size;
  return {
    registeredRevisions,
    incomingRevisions,
    safeToEdit,
    safeClean: supported && revisions === 0 && registered.size === 0,
  };
}

export function assertWordInspectionSafe(
  inspection: WordInspection,
  edits: RegisteredWordEdit[],
  clean = false
): void {
  const safety = wordInspectionSafety(inspection, edits);
  if (clean ? !safety.safeClean : !safety.safeToEdit)
    throw new Error(
      "Word inspection cannot attest this operation. Resolve incoming or unsupported revisions in Word, then upload a new source; the original file is preserved."
    );
}
