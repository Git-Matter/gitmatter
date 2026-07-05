import { describe, expect, test } from "vite-plus/test";
import { summarizeToolInput, summarizeToolOutput } from "../src/tools/catalog.js";

describe("tool log summaries", () => {
  test("summarizes proposed edits without logging edit text", () => {
    const summary = summarizeToolInput("propose_document_edit", {
      documentId: "doc-1",
      edits: [
        {
          find: "commercially sensitive clause",
          replace: "narrowed clause",
          contextBefore: "before",
          contextAfter: "after",
        },
      ],
    });

    expect(summary).toEqual({ documentId: "doc-1", editCount: 1 });
    expect(JSON.stringify(summary)).not.toContain("commercially sensitive clause");
    expect(JSON.stringify(summary)).not.toContain("narrowed clause");
  });

  test("summarizes redline output with counts only", () => {
    const summary = summarizeToolOutput("propose_document_edit", {
      changeIds: ["c1", "c2"],
      requested: 3,
      applied: 2,
      failed: 1,
      errors: [{ index: 2, reason: "Could not locate find text." }],
    });

    expect(summary).toEqual({
      changeCount: 2,
      requested: 3,
      applied: 2,
      failed: 1,
      errorCount: 1,
    });
  });

  test("summarizes document generation and review tools with counts", () => {
    expect(
      summarizeToolInput("generate_docx", {
        title: "Sensitive title",
        blocks: [{ type: "paragraph", text: "secret" }],
      })
    ).toEqual({ blockCount: 1, matterProvided: false });

    expect(
      summarizeToolInput("create_review", {
        title: "Review",
        documentIds: ["d1", "d2"],
        columns: [{ name: "Risk", prompt: "Find risk" }],
        matterId: "m1",
      })
    ).toEqual({ documentCount: 2, columnCount: 1, matterProvided: true });
  });
});
