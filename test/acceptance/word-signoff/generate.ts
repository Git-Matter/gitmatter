import { createRequire } from "node:module";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { strict as assert } from "node:assert";
import {
  applyTrackedEdits,
  extractDocxBodyText,
  resolveTrackedChange,
} from "../../../packages/core/src/content/docx/trackedChanges.js";
import {
  inspectDocx,
  wordInspectionSafety,
} from "../../../packages/core/src/content/docx/inspection.js";

// Reuse the installed workspace dependency. This script loads no application,
// database, storage, provider, auth or environment configuration.
const requireCore = createRequire(new URL("../../../packages/core/package.json", import.meta.url));
const docx = (await import(
  requireCore.resolve("docx")
)) as typeof import("../../../packages/core/node_modules/docx");
const {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  Header,
  Footer,
  FootnoteReferenceRun,
  EndnoteReferenceRun,
  HeadingLevel,
  LevelFormat,
  WidthType,
  CommentRangeStart,
  CommentRangeEnd,
  CommentReference,
  InsertedTextRun,
  DeletedTextRun,
} = docx;
const root = new URL("./", import.meta.url);
const output = new URL("./fixtures/", root);
await mkdir(output, { recursive: true });
const fixedDate = "2026-10-15T00:00:00.000Z";
const fixture = JSON.parse(
  await readFile(
    new URL("../../../packages/core/test/fixtures/nda/manifest.json", import.meta.url),
    "utf8"
  )
) as {
  paragraphs: string[];
  redlines: Array<{ ruleId: string; find: string; replace: string }>;
};

function sourceDocument(nonBodyRevisions = false, formattingRevision = false) {
  const revision = (id: number) => ({ id, author: "Fictional counterparty", date: fixedDate });
  return new Document({
    title: "Synthetic NDA Word acceptance",
    creator: "gitmatter synthetic acceptance",
    lastModifiedBy: "gitmatter synthetic acceptance",
    description: "Fictional software acceptance file. Not legal advice or a firm-approved policy.",
    styles: {
      paragraphStyles: [
        {
          id: "AcceptanceClause",
          name: "Acceptance Clause",
          basedOn: "Normal",
          next: "AcceptanceClause",
          run: { font: "Calibri", size: 22 },
          paragraph: { spacing: { after: 160 } },
        },
      ],
    },
    numbering: {
      config: [
        {
          reference: "acceptance-clauses",
          levels: [
            {
              level: 0,
              format: LevelFormat.DECIMAL,
              text: "%1.",
              style: { paragraph: { indent: { left: 720, hanging: 360 } } },
            },
          ],
        },
      ],
    },
    comments: {
      children: [
        {
          id: 0,
          author: "Fictional reviewer",
          initials: "FR",
          date: new Date(fixedDate),
          children: [
            new Paragraph({
              children: [
                new TextRun("Synthetic comment: inspect this range and preserve the comment."),
                ...(nonBodyRevisions
                  ? [
                      new InsertedTextRun({
                        ...revision(9006),
                        text: " Fictional comment revision.",
                      }),
                    ]
                  : []),
              ],
            }),
          ],
        },
      ],
    },
    footnotes: {
      1: {
        children: [
          new Paragraph({
            children: nonBodyRevisions
              ? [
                  new DeletedTextRun({ ...revision(9002), text: "Fictional original footnote." }),
                  new InsertedTextRun({ ...revision(9003), text: "Fictional revised footnote." }),
                ]
              : [new TextRun("Fictional footnote for software acceptance only.")],
          }),
        ],
      },
    },
    endnotes: {
      1: {
        children: [
          new Paragraph({
            children: nonBodyRevisions
              ? [new InsertedTextRun({ ...revision(9004), text: "Fictional incoming endnote." })]
              : [new TextRun("Fictional endnote outside the application's review text.")],
          }),
        ],
      },
    },
    sections: [
      {
        headers: {
          default: new Header({
            children: [
              new Paragraph({
                children: [
                  new TextRun("Synthetic header - confidential software fixture"),
                  ...(nonBodyRevisions
                    ? [
                        new InsertedTextRun({
                          ...revision(9001),
                          text: " - incoming header restriction",
                        }),
                      ]
                    : []),
                ],
              }),
            ],
          }),
        },
        footers: {
          default: new Footer({
            children: [
              new Paragraph({
                children: [
                  new TextRun("Synthetic footer - no client data"),
                  ...(nonBodyRevisions
                    ? [new DeletedTextRun({ ...revision(9005), text: " - removed footer note" })]
                    : []),
                ],
              }),
            ],
          }),
        },
        children: [
          new Paragraph({ text: "Synthetic NDA Word acceptance", heading: HeadingLevel.TITLE }),
          new Paragraph(
            "Fictional parties, terms and comments. This is a software fixture, not legal advice."
          ),
          new Paragraph({ text: "1. Agreement and obligations", heading: HeadingLevel.HEADING_1 }),
          ...fixture.paragraphs.map(
            (text, index) =>
              new Paragraph({
                style: "AcceptanceClause",
                numbering: { reference: "acceptance-clauses", level: 0 },
                children: [
                  new TextRun({
                    text,
                    ...(index === 2 ? { bold: true } : {}),
                    ...(formattingRevision && index === 1
                      ? { italics: true, revision: { ...revision(9100), italics: false } }
                      : {}),
                  }),
                ],
              })
          ),
          new Paragraph({
            children: [
              new CommentRangeStart(0),
              new TextRun("Commented synthetic range."),
              new CommentRangeEnd(0),
              new CommentReference(0),
            ],
          }),
          new Paragraph({
            children: [
              new TextRun("Synthetic note references"),
              new FootnoteReferenceRun(1),
              new TextRun(" and endnote"),
              new EndnoteReferenceRun(1),
            ],
          }),
          new Paragraph({ text: "2. Fictional schedule", heading: HeadingLevel.HEADING_2 }),
          new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [
              new TableRow({
                children: ["Item", "Synthetic value"].map(
                  (text) =>
                    new TableCell({
                      children: [new Paragraph({ children: [new TextRun({ text, bold: true })] })],
                    })
                ),
              }),
              new TableRow({
                children: ["Schedule A", "No client information"].map(
                  (text) => new TableCell({ children: [new Paragraph(text)] })
                ),
              }),
            ],
          }),
        ],
      },
    ],
  });
}

const clean = Buffer.from(await Packer.toBuffer(sourceDocument()));
const edits = fixture.redlines.map((edit) => ({
  find: edit.find,
  replace: edit.replace,
  context_before: "",
  context_after: "",
  reason: `Synthetic ${edit.ruleId} acceptance`,
}));
const tracked = await applyTrackedEdits(clean, edits, { author: "Fictional application proposer" });
assert.equal(tracked.errors.length, 0);
assert.equal(tracked.changes.length, 2);
const changeIds = (index: number) =>
  [tracked.changes[index]!.delId, tracked.changes[index]!.insId].filter((id): id is string => !!id);
const partial = (await resolveTrackedChange(tracked.bytes, changeIds(0), "accept")).bytes;
const mixed = (await resolveTrackedChange(partial, changeIds(1), "reject")).bytes;
const accepted = (
  await resolveTrackedChange(tracked.bytes, [...changeIds(0), ...changeIds(1)], "accept")
).bytes;
const incomingBody = (
  await applyTrackedEdits(clean, edits.slice(0, 1), { author: "Fictional counterparty" })
).bytes;
const assets = [
  {
    file: "01-clean-styled-nda.docx",
    bytes: clean,
    expected:
      "Supported revision-free source; styles, numbering, table, comments, header, footer and notes must survive.",
    registered: [],
  },
  {
    file: "02-incoming-body-revisions.docx",
    bytes: incomingBody,
    expected:
      "Two incoming body markers; editing/decisions/clean output blocked after upload. Original download preserved.",
    registered: [],
  },
  {
    file: "03-incoming-nonbody-revisions.docx",
    bytes: Buffer.from(await Packer.toBuffer(sourceDocument(true))),
    expected:
      "Incoming header/footer/footnote/endnote/comment revisions; limited coverage and editing/clean output blocked.",
    registered: [],
  },
  {
    file: "04-incoming-formatting-revision.docx",
    bytes: Buffer.from(await Packer.toBuffer(sourceDocument(false, true))),
    expected: "Tracked italic formatting change; unsupported_revision and clean output blocked.",
    registered: [],
  },
  {
    file: "05-engine-two-pending-proposals.docx",
    bytes: tracked.bytes,
    expected:
      "Four body markers from two engine proposals; native Word must show both tracked replacements. Uploading this standalone file treats them as incoming.",
    registered: tracked.changes,
  },
  {
    file: "06-engine-partial-human-acceptance.docx",
    bytes: partial,
    expected:
      "Term accepted at three years; disclosure replacement still tracked. Uploading the remaining proposal file treats it as incoming.",
    registered: [tracked.changes[1]!],
  },
  {
    file: "07-engine-mixed-decisions-clean.docx",
    bytes: mixed,
    expected:
      "No tracked markers: term accepted at three years; disclosure rejected to its original wording.",
    registered: [],
  },
  {
    file: "08-engine-all-accepted-clean.docx",
    bytes: accepted,
    expected:
      "No tracked markers; both replacements accepted with all unrelated layout/notes/comments retained.",
    registered: [],
  },
];
const records = [];
for (const asset of assets) {
  const inspection = await inspectDocx(asset.bytes);
  assert.equal(inspection.status, "complete", `${asset.file}: incomplete inspection`);
  const rows = asset.registered.map((change) => ({
    delWId: change.delId ?? null,
    insWId: change.insId ?? null,
    deletedText: change.deletedText,
    insertedText: change.insertedText,
  }));
  await writeFile(new URL(asset.file, output), asset.bytes);
  await writeFile(
    new URL(`${asset.file}.body.txt`, output),
    `${await extractDocxBodyText(asset.bytes)}\n`
  );
  const { bodyBindings: _bindings, ...metadata } = inspection;
  records.push({
    file: `fixtures/${asset.file}`,
    sizeBytes: asset.bytes.length,
    sha256: createHash("sha256").update(asset.bytes).digest("hex"),
    expected: asset.expected,
    inspection: metadata,
    safetyAsFreshUpload: wordInspectionSafety(inspection, []),
    ...(rows.length
      ? { engineBindingsOnly: rows, engineBindingSafety: wordInspectionSafety(inspection, rows) }
      : {}),
  });
}
assert.equal(records[0]!.safetyAsFreshUpload.safeClean, true);
assert.equal(records[1]!.safetyAsFreshUpload.incomingRevisions, 2);
assert.equal(records[2]!.safetyAsFreshUpload.safeToEdit, false);
assert.equal(records[3]!.inspection.revisions.formatting, 1);
assert.equal(records[4]!.engineBindingSafety!.safeToEdit, true);
assert.equal(records[5]!.engineBindingSafety!.registeredRevisions, 2);
assert.equal(records[6]!.safetyAsFreshUpload.safeClean, true);
assert.equal(records[7]!.safetyAsFreshUpload.safeClean, true);
const mixedText = await extractDocxBodyText(mixed);
assert(mixedText.includes(fixture.redlines[0]!.replace));
assert(mixedText.includes(fixture.redlines[1]!.find));
await writeFile(
  new URL("manifest.json", root),
  `${JSON.stringify({ schemaVersion: 1, preparedOn: "2026-10-15", notice: "Synthetic terminal-generated assets, not staging provenance, legal approval, provider quality or Microsoft Word evidence. Engine bindings describe pure transformations only; importing a file never creates application audit/approval history.", files: records }, null, 2)}\n`
);
console.log(
  `Prepared ${records.length} synthetic Word acceptance files; pure package/inspection assertions passed. Native Word checks remain not exercised.`
);
