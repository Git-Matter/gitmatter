import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import { fileURLToPath } from "node:url";
import { inspectDocx } from "../../../packages/core/src/content/docx/inspection.js";
import { extractDocxBodyText } from "../../../packages/core/src/content/docx/trackedChanges.js";

const requireCore = createRequire(new URL("../../../packages/core/package.json", import.meta.url));
const { default: JSZip } = (await import(requireCore.resolve("jszip"))) as {
  default: typeof import("../../../packages/core/node_modules/jszip");
};
const root = new URL("./", import.meta.url);
const manifest = JSON.parse(await readFile(new URL("manifest.json", root), "utf8")) as {
  files: Array<{ file: string; sha256: string }>;
};
const hash = (bytes: Buffer | string) => createHash("sha256").update(bytes).digest("hex");

if (process.argv.length > 2) {
  // Optional native-Word Save-As comparison. Both files must be explicitly chosen
  // synthetic documents. Never inspect account, credential or client files here.
  const [nativePath, expectedPath] = process.argv.slice(2);
  if (
    !nativePath ||
    !expectedPath ||
    !nativePath.toLowerCase().endsWith(".docx") ||
    !expectedPath.toLowerCase().endsWith(".docx")
  )
    throw new Error("Usage: verify.ts <synthetic-Word-saved.docx> <expected-synthetic.docx>");
  const bytes = await readFile(nativePath),
    expected = await readFile(expectedPath);
  const inspection = await inspectDocx(bytes);
  const expectedInspection = await inspectDocx(expected);
  const comparable =
    inspection.status === "complete" &&
    expectedInspection.status === "complete" &&
    !inspection.reasons.includes("unsupported_namespace") &&
    !expectedInspection.reasons.includes("unsupported_namespace");
  const body = comparable ? await extractDocxBodyText(bytes) : null;
  const expectedBody = comparable ? await extractDocxBodyText(expected) : null;
  console.log(
    JSON.stringify(
      {
        nativePath,
        expectedPath,
        sizeBytes: bytes.length,
        sha256: hash(bytes),
        expectedSha256: hash(expected),
        inspection: {
          status: inspection.status,
          reasons: inspection.reasons,
          revisions: inspection.revisions,
          stories: inspection.stories,
          textView: inspection.textView,
        },
        bodyTextMatchesExpected: body === null ? null : body === expectedBody,
        bodyTextMatchesAfterTrimmingTrailingWhitespace:
          body === null || expectedBody === null ? null : body.trimEnd() === expectedBody.trimEnd(),
        bodyTextMatchesAfterNormalizingWhitespace:
          body === null || expectedBody === null
            ? null
            : body.replace(/\s+/g, " ").trim() === expectedBody.replace(/\s+/g, " ").trim(),
        bodyCharacterCounts:
          body === null || expectedBody === null
            ? null
            : { actual: body.length, expected: expectedBody.length },
        trailingWhitespaceCharacterCounts:
          body === null || expectedBody === null
            ? null
            : {
                actual: body.length - body.trimEnd().length,
                expected: expectedBody.length - expectedBody.trimEnd().length,
              },
        bodyTextSha256: body === null ? null : hash(body),
        notice:
          "Terminal package comparison only. This does not establish a native Word open, visual inspection, legal approval, or staging history.",
      },
      null,
      2
    )
  );
} else {
  const source = await JSZip.loadAsync(await readFile(new URL(manifest.files[0]!.file, root)));
  const unchanged = Object.keys(source.files)
    .filter((path) => !source.files[path]!.dir && path !== "word/document.xml")
    .sort();
  for (const file of manifest.files) {
    const bytes = await readFile(new URL(file.file, root));
    assert.equal(hash(bytes), file.sha256, `Published fixture hash changed: ${file.file}`);
    assert.equal((await inspectDocx(bytes)).status, "complete");
    const expectedBody = await readFile(new URL(`${file.file}.body.txt`, root), "utf8");
    assert.equal(
      `${await extractDocxBodyText(bytes)}\n`,
      expectedBody,
      `Body-view drift: ${file.file}`
    );
    if (/\/0[5-8]-/.test(file.file)) {
      const output = await JSZip.loadAsync(bytes);
      for (const path of unchanged)
        assert(
          (await source.file(path)!.async("nodebuffer")).equals(
            await output.file(path)!.async("nodebuffer")
          ),
          `${file.file}: unrelated package part changed: ${path}`
        );
    }
  }
  console.log(
    `Verified ${manifest.files.length} fixture hashes, complete package inspection and exact body views; all ${unchanged.length} unrelated parts remain byte-identical in each engine output. Native Word checks remain separate. Pack: ${fileURLToPath(root)}`
  );
}
