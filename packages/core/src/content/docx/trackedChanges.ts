/**
 * DOCX tracked-changes helpers.
 *
 * `applyTrackedEdits` rewrites a .docx so that the requested substitutions
 * appear as `<w:ins>` / `<w:del>` tracked changes rather than direct text
 * replacements. `resolveTrackedChange` accepts or rejects one change by
 * its `w:id`, producing a new .docx with only that change collapsed.
 *
 * Only text inside `<w:p><w:r><w:t>` is considered. Headers, footers,
 * comments, footnotes are left alone. Pre-existing tracked changes in the
 * paragraph are presented to the matcher in *accepted view*: w:ins runs are
 * treated as normal text, w:del wrappers are invisible. When a new edit's
 * range lands on runs inside a pre-existing w:ins, the wrapper is dropped
 * (accepting that insertion) before the new change is emitted.
 */

import JSZip from "jszip";
import { buildRun, flattenParagraph, type Flattened } from "./paragraph.js";
import {
  ATTR_KEY,
  createBuilder,
  createParser,
  elAttrs,
  elChildren,
  elName,
  ensureXmlDeclaration,
  findBody,
  makeEl,
  maxTrackedId,
  replaceBody,
  setChildren,
  type XNode,
} from "./xml.js";
import { getZipEntry, setZipEntry } from "./zip.js";

// ---------------------------------------------------------------------------
// Public types
// ---------------------------------------------------------------------------

export interface EditInput {
  find: string;
  replace: string;
  context_before: string;
  context_after: string;
  reason?: string;
}

export interface AppliedChange {
  id: string;
  delId?: string;
  insId?: string;
  deletedText: string;
  insertedText: string;
  contextBefore: string;
  contextAfter: string;
  reason?: string;
}

export interface EditError {
  index: number;
  reason: string;
}

export interface ApplyTrackedEditsResult {
  bytes: Buffer;
  changes: AppliedChange[];
  errors: EditError[];
}

// ---------------------------------------------------------------------------
// Planning edits on a paragraph
// ---------------------------------------------------------------------------

/**
 * A single logical change. Spans a contiguous [start, end) character range in
 * the paragraph text (may be empty for a pure insert) and may carry an
 * inserted string appended at `start`.
 */
interface PlannedChange {
  editIndex: number; // source edit index
  deleteStart: number; // paragraph text offset (inclusive)
  deleteEnd: number; // paragraph text offset (exclusive); may equal start
  deletedText: string; // substring of paraText in [start, end)
  insertedText: string; // may be empty
  contextBefore: string;
  contextAfter: string;
  reason?: string;
  changeId: string; // logical id (not the w:id)
  delWId?: string; // w:id of w:del wrapper (if deletedText non-empty)
  insWId?: string; // w:id of w:ins wrapper (if insertedText non-empty)
}

/**
 * Collapse a `fast-diff` result into a minimal `{deletedText, insertedText}`
 * tuple anchored at a single start position. `fast-diff` produces
 * sequences like EQ-DEL-EQ-INS. For tracked-change UI we want one
 * "replace this substring with that substring" card per edit, so we
 * merge everything into the outer span.
 */
function collapseDiff(
  find: string,
  replace: string
): { deleted: string; inserted: string; leadingEq: number; trailingEq: number } {
  // Find leading/trailing common substrings so the tracked range is minimal
  let leading = 0;
  const minLen = Math.min(find.length, replace.length);
  while (leading < minLen && find[leading] === replace[leading]) leading++;
  let trailing = 0;
  while (
    trailing < minLen - leading &&
    find[find.length - 1 - trailing] === replace[replace.length - 1 - trailing]
  ) {
    trailing++;
  }
  const deleted = find.slice(leading, find.length - trailing);
  const inserted = replace.slice(leading, replace.length - trailing);
  return { deleted, inserted, leadingEq: leading, trailingEq: trailing };
}

// ---------------------------------------------------------------------------
// Paragraph reconstruction
// ---------------------------------------------------------------------------

/**
 * Given a paragraph's children and a sorted, non-overlapping list of
 * `PlannedChange`s that fall within it, return a new children array with
 * tracked changes inserted.
 */
function reconstructParagraph(
  paragraphChildren: XNode[],
  flattened: Flattened,
  changes: PlannedChange[],
  timestamp: string,
  author: string
): XNode[] {
  if (changes.length === 0) return paragraphChildren;

  // Determine the run-index span that edits touch.
  let firstRunIndex = flattened.runs.length;
  let lastRunIndex = -1;
  for (const change of changes) {
    for (let textOffset = change.deleteStart; textOffset < change.deleteEnd; textOffset++) {
      const runIndex = flattened.charRun[textOffset];
      if (runIndex < firstRunIndex) firstRunIndex = runIndex;
      if (runIndex > lastRunIndex) lastRunIndex = runIndex;
    }
    // Also include the run to the left/right of a pure insertion so we
    // can inherit its run properties.
    if (change.deleteStart === change.deleteEnd && change.deleteStart < flattened.paraText.length) {
      const runIndex = flattened.charRun[change.deleteStart];
      if (runIndex < firstRunIndex) firstRunIndex = runIndex;
      if (runIndex > lastRunIndex) lastRunIndex = runIndex;
    } else if (change.deleteStart === change.deleteEnd && change.deleteStart > 0) {
      const runIndex = flattened.charRun[change.deleteStart - 1];
      if (runIndex < firstRunIndex) firstRunIndex = runIndex;
      if (runIndex > lastRunIndex) lastRunIndex = runIndex;
    }
  }
  if (firstRunIndex > lastRunIndex) {
    // No runs touched (edits against empty paragraph?) — nothing to do.
    return paragraphChildren;
  }

  // Child-index range in paragraph.children we are going to replace.
  const startChildIndex = flattened.runs[firstRunIndex].childIndex;
  const endChildIndex = flattened.runs[lastRunIndex].childIndex;

  // Paragraph-text range that this run span covers.
  const firstRun = flattened.runs[firstRunIndex];
  const lastRun = flattened.runs[lastRunIndex];
  const spanStart = firstRun.textNodes.length > 0 ? firstRun.textNodes[0].paraStart : 0;
  const spanEnd =
    lastRun.textNodes.length > 0
      ? lastRun.textNodes[lastRun.textNodes.length - 1].paraEnd
      : spanStart;

  // Walk [spanStart, spanEnd) in paraText, producing a new children array.
  const newRunGroup: XNode[] = [];

  // Helper: get the run properties for the run containing paragraph offset `pos`
  // (clamped to the touched span). Used to inherit formatting for
  // insertions that fall exactly on a boundary.
  const runPropsAt = (textOffset: number): XNode | null => {
    let offset = textOffset;
    if (offset < 0) offset = 0;
    if (offset >= flattened.paraText.length) offset = flattened.paraText.length - 1;
    if (offset < 0) return firstRun.runProperties;
    return flattened.runs[flattened.charRun[offset]].runProperties;
  };

  // Emit a "normal" run fragment covering [a, b) of paraText, grouping
  // consecutive chars that belong to the same source text node.
  const emitNormal = (start: number, end: number) => {
    if (start >= end) return;
    let cursor = start;
    while (cursor < end) {
      const runIndex = flattened.charRun[cursor];
      const textNodeIndex = flattened.charTextNode[cursor];
      let nextCursor = cursor + 1;
      while (
        nextCursor < end &&
        flattened.charRun[nextCursor] === runIndex &&
        flattened.charTextNode[nextCursor] === textNodeIndex
      ) {
        nextCursor++;
      }
      const runSlot = flattened.runs[runIndex];
      const text = flattened.paraText.slice(cursor, nextCursor);
      newRunGroup.push(buildRun(runSlot.runProperties, text, "w:t"));
      cursor = nextCursor;
    }
  };

  // Emit a w:del wrapping run fragments covering [a, b) of paraText.
  const emitDelete = (start: number, end: number, wId: string) => {
    if (start >= end) return;
    const inner: XNode[] = [];
    let cursor = start;
    while (cursor < end) {
      const runIndex = flattened.charRun[cursor];
      const textNodeIndex = flattened.charTextNode[cursor];
      let nextCursor = cursor + 1;
      while (
        nextCursor < end &&
        flattened.charRun[nextCursor] === runIndex &&
        flattened.charTextNode[nextCursor] === textNodeIndex
      ) {
        nextCursor++;
      }
      const runSlot = flattened.runs[runIndex];
      const text = flattened.paraText.slice(cursor, nextCursor);
      inner.push(buildRun(runSlot.runProperties, text, "w:delText"));
      cursor = nextCursor;
    }
    newRunGroup.push(
      makeEl("w:del", inner, {
        "w:id": wId,
        "w:author": author,
        "w:date": timestamp,
      })
    );
  };

  // Emit a w:ins at position `pos` inheriting run properties from there.
  const emitInsert = (textOffset: number, text: string, wId: string) => {
    if (!text) return;
    const runProperties = runPropsAt(textOffset === spanEnd ? textOffset - 1 : textOffset);
    const run = buildRun(runProperties, text, "w:t");
    newRunGroup.push(
      makeEl("w:ins", [run], {
        "w:id": wId,
        "w:author": author,
        "w:date": timestamp,
      })
    );
  };

  let cursor = spanStart;
  for (const change of changes) {
    // Untouched slice before this edit
    emitNormal(cursor, change.deleteStart);
    // Insertion fires at the edit boundary
    if (change.insertedText) emitInsert(change.deleteStart, change.insertedText, change.insWId!);
    // Deletion wraps the span
    if (change.deleteEnd > change.deleteStart) {
      emitDelete(change.deleteStart, change.deleteEnd, change.delWId!);
    }
    cursor = change.deleteEnd;
  }
  emitNormal(cursor, spanEnd);

  // Replace only the w:r children that the edits touch; preserve any other
  // interleaved elements (bookmarks, existing tracked-changes, w:sdt …) at
  // their original positions.
  const droppedChildIndexes = new Set<number>();
  for (let runIndex = firstRunIndex; runIndex <= lastRunIndex; runIndex++) {
    droppedChildIndexes.add(flattened.runs[runIndex].childIndex);
  }
  // Any w:del wrappers that sit inside the span we're rewriting are also
  // dropped, which accepts their deletions (their text is already absent
  // from paraText in the accepted view).
  for (let childIndex = startChildIndex; childIndex <= endChildIndex; childIndex++) {
    if (elName(paragraphChildren[childIndex]) === "w:del") {
      droppedChildIndexes.add(childIndex);
    }
  }
  const out: XNode[] = [];
  for (let childIndex = 0; childIndex < paragraphChildren.length; childIndex++) {
    if (childIndex === startChildIndex) {
      for (const newNode of newRunGroup) out.push(newNode);
    }
    if (droppedChildIndexes.has(childIndex)) continue;
    out.push(paragraphChildren[childIndex]);
  }
  return out;
}

// ---------------------------------------------------------------------------
// Locating context in the document
// ---------------------------------------------------------------------------

interface ParagraphRef {
  paraNode: XNode;
  paraChildren: XNode[];
  flat: Flattened;
  globalStart: number; // where this paragraph starts in the full doc text
}

interface DocumentTextMap {
  text: string;
  normalized: Normalized;
  paragraphByOffset: number[];
  localOffsetByOffset: number[];
}

function isParagraphContainer(name: string): boolean {
  return (
    name === "w:tbl" ||
    name === "w:tr" ||
    name === "w:tc" ||
    name === "w:sdt" ||
    name === "w:sdtContent"
  );
}

function collectParagraphs(bodyChildren: XNode[]): ParagraphRef[] {
  const paragraphs: ParagraphRef[] = [];

  function visit(nodes: XNode[]) {
    for (const node of nodes) {
      const name = elName(node);
      if (!name) continue;
      if (name === "w:p") {
        const paragraphChildren = elChildren(node);
        paragraphs.push({
          paraNode: node,
          paraChildren: paragraphChildren,
          flat: flattenParagraph(paragraphChildren),
          globalStart: 0,
        });
        continue;
      }
      if (isParagraphContainer(name)) visit(elChildren(node));
    }
  }

  visit(bodyChildren);
  setParagraphGlobalStarts(paragraphs);
  return paragraphs;
}

function setParagraphGlobalStarts(paragraphs: ParagraphRef[]): void {
  let globalOffset = 0;
  for (const paragraph of paragraphs) {
    paragraph.globalStart = globalOffset;
    globalOffset += paragraph.flat.paraText.length + 1;
  }
}

function createDocumentTextMap(paragraphs: ParagraphRef[]): DocumentTextMap {
  let text = "";
  const paragraphByOffset: number[] = [];
  const localOffsetByOffset: number[] = [];

  for (let paragraphIndex = 0; paragraphIndex < paragraphs.length; paragraphIndex++) {
    if (paragraphIndex > 0) {
      text += "\n";
      paragraphByOffset.push(-1);
      localOffsetByOffset.push(-1);
    }

    const paragraphText = paragraphs[paragraphIndex].flat.paraText;
    for (let localOffset = 0; localOffset < paragraphText.length; localOffset++) {
      text += paragraphText[localOffset];
      paragraphByOffset.push(paragraphIndex);
      localOffsetByOffset.push(localOffset);
    }
  }

  return {
    text,
    normalized: normalizeWs(text),
    paragraphByOffset,
    localOffsetByOffset,
  };
}

function indexAll(hay: string, needle: string): number[] {
  if (!needle) return [];
  const out: number[] = [];
  let i = 0;
  while (i <= hay.length - needle.length) {
    const j = hay.indexOf(needle, i);
    if (j < 0) break;
    out.push(j);
    i = j + 1;
  }
  return out;
}

// --- Whitespace / punctuation normalization for anchor matching -------------
// The text LLMs see (via mammoth's extractRawText) does not line up 1:1 with
// the raw w:t concatenation: smart quotes, non-breaking spaces, tabs, and
// runs of whitespace all differ. We normalize both haystack and needle to
// a canonical form for matching, then map matched offsets back to the
// original paragraph text.

function preNormalize(s: string): string {
  // All 1-to-1 character replacements — preserves length for straightforward
  // index mapping.
  return s
    .replace(/[\u2018\u2019\u2032]/g, "'")
    .replace(/[\u201C\u201D\u2033]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u00A0/g, " ")
    .replace(/\u200B/g, " ");
}

interface Normalized {
  norm: string;
  // origIdx[i] = index in the *original* string for norm[i]
  origIdx: number[];
}

function normalizeWs(input: string): Normalized {
  const s = preNormalize(input);
  const norm: string[] = [];
  const origIdx: number[] = [];
  let prevSpace = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (/\s/.test(ch)) {
      if (!prevSpace) {
        norm.push(" ");
        origIdx.push(i);
        prevSpace = true;
      }
    } else {
      norm.push(ch);
      origIdx.push(i);
      prevSpace = false;
    }
  }
  return { norm: norm.join(""), origIdx };
}

/**
 * Locate the unique position in `hayNorm` where `findNorm` appears AND is
 * preceded by `ctxBeforeNorm` AND followed by `ctxAfterNorm`. The context
 * check uses direct string-slice equality rather than concatenation so
 * boundary-whitespace collapsing doesn't matter. Returns the normalized
 * [start, end) range of the `find` portion, or a structured error.
 */
function findUniqueAnchor(
  hayNorm: string,
  findNorm: string,
  ctxBeforeNorm: string,
  ctxAfterNorm: string
): { start: number; end: number } | { error: "none" | "ambiguous" } {
  const candidates: number[] = [];

  const checkCtx = (pos: number): boolean => {
    if (ctxBeforeNorm) {
      const start = pos - ctxBeforeNorm.length;
      if (start < 0) return false;
      if (hayNorm.slice(start, pos) !== ctxBeforeNorm) return false;
    }
    if (ctxAfterNorm) {
      const end = pos + findNorm.length;
      if (hayNorm.slice(end, end + ctxAfterNorm.length) !== ctxAfterNorm) return false;
    }
    return true;
  };

  if (findNorm.length === 0) {
    // Pure insertion — scan every position
    for (let i = 0; i <= hayNorm.length; i++) {
      if (checkCtx(i)) candidates.push(i);
    }
  } else {
    let from = 0;
    while (from <= hayNorm.length - findNorm.length) {
      const idx = hayNorm.indexOf(findNorm, from);
      if (idx < 0) break;
      if (checkCtx(idx)) candidates.push(idx);
      from = idx + 1;
    }
  }

  if (candidates.length === 0) return { error: "none" };
  if (candidates.length > 1) return { error: "ambiguous" };
  return {
    start: candidates[0],
    end: candidates[0] + findNorm.length,
  };
}

// ---------------------------------------------------------------------------
// Public document helpers
// ---------------------------------------------------------------------------

/**
 * Extract the body text of a .docx using the same flattening rules as the
 * tracked-changes matcher. Paragraphs are joined by a single newline. The
 * output is what the LLM should base its `find` / `context_before` /
 * `context_after` strings on, since it exactly mirrors the string the
 * anchor matcher operates against.
 */
export async function extractDocxBodyText(bytes: Buffer): Promise<string> {
  const zip = await JSZip.loadAsync(bytes);
  const docXmlFile = getZipEntry(zip, "word/document.xml");
  if (!docXmlFile) return "";
  const docXmlRaw = await docXmlFile.async("string");
  const parser = createParser();
  const tree = parser.parse(docXmlRaw) as XNode[];
  const bodyChildren = findBody(tree);
  if (!bodyChildren) return "";

  return collectParagraphs(bodyChildren)
    .map((paragraph) => paragraph.flat.paraText)
    .join("\n");
}

/**
 * Walk document.xml in render order and collect the w:id for every
 * w:ins / w:del wrapper. The order here matches what docx-preview emits
 * as <ins>/<del> in the DOM, so the frontend can tag each rendered
 * element by index to recover the w:id attribute that docx-preview drops.
 */
export async function extractTrackedChangeIds(
  bytes: Buffer
): Promise<{ kind: "ins" | "del"; w_id: string }[]> {
  const zip = await JSZip.loadAsync(bytes);
  const docXmlFile = getZipEntry(zip, "word/document.xml");
  if (!docXmlFile) return [];
  const docXmlRaw = await docXmlFile.async("string");
  const parser = createParser();
  const tree = parser.parse(docXmlRaw) as XNode[];
  const out: { kind: "ins" | "del"; w_id: string }[] = [];
  const visit = (node: unknown) => {
    const name = elName(node);
    if (!name) return;
    if (name === "w:ins" || name === "w:del") {
      const attrs = elAttrs(node);
      const raw = attrs["@_w:id"];
      if (raw != null) {
        out.push({
          kind: name === "w:ins" ? "ins" : "del",
          w_id: String(raw),
        });
      }
    }
    for (const child of elChildren(node)) visit(child);
  };
  for (const topNode of tree) visit(topNode);
  return out;
}

export async function applyTrackedEdits(
  bytes: Buffer,
  edits: EditInput[],
  opts?: { author?: string }
): Promise<ApplyTrackedEditsResult> {
  const author = opts?.author ?? "gitmatter";
  const now = new Date().toISOString();

  const zip = await JSZip.loadAsync(bytes);
  const docXmlFile = getZipEntry(zip, "word/document.xml");
  if (!docXmlFile) throw new Error("document.xml missing from docx");
  const docXmlRaw = await docXmlFile.async("string");

  const parser = createParser();
  const tree = parser.parse(docXmlRaw) as XNode[];

  const bodyChildren = findBody(tree);
  if (!bodyChildren) throw new Error("w:body missing from document.xml");

  // Anchor against the WHOLE document (paragraphs joined by "\n") so an edit's
  // context_before / context_after may straddle paragraph boundaries — the
  // extracted text the model reads is itself this joined form, so its context
  // routinely spans neighbouring paragraphs (e.g. a heading above the line it
  // edits). We keep a map from each global char back to (paraIdx, offset within
  // that paragraph's text); the "\n" separators map to paraIdx -1 (no paragraph).
  const paragraphs = collectParagraphs(bodyChildren);
  const documentText = createDocumentTextMap(paragraphs);

  let nextWId = maxTrackedId(tree) + 1;
  const plansPerParagraph = new Map<number, PlannedChange[]>();
  const appliedChanges: AppliedChange[] = [];
  const errors: EditError[] = [];

  for (let editIndex = 0; editIndex < edits.length; editIndex++) {
    const edit = edits[editIndex];
    const find = edit.find ?? "";
    const replace = edit.replace ?? "";
    const ctxBefore = edit.context_before ?? "";
    const ctxAfter = edit.context_after ?? "";

    if (!find && !replace) {
      errors.push({ index: editIndex, reason: "Empty edit." });
      continue;
    }
    if (!find && !ctxBefore && !ctxAfter) {
      errors.push({
        index: editIndex,
        reason: "Pure insertion requires context_before or context_after.",
      });
      continue;
    }

    const findNorm = normalizeWs(find).norm;
    const ctxBeforeNorm = normalizeWs(ctxBefore).norm;
    const ctxAfterNorm = normalizeWs(ctxAfter).norm;

    // Strategy:
    //   1) find + full context  (strictest — preferred)
    //   2) find + half context  (drop whichever context side is shorter)
    //   3) find alone           (only if globally unique across the document)
    // Each stage searches the joined document text, so context that lives in a
    // neighbouring paragraph still counts toward making the anchor unique.
    const attempts = [
      { cb: ctxBeforeNorm, ca: ctxAfterNorm },
      { cb: ctxBeforeNorm, ca: "" },
      { cb: "", ca: ctxAfterNorm },
      { cb: "", ca: "" }, // find-only
    ];
    let anchor: { start: number; end: number } | null = null;
    let sawAmbiguous = false;
    for (const { cb, ca } of attempts) {
      const result = findUniqueAnchor(documentText.normalized.norm, findNorm, cb, ca);
      if ("error" in result) {
        if (result.error === "ambiguous") sawAmbiguous = true;
        continue;
      }
      anchor = result;
      break;
    }

    if (!anchor) {
      errors.push({
        index: editIndex,
        reason: sawAmbiguous
          ? `Ambiguous match for find="${truncate(find, 80)}". Add longer context_before / context_after so the anchor is unique.`
          : `Could not locate find="${truncate(find, 80)}" in the document. Re-read the document and copy context verbatim (including punctuation & whitespace).`,
      });
      continue;
    }

    // Map the normalized [start, end) range back to global original offsets.
    const globalStart =
      anchor.start < documentText.normalized.origIdx.length
        ? documentText.normalized.origIdx[anchor.start]
        : documentText.text.length;
    const globalEnd =
      anchor.end === anchor.start
        ? globalStart
        : anchor.end - 1 < documentText.normalized.origIdx.length
          ? documentText.normalized.origIdx[anchor.end - 1] + 1
          : documentText.text.length;

    // Collapse the find→replace diff to its minimal changed sub-span FIRST, using
    // the document's actual text (which preserves its whitespace/quote style) over
    // the model's normalized needle. `find` may straddle a paragraph boundary when
    // the model copies neighbouring-paragraph text into it; that's fine as long as
    // the part that actually CHANGES stays within one paragraph — the shared
    // prefix/suffix (which may include the "\n" separator) is left untouched.
    const originalFind = documentText.text.slice(globalStart, globalEnd);
    const { deleted, inserted, leadingEq } = collapseDiff(originalFind, replace);
    const minGlobalStart = globalStart + leadingEq;
    const minGlobalEnd = minGlobalStart + deleted.length;

    // Resolve which paragraph the minimal edit range lands in. Only the changed
    // span must stay within ONE paragraph; shared context around it may span.
    let paragraphIndex: number;
    let findStart: number;
    if (minGlobalEnd > minGlobalStart) {
      paragraphIndex = documentText.paragraphByOffset[minGlobalStart];
      if (
        paragraphIndex < 0 ||
        documentText.paragraphByOffset[minGlobalEnd - 1] !== paragraphIndex
      ) {
        errors.push({
          index: editIndex,
          reason: `find="${truncate(find, 80)}" changes text across a paragraph boundary; each edit must stay within a single paragraph.`,
        });
        continue;
      }
      findStart = documentText.localOffsetByOffset[minGlobalStart];
    } else {
      // Pure insertion: anchor at the insertion point, falling back to the end
      // of the preceding paragraph when the point sits on a separator.
      if (
        minGlobalStart < documentText.paragraphByOffset.length &&
        documentText.paragraphByOffset[minGlobalStart] >= 0
      ) {
        paragraphIndex = documentText.paragraphByOffset[minGlobalStart];
        findStart = documentText.localOffsetByOffset[minGlobalStart];
      } else if (minGlobalStart > 0 && documentText.paragraphByOffset[minGlobalStart - 1] >= 0) {
        paragraphIndex = documentText.paragraphByOffset[minGlobalStart - 1];
        findStart = documentText.localOffsetByOffset[minGlobalStart - 1] + 1;
      } else {
        errors.push({
          index: editIndex,
          reason: `Could not place insertion for find="${truncate(find, 80)}".`,
        });
        continue;
      }
    }

    const minStart = findStart;
    const minEnd = minStart + deleted.length;

    const changeId = `gitmatter-${editIndex}-${Date.now()}`;
    const plan: PlannedChange = {
      editIndex,
      deleteStart: minStart,
      deleteEnd: minEnd,
      deletedText: deleted,
      insertedText: inserted,
      contextBefore: edit.context_before ?? "",
      contextAfter: edit.context_after ?? "",
      reason: edit.reason,
      changeId,
      delWId: deleted ? String(nextWId++) : undefined,
      insWId: inserted ? String(nextWId++) : undefined,
    };

    // Check for overlap with earlier plans in the same paragraph.
    const existing = plansPerParagraph.get(paragraphIndex) ?? [];
    const overlap = existing.some(
      (existingPlan) =>
        !(plan.deleteEnd <= existingPlan.deleteStart || plan.deleteStart >= existingPlan.deleteEnd)
    );
    if (overlap) {
      errors.push({
        index: editIndex,
        reason: "Overlaps a previous edit in the same paragraph.",
      });
      continue;
    }

    existing.push(plan);
    existing.sort((a, b) => a.deleteStart - b.deleteStart);
    plansPerParagraph.set(paragraphIndex, existing);

    appliedChanges.push({
      id: changeId,
      delId: plan.delWId,
      insId: plan.insWId,
      deletedText: plan.deletedText,
      insertedText: plan.insertedText,
      contextBefore: plan.contextBefore,
      contextAfter: plan.contextAfter,
      reason: plan.reason,
    });
  }

  // Apply plans per paragraph.
  for (const [paragraphIndex, plan] of plansPerParagraph) {
    const paragraph = paragraphs[paragraphIndex];
    const newChildren = reconstructParagraph(
      paragraph.paraChildren,
      paragraph.flat,
      plan,
      now,
      author
    );
    setChildren(paragraph.paraNode, newChildren);
  }

  const builder = createBuilder();
  const rebuiltXml = builder.build(tree);
  const withDecl = ensureXmlDeclaration(rebuiltXml);
  setZipEntry(zip, "word/document.xml", withDecl);

  const outBuf = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return { bytes: outBuf, changes: appliedChanges, errors };
}

// ---------------------------------------------------------------------------
// Resolve a single tracked change (Accept or Reject)
// ---------------------------------------------------------------------------

/**
 * Walk the XML tree and transform matching w:ins/w:del wrappers for the
 * given change id. Returns { found, updatedTree }.
 */
function resolveInTree(
  doc: XNode[],
  changeIds: string[],
  mode: "accept" | "reject"
): { found: boolean } {
  const ids = new Set(changeIds.map((s) => String(s)));
  let touched = false;

  const rewrite = (parentKids: XNode[]): XNode[] => {
    const out: XNode[] = [];
    for (const n of parentKids) {
      const name = elName(n);
      if (!name) {
        out.push(n);
        continue;
      }

      // Recurse first so nested tables/sdts get processed
      const kids = elChildren(n);
      if (kids.length) {
        const newKids = rewrite(kids);
        if (newKids !== kids) setChildren(n, newKids);
      }

      if (name === "w:ins" || name === "w:del") {
        const a = elAttrs(n);
        const wId = String(a["@_w:id"] ?? "");
        if (ids.has(wId)) {
          touched = true;
          if ((name === "w:ins" && mode === "accept") || (name === "w:del" && mode === "reject")) {
            // Keep children, drop wrapper. For w:del rejected, we
            // also need to convert inner w:delText → w:t so the
            // text reverts to normal body content.
            const inner =
              name === "w:del"
                ? (elChildren(n) as XNode[]).map(unwrapDelText)
                : (elChildren(n) as XNode[]);
            for (const c of inner) out.push(c);
            continue;
          } else {
            // accept-del / reject-ins → drop the wrapper and its
            // inner runs entirely.
            continue;
          }
        }
      }

      out.push(n);
    }
    return out;
  };

  for (const top of doc) {
    if (elName(top) !== "w:document") continue;
    const docKids = elChildren(top);
    setChildren(top, rewrite(docKids));
  }

  return { found: touched };
}

function unwrapDelText(n: XNode): XNode {
  const name = elName(n);
  if (!name) return n;
  if (name === "w:r") {
    const kids = elChildren(n).map(unwrapDelText);
    setChildren(n, kids);
    return n;
  }
  if (name === "w:delText") {
    const attrs = elAttrs(n);
    return {
      "w:t": elChildren(n),
      ...(Object.keys(attrs).length ? { [ATTR_KEY]: attrs } : {}),
    };
  }
  return n;
}

export async function resolveTrackedChange(
  bytes: Buffer,
  changeIds: string[],
  mode: "accept" | "reject"
): Promise<{ bytes: Buffer; found: boolean }> {
  const zip = await JSZip.loadAsync(bytes);
  const docXmlFile = getZipEntry(zip, "word/document.xml");
  if (!docXmlFile) throw new Error("document.xml missing from docx");
  const docXmlRaw = await docXmlFile.async("string");

  const parser = createParser();
  const tree = parser.parse(docXmlRaw) as XNode[];

  const { found } = resolveInTree(tree, changeIds, mode);

  const builder = createBuilder();
  const rebuilt = ensureXmlDeclaration(builder.build(tree));
  setZipEntry(zip, "word/document.xml", rebuilt);
  const out = await zip.generateAsync({
    type: "nodebuffer",
    compression: "DEFLATE",
  });
  return { bytes: out, found };
}

// ---------------------------------------------------------------------------
// Utilities
// ---------------------------------------------------------------------------

function truncate(s: string, n: number): string {
  if (!s) return "";
  return s.length > n ? s.slice(0, n) + "…" : s;
}

// Lightweight guards used elsewhere; exported for tests.
export const _internal = {
  flattenParagraph,
  collapseDiff,
  indexAll,
  replaceBody,
};
