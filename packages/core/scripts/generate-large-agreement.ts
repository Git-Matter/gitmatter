import { Document, HeadingLevel, Packer, PageBreak, Paragraph, TextRun } from "docx";
import { mkdir, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const outputPath = resolve(
  import.meta.dir,
  "../../../apps/video/demo-assets/large-agreement/Northstar-500-page-AI-vendor-agreement-DEMO.docx",
);

const aiTrainingClause =
  "Vendor may not use inputs provided by or on behalf of Customer, or outputs generated from those inputs, to train or otherwise improve artificial intelligence or the Services.";

const sections = [
  "Definitions and interpretation",
  "Services and service levels",
  "Fees, invoicing, and taxes",
  "Customer data and security",
  "Confidentiality",
  "Intellectual property",
  "Compliance and audit",
  "Liability and indemnities",
  "Termination and transition",
  "Schedules and exhibits",
] as const;

const children: Paragraph[] = [];

for (let page = 1; page <= 500; page += 1) {
  if (page > 1) children.push(new Paragraph({ children: [new PageBreak()] }));

  const section = sections[(page - 1) % sections.length];
  children.push(
    new Paragraph({
      heading: HeadingLevel.HEADING_1,
      children: [new TextRun(`Northstar AI Vendor Agreement — DEMO — Page ${page} of 500`)],
    }),
    new Paragraph({
      children: [
        new TextRun({ text: `${section}. `, bold: true }),
        new TextRun(
          "This page is part of a synthetic demonstration agreement pack created solely to show large-document review in GitMatter. It is not a signed agreement and contains no confidential information.",
        ),
      ],
    }),
  );

  if (page === 417) {
    children.push(
      new Paragraph({
        heading: HeadingLevel.HEADING_2,
        children: [new TextRun("Section 12.8 — AI training and model improvement")],
      }),
      new Paragraph({
        children: [new TextRun({ text: aiTrainingClause, bold: true })],
      }),
      new Paragraph({
        children: [
          new TextRun(
            "Tutorial issue: confirm the restriction covers prompts, attachments, derived data, embeddings, outputs, fine-tuning, evaluation, and retention after termination.",
          ),
        ],
      }),
    );
  } else {
    children.push(
      new Paragraph(
        "The parties will maintain appropriate records, approvals, controls, and evidence for obligations described in this section. Any amendment must follow the agreement's authorized change process.",
      ),
    );
  }
}

const document = new Document({ sections: [{ children }] });
await mkdir(dirname(outputPath), { recursive: true });
await writeFile(outputPath, await Packer.toBuffer(document));
console.log(outputPath);
