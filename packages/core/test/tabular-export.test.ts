import { describe, expect, test } from "vite-plus/test";
import { gridToCsv, gridToXlsx } from "../src/ai/tabular-export.js";
import { normalizeCell } from "../src/ai/prompts/tabular.js";

describe("gridToCsv", () => {
  test("escapes commas, quotes, and newlines", () => {
    const csv = gridToCsv({
      title: "T",
      headers: ["Document", "Term"],
      rows: [["NDA.pdf", 'Says "mutual", indemnity']],
    });
    expect(csv).toBe('Document,Term\nNDA.pdf,"Says ""mutual"", indemnity"');
  });
});

describe("gridToXlsx", () => {
  test("produces a zip (xlsx) buffer", () => {
    const bytes = Buffer.from(gridToXlsx({ title: "T", headers: ["A"], rows: [["1"]] }));
    expect(bytes.subarray(0, 2).toString("latin1")).toBe("PK");
  });
});

describe("normalizeCell", () => {
  const base = { summary: "", flag: "green" as const, reasoning: "" };

  test("coerces yes_no", () => {
    expect(normalizeCell({ ...base, summary: "Yes, it is" }, "yes_no").summary).toBe("Yes");
    expect(normalizeCell({ ...base, summary: "no." }, "yes_no").summary).toBe("No");
  });

  test("flags a non-yes/no answer for a yes_no column", () => {
    expect(normalizeCell({ ...base, summary: "Maybe" }, "yes_no").flag).toBe("yellow");
  });

  test("flags a currency column with no number", () => {
    expect(normalizeCell({ ...base, summary: "unspecified" }, "currency").flag).toBe("yellow");
    expect(normalizeCell({ ...base, summary: "$5,000" }, "currency").flag).toBe("green");
  });
});
