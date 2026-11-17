import { readFileSync } from "node:fs";
import JSZip from "jszip";
import { describe, expect, test } from "vite-plus/test";
import { inspectDocxRevisions } from "../src/content/docx/inspect.js";

const fixture = () => readFileSync(new URL("./fixtures/single-paragraph.docx", import.meta.url));

describe("Word revision inspection", () => {
  test("accepts a clean Word fixture without modifying its bytes", async () => {
    const bytes = fixture();
    const original = Buffer.from(bytes);
    expect(await inspectDocxRevisions(bytes)).toEqual({ hasRevisions: false });
    expect(bytes.equals(original)).toBe(true);
  });
  test("detects imported body revisions and revisions in headers", async () => {
    const zip = await JSZip.loadAsync(fixture());
    const document = await zip.file("word/document.xml")!.async("string");
    zip.file(
      "word/document.xml",
      document.replace(
        "<w:body>",
        '<w:body><w:ins w:id="88"><w:r><w:t>Incoming change</w:t></w:r></w:ins>'
      )
    );
    expect(await inspectDocxRevisions(await zip.generateAsync({ type: "uint8array" }))).toEqual({
      hasRevisions: true,
    });
    zip.file("word/document.xml", document);
    zip.file(
      "word/header1.xml",
      '<w:hdr xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:p><w:rPrChange w:id="89" /></w:p></w:hdr>'
    );
    expect(await inspectDocxRevisions(await zip.generateAsync({ type: "uint8array" }))).toEqual({
      hasRevisions: true,
    });
  });
  test.each([
    "tblPrExChange",
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
  ])("detects %s revisions without insertion/deletion wrappers", async (marker) => {
    const zip = await JSZip.loadAsync(fixture());
    const xml = await zip.file("word/document.xml")!.async("string");
    const prefix = marker.includes("Conflict") || marker.startsWith("conflict") ? "w14" : "w";
    zip.file(
      "word/document.xml",
      xml.replace(
        "<w:body>",
        `<w:body><${prefix}:${marker} xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" w:id="91" />`
      )
    );
    expect(await inspectDocxRevisions(await zip.generateAsync({ type: "uint8array" }))).toEqual({
      hasRevisions: true,
    });
  });
  test("fails closed for corrupt archives, missing document parts, and malformed XML", async () => {
    await expect(inspectDocxRevisions(new Uint8Array([1, 2, 3]))).rejects.toThrow();
    const empty = new JSZip();
    await expect(
      inspectDocxRevisions(await empty.generateAsync({ type: "uint8array" }))
    ).rejects.toThrow("missing");
    const malformed = await JSZip.loadAsync(fixture());
    malformed.file("word/document.xml", "<w:document><broken></w:document>");
    await expect(
      inspectDocxRevisions(await malformed.generateAsync({ type: "uint8array" }))
    ).rejects.toThrow("verified");
    malformed.file("word/document.xml", "<unrelated />");
    await expect(
      inspectDocxRevisions(await malformed.generateAsync({ type: "uint8array" }))
    ).rejects.toThrow("verified");
  });
});
