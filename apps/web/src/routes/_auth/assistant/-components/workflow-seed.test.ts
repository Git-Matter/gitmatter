import { describe, expect, test } from "vite-plus/test";
import { parseWorkflowChatSeed } from "./workflow-seed";

describe("workflow launch seed", () => {
  test("preserves existing legacy workflow launches and document state", () => {
    const attachment = { kind: "document", id: "source", label: "Source", status: "ready" };
    expect(
      parseWorkflowChatSeed({ steps: ["Read the file", "Draft a note"], attachments: [attachment] })
    ).toEqual({ steps: ["Read the file", "Draft a note"], attachments: [attachment] });
    expect(parseWorkflowChatSeed({ version: 1, steps: ["Read"] })).toEqual({
      steps: ["Read"],
      attachments: [],
    });
  });
  test("rejects malformed steps, source references, and unknown versions without auto-send", () => {
    for (const seed of [
      null,
      [],
      { steps: "Read" },
      { steps: [123] },
      { steps: [""] },
      { version: 2, steps: ["Read"] },
      { steps: ["Read"], attachments: [{ kind: "document", id: "source" }] },
    ]) {
      expect(parseWorkflowChatSeed(seed)).toBeNull();
    }
  });
});
