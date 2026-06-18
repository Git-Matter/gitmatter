import { describe, expect, test } from "vite-plus/test";
import { assertFileTypeMatches, sniffFileType } from "../src/content/extract.js";

const pdfBytes = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from("body")]);
const docxBytes = Buffer.concat([Buffer.from([0x50, 0x4b, 0x03, 0x04]), Buffer.from("zip")]);
const docBytes = Buffer.concat([
  Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  Buffer.from("ole"),
]);
const textBytes = Buffer.from("just plain text, definitely not a pdf");

describe("sniffFileType", () => {
  test("detects each accepted format from its magic bytes", () => {
    expect(sniffFileType(pdfBytes)).toBe("pdf");
    expect(sniffFileType(docxBytes)).toBe("docx");
    expect(sniffFileType(docBytes)).toBe("doc");
  });

  test("returns null for unrecognized bytes", () => {
    expect(sniffFileType(textBytes)).toBeNull();
  });
});

describe("assertFileTypeMatches", () => {
  test("accepts bytes that agree with the extension", () => {
    expect(assertFileTypeMatches("brief.pdf", pdfBytes)).toEqual({ ok: true, fileType: "pdf" });
    expect(assertFileTypeMatches("brief.docx", docxBytes)).toEqual({ ok: true, fileType: "docx" });
  });

  test("rejects a text file renamed to .pdf", () => {
    const res = assertFileTypeMatches("evil.pdf", textBytes);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/does not match its \.pdf extension/);
  });

  test("rejects a real pdf renamed to .docx (family mismatch)", () => {
    const res = assertFileTypeMatches("brief.docx", pdfBytes);
    expect(res.ok).toBe(false);
  });

  test("rejects an unsupported extension outright", () => {
    const res = assertFileTypeMatches("notes.txt", textBytes);
    expect(res.ok).toBe(false);
    if (!res.ok) expect(res.reason).toMatch(/only PDF and DOCX\/DOC/);
  });
});
