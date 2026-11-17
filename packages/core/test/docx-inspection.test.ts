import { describe, expect, test } from "vite-plus/test";
import JSZip from "jszip";
import {
  inspectDocx,
  wordInspectionSafety,
  assertWordInspectionSafe,
} from "../src/content/docx/inspection.js";
import { applyTrackedEdits } from "../src/content/docx/trackedChanges.js";
import { extractMarkdown } from "../src/content/extract.js";
import { readFileSync } from "node:fs";
import { generateDocx } from "../src/content/docx/generate.js";

const ns = 'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"';
async function docx(body: string, extras: Record<string, string> = {}) {
  const zip = new JSZip();
  zip.file("word/document.xml", `<w:document ${ns}><w:body>${body}</w:body></w:document>`);
  for (const [path, xml] of Object.entries(extras)) zip.file(path, xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}
const run = (text: string) => `<w:r><w:t>${text}</w:t></w:r>`;

describe("bounded incoming Word inspection", () => {
  test("clean Word bytes have no revisions and are never rewritten by inspection", async () => {
    const bytes = await docx(`<w:p>${run("A clean source")}</w:p>`);
    const before = Buffer.from(bytes);
    const inspection = await inspectDocx(bytes);
    expect(inspection).toMatchObject({
      status: "complete",
      textView: "accepted_body",
      reasons: [],
      revisions: { insertions: 0, deletions: 0 },
    });
    expect(wordInspectionSafety(inspection, [])).toMatchObject({
      safeClean: true,
      safeToEdit: true,
    });
    expect(bytes.equals(before)).toBe(true);
  });

  test("incoming body insertions/deletions are visible but never inherited as app approvals", async () => {
    const bytes = await docx(
      `<w:p>${run("Start ")}<w:del w:id="1"><w:r><w:delText>old</w:delText></w:r></w:del><w:ins w:id="2" w:author="Do not expose">${run("new")}</w:ins></w:p>`
    );
    const inspection = await inspectDocx(bytes);
    expect(inspection.revisions).toMatchObject({ insertions: 1, deletions: 1 });
    expect(wordInspectionSafety(inspection, [])).toMatchObject({
      incomingRevisions: 2,
      safeToEdit: false,
      safeClean: false,
    });
    expect(JSON.stringify(inspection)).not.toContain("Do not expose");
    expect(JSON.stringify(inspection)).not.toContain('"new"');
    expect((await extractMarkdown(bytes, "docx")).markdown).toBe("Start new");
  });

  test("all Word stories and move/format revisions are inspected", async () => {
    const bytes = await docx(
      `<w:p><w:pPr><w:pPrChange w:id="20"/></w:pPr><w:moveTo w:id="21">${run("Moved")}</w:moveTo></w:p>`,
      {
        "word/header1.xml": `<w:hdr ${ns}><w:p><w:ins w:id="3">${run("Header")}</w:ins></w:p></w:hdr>`,
        "word/footer1.xml": `<w:ftr ${ns}><w:p><w:del w:id="4"/></w:p></w:ftr>`,
        "word/footnotes.xml": `<w:footnotes ${ns}><w:footnote><w:p><w:ins w:id="5"/></w:p></w:footnote></w:footnotes>`,
        "word/endnotes.xml": `<w:endnotes ${ns}><w:endnote><w:p><w:r><w:rPr><w:rPrChange w:id="6"/></w:rPr></w:r></w:p></w:endnote></w:endnotes>`,
        "word/comments.xml": `<w:comments ${ns}><w:comment><w:p><w:ins w:id="7"/></w:p></w:comment></w:comments>`,
      }
    );
    const inspection = await inspectDocx(bytes);
    expect(inspection.stories).toMatchObject({
      body: 1,
      headers: 1,
      footers: 1,
      footnotes: 1,
      endnotes: 1,
      comments: 1,
    });
    expect(inspection.revisions).toMatchObject({
      moves: 1,
      formatting: 2,
      insertions: 3,
      deletions: 1,
    });
    expect(inspection.reasons).toEqual(
      expect.arrayContaining(["non_body_revision", "unsupported_revision"])
    );
    expect(inspection.textView).toBe("limited_body");
    expect(() => assertWordInspectionSafe(inspection, [], true)).toThrow("cannot attest");
  });

  test("registered app body edits remain supported and exact text prevents id-only reuse", async () => {
    const bytes = await docx(`<w:p>${run("Review five years.")}</w:p>`);
    const edited = await applyTrackedEdits(bytes, [
      { find: "five", replace: "three", context_before: "", context_after: "" },
    ]);
    const bindings = edited.changes.map((change) => ({
      delWId: change.delId ?? null,
      insWId: change.insId ?? null,
      deletedText: change.deletedText,
      insertedText: change.insertedText,
    }));
    const inspection = await inspectDocx(edited.bytes);
    expect(wordInspectionSafety(inspection, bindings)).toMatchObject({
      registeredRevisions: 2,
      incomingRevisions: 0,
      safeToEdit: true,
      safeClean: false,
    });
    expect(
      wordInspectionSafety(inspection, [{ ...bindings[0]!, insertedText: "wrong" }]).safeToEdit
    ).toBe(false);
    expect(wordInspectionSafety(await inspectDocx(bytes), bindings).safeToEdit).toBe(false);
  });

  test("duplicate ids and paragraph-mark revisions are not editable", async () => {
    const inspection = await inspectDocx(
      await docx(
        `<w:p><w:pPr><w:rPr><w:del w:id="1"/></w:rPr></w:pPr><w:ins w:id="2">${run("A")}</w:ins><w:ins w:id="2">${run("B")}</w:ins></w:p>`
      )
    );
    expect(inspection.reasons).toEqual(
      expect.arrayContaining(["unsupported_revision", "invalid_revision_binding"])
    );
    expect(wordInspectionSafety(inspection, []).safeClean).toBe(false);
  });

  test("table exception and Office conflict revisions cannot be declared clean", async () => {
    const inspection = await inspectDocx(
      await docx(
        '<w:tblPrEx><w:tblPrExChange w:id="1"/></w:tblPrEx><w:p xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"><w14:conflictIns w:id="2"><w:r><w:t>Conflict</w:t></w:r></w14:conflictIns><w14:customXmlConflictDelRangeStart w:id="3"/></w:p>'
      )
    );
    expect(inspection.revisions).toMatchObject({ formatting: 1, other: 2 });
    expect(inspection.reasons).toContain("unsupported_revision");
    expect(wordInspectionSafety(inspection, [])).toMatchObject({
      safeToEdit: false,
      safeClean: false,
    });
  });

  test("complex body fields are reported as limited rather than silently edited", async () => {
    const inspection = await inspectDocx(
      await docx(
        '<w:p><w:r><w:fldChar w:fldCharType="begin"/></w:r><w:r><w:instrText>DATE</w:instrText></w:r><w:r><w:t>Fixed displayed result</w:t></w:r><w:r><w:fldChar w:fldCharType="end"/></w:r></w:p>'
      )
    );
    expect(inspection.reasons).toContain("limited_body_content");
    expect(inspection.textView).toBe("limited_body");
    expect(wordInspectionSafety(inspection, []).safeToEdit).toBe(false);
  });

  test("revision XML outside the conventional Word directory is still detected", async () => {
    const inspection = await inspectDocx(
      await docx(`<w:p>${run("Body")}</w:p>`, {
        "custom/header.bin": `<w:hdr ${ns}><w:p><w:ins w:id="1">${run("Hidden")}</w:ins></w:p></w:hdr>`,
      })
    );
    expect(inspection.revisions.insertions).toBe(1);
    expect(inspection.reasons).toContain("non_body_revision");
    expect(wordInspectionSafety(inspection, []).safeClean).toBe(false);
  });

  test("alias and strict Word namespaces are detected and fail closed for this editor", async () => {
    const alias = new JSZip();
    alias.file(
      "word/document.xml",
      '<x:document xmlns:x="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><x:body><x:p><x:ins x:id="1"/></x:p></x:body></x:document>'
    );
    const inspection = await inspectDocx(await alias.generateAsync({ type: "nodebuffer" }));
    expect(inspection.revisions.insertions).toBe(1);
    expect(inspection.reasons).toContain("unsupported_namespace");
    expect(wordInspectionSafety(inspection, []).safeToEdit).toBe(false);
  });

  test("unsafe XML, malformed XML and a missing body never become clean evidence", async () => {
    for (const body of [
      '<!DOCTYPE w:document [<!ENTITY bad "leak">]><w:p/>',
      "<w:p>",
      "<w:p><w:r></w:p>",
    ]) {
      const inspection = await inspectDocx(await docx(body));
      expect(inspection.status).toBe("uninspectable");
      expect(wordInspectionSafety(inspection, []).safeClean).toBe(false);
    }
    const zip = new JSZip();
    zip.file("word/settings.xml", `<w:settings ${ns}/>`);
    expect((await inspectDocx(await zip.generateAsync({ type: "nodebuffer" }))).reasons).toContain(
      "missing_body"
    );
  });

  test("archive expansion and XML nesting are bounded", async () => {
    expect((await inspectDocx(Buffer.alloc(32 * 1024 * 1024 + 1))).reasons).toContain(
      "archive_limits"
    );
    const large = await docx(`<w:p>${run("a".repeat(5 * 1024 * 1024))}</w:p>`);
    expect((await inspectDocx(large)).reasons).toContain("archive_limits");
    const deep = await docx("<w:p>".repeat(120) + "</w:p>".repeat(120));
    expect((await inspectDocx(deep)).reasons).toContain("archive_limits");
  });

  test("traversal paths and damaged archive metadata fail closed", async () => {
    const zip = new JSZip();
    zip.file("../word/document.xml", `<w:document ${ns}><w:body/></w:document>`);
    expect((await inspectDocx(await zip.generateAsync({ type: "nodebuffer" }))).reasons).toContain(
      "invalid_archive"
    );
    expect((await inspectDocx(Buffer.from("not a Word file"))).status).toBe("uninspectable");
    const mismatched = await docx(`<w:p>${run("Body")}</w:p>`);
    const central = mismatched.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
    const local = mismatched.readUInt32LE(central + 42);
    mismatched[local + 30] = 0x58;
    expect((await inspectDocx(mismatched)).reasons).toContain("invalid_archive");
  });

  test("the NDA fixture and generated Word paragraphs remain inspectable", async () => {
    for (const bytes of [
      readFileSync(new URL("./fixtures/nda/source.docx", import.meta.url)),
      readFileSync(new URL("./fixtures/single-paragraph.docx", import.meta.url)),
      Buffer.from(
        await generateDocx({
          title: "Synthetic generated source",
          blocks: [{ type: "paragraph", text: "Synthetic paragraph." }],
        })
      ),
    ]) {
      const inspection = await inspectDocx(bytes);
      expect(inspection.status).toBe("complete");
      expect(inspection.reasons).toEqual([]);
      expect(wordInspectionSafety(inspection, []).safeToEdit).toBe(true);
      expect((await extractMarkdown(bytes, "docx")).markdown.length).toBeGreaterThan(0);
    }
  });
});
