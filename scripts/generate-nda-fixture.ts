import { readFile, writeFile } from "node:fs/promises";
import { buildDocxSpec, generateDocx } from "../packages/core/src/content/docx/generate.js";
import { extractDocxBodyText } from "../packages/core/src/content/docx/trackedChanges.js";
const root = new URL("../packages/core/test/fixtures/nda/", import.meta.url);
const fixture = JSON.parse(await readFile(new URL("manifest.json", root), "utf8")) as { title: string; paragraphs: string[] };
const generated = Buffer.from(await generateDocx(buildDocxSpec(fixture.title, fixture.paragraphs.map(text => ({ type: "paragraph", text })))));
const target = new URL("source.docx", root);
const markdown = `# ${fixture.title}\n\n${fixture.paragraphs.join("\n\n")}\n`;
if (process.argv.includes("--check")) {
  const stored = await readFile(target);
  if (await readFile(new URL("source.md", root), "utf8") !== markdown) throw new Error("NDA Markdown drift: run vp run fixtures:nda");
  if (await extractDocxBodyText(stored) !== await extractDocxBodyText(generated)) throw new Error("NDA source drift: run vp run fixtures:nda");
  console.log("NDA fixture source is current");
} else { await writeFile(target, generated); await writeFile(new URL("source.md", root), markdown); console.log("Generated synthetic NDA source"); }
