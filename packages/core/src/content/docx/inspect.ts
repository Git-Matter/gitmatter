import JSZip from "jszip";
import { XMLValidator } from "fast-xml-parser";
import { createParser, elAttrs, elChildren, elName, type XNode } from "./xml.js";
import { getZipEntry } from "./zip.js";

const REVISIONS = new Set([
  "ins",
  "del",
  "moveFrom",
  "moveTo",
  "cellIns",
  "cellDel",
  "cellMerge",
  "numberingChange",
  "rPrChange",
  "pPrChange",
  "sectPrChange",
  "tblPrChange",
  "tblPrExChange",
  "tblGridChange",
  "trPrChange",
  "tcPrChange",
  "moveFromRangeStart",
  "moveFromRangeEnd",
  "moveToRangeStart",
  "moveToRangeEnd",
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

/** Conservative inspection only. Never accepts, removes, or rewrites revisions. */
export async function inspectDocxRevisions(bytes: Uint8Array): Promise<{ hasRevisions: boolean }> {
  const archive = await JSZip.loadAsync(bytes);
  if (!getZipEntry(archive, "word/document.xml")) throw new Error("Word document part is missing");
  let hasRevisions = false;
  for (const entry of Object.values(archive.files)) {
    if (entry.dir || !/^word[\\/].*\.xml$/i.test(entry.name)) continue;
    const xml = await entry.async("string");
    if (XMLValidator.validate(xml) !== true) throw new Error("Word XML cannot be verified");
    // Reject DTD/entity definitions rather than resolving untrusted declarations.
    if (/<!DOCTYPE|<!ENTITY/i.test(xml))
      throw new Error("Word XML declarations cannot be verified");
    const stack = createParser().parse(xml) as XNode[];
    if (entry.name.replaceAll("\\", "/") === "word/document.xml") {
      const document = stack.find((node) => elName(node)?.split(":").pop() === "document");
      const name = document && elName(document);
      const prefix = name?.includes(":") ? name.split(":")[0] : null;
      const namespace = document && elAttrs(document)[prefix ? `@_xmlns:${prefix}` : "@_xmlns"];
      const knownNamespace =
        namespace === "http://schemas.openxmlformats.org/wordprocessingml/2006/main" ||
        namespace === "http://purl.oclc.org/ooxml/wordprocessingml/main";
      if (
        !document ||
        !knownNamespace ||
        !elChildren(document).some((node) => elName(node)?.split(":").pop() === "body")
      )
        throw new Error("Word document structure cannot be verified");
    }
    while (stack.length) {
      const node = stack.pop()!;
      const localName = elName(node)?.split(":").pop();
      if (localName && REVISIONS.has(localName)) hasRevisions = true;
      stack.push(...elChildren(node));
    }
  }
  return { hasRevisions };
}
