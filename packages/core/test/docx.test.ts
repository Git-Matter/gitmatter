import { describe, expect, test } from "vite-plus/test";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import {
  applyTrackedEdits,
  extractDocxBodyText,
  extractTrackedChangeIds,
  resolveTrackedChange,
} from "../src/content/docx/trackedChanges.js";

const fixture = (): Buffer =>
  readFileSync(fileURLToPath(new URL("./fixtures/single-paragraph.docx", import.meta.url)));

describe("docx tracked-changes engine", () => {
  test("extractDocxBodyText reads paragraph text", async () => {
    const text = await extractDocxBodyText(fixture());
    expect(text).toContain("Walking on imported air");
  });

  test("applyTrackedEdits inserts a w:ins/w:del pair", async () => {
    const result = await applyTrackedEdits(
      fixture(),
      [{ find: "imported", replace: "global", context_before: "", context_after: "" }],
      { author: "tester" }
    );
    expect(result.errors).toHaveLength(0);
    expect(result.changes).toHaveLength(1);
    const applied = result.changes[0]!;
    expect(applied.deletedText).toBe("imported");
    expect(applied.insertedText).toBe("global");

    const ids = await extractTrackedChangeIds(result.bytes);
    expect(ids.some((i) => i.kind === "ins")).toBe(true);
    expect(ids.some((i) => i.kind === "del")).toBe(true);
  });

  test("accepting a change finalizes the insertion", async () => {
    const proposed = await applyTrackedEdits(
      fixture(),
      [{ find: "imported", replace: "global", context_before: "", context_after: "" }],
      { author: "tester" }
    );
    const applied = proposed.changes[0]!;
    const wIds = [applied.delId, applied.insId].filter((x): x is string => !!x);
    const { bytes, found } = await resolveTrackedChange(proposed.bytes, wIds, "accept");
    expect(found).toBe(true);
    const text = await extractDocxBodyText(bytes);
    expect(text).toContain("global");
    expect(text).not.toContain("imported");
  });

  test("rejecting a change restores the original", async () => {
    const proposed = await applyTrackedEdits(
      fixture(),
      [{ find: "imported", replace: "global", context_before: "", context_after: "" }],
      { author: "tester" }
    );
    const applied = proposed.changes[0]!;
    const wIds = [applied.delId, applied.insId].filter((x): x is string => !!x);
    const { bytes } = await resolveTrackedChange(proposed.bytes, wIds, "reject");
    const text = await extractDocxBodyText(bytes);
    expect(text).toContain("imported");
    expect(text).not.toContain("exported");
  });
});
