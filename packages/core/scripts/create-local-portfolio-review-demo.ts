import { db } from "@workspace/db/client";
import { user } from "@workspace/db/schema";
import {
  createClient,
  createDocument,
  createMatter,
  createReview,
  writeCell,
} from "../src/index.js";

const [owner] = await db.select().from(user).limit(1);

if (!owner?.tenantId) {
  throw new Error("No local user with a tenant was found");
}

const client = await createClient(owner.id, owner.tenantId, {
  name: "Acme Legal Operations",
});
const matter = await createMatter(owner.id, {
  clientId: client.id,
  name: "2026 vendor agreement portfolio review",
  practiceArea: "Commercial contracts",
});

const documents = [];
for (let index = 0; index < 100; index += 1) {
  const number = index + 1;
  const isRed = number === 38 || number === 73 || number === 91;
  const isYellow = !isRed && number % 11 === 0;
  const indemnity = isRed ? "uncapped" : isYellow ? "one times fees" : "two times fees";
  const aiTraining = isRed
    ? "Vendor may use customer data to improve its models."
    : isYellow
      ? "The agreement is silent on AI training."
      : "Vendor may not use customer inputs or outputs to train or improve AI models.";

  documents.push(
    await createDocument(owner.id, {
      title: `vendor-msa-${String(number).padStart(3, "0")}.md`,
      markdown: `# Vendor MSA ${number}\n\nIndemnity liability is capped at ${indemnity}.\n\nGoverning law is ${number % 7 === 0 ? "New York" : "Delaware"}.\n\n${aiTraining}`,
      fileType: "text/markdown",
      matterId: matter.id,
    }),
  );
}

const actor = {
  type: "agent" as const,
  userId: owner.id,
  agentLabel: "Codex portfolio review demo",
};
const reviewId = await createReview(actor, {
  title: "Vendor agreement portfolio review",
  matterId: matter.id,
  documentIds: documents.map((document) => document.id),
  columnsConfig: [
    {
      index: 0,
      name: "Indemnity capped?",
      prompt: "Determine whether indemnity liability is capped at an acceptable level.",
    },
    {
      index: 1,
      name: "Governing law",
      prompt: "Identify the agreement's governing law.",
    },
    {
      index: 2,
      name: "AI training rights",
      prompt: "Determine whether the vendor may train AI models on customer data.",
    },
  ],
});

for (const [index, document] of documents.entries()) {
  const number = index + 1;
  const isRed = number === 38 || number === 73 || number === 91;
  const isYellow = !isRed && number % 11 === 0;

  await writeCell(actor, {
    reviewId,
    documentId: document.id,
    columnIndex: 0,
    summary: isRed ? "No — uncapped" : isYellow ? "Yes — 1× fees" : "Yes — 2× fees",
    flag: isRed ? "red" : isYellow ? "yellow" : "green",
    reasoning: isRed
      ? "The agreement contains no monetary cap."
      : "The agreement contains an express monetary cap.",
    citations: [{ page: 1, quote: `Indemnity liability is capped at ${isRed ? "uncapped" : isYellow ? "one times fees" : "two times fees"}.` }],
  });
  await writeCell(actor, {
    reviewId,
    documentId: document.id,
    columnIndex: 1,
    summary: number % 7 === 0 ? "New York" : "Delaware",
    flag: number % 7 === 0 ? "yellow" : "green",
    reasoning: "The governing-law clause names the applicable state.",
    citations: [
      { page: 1, quote: `Governing law is ${number % 7 === 0 ? "New York" : "Delaware"}.` },
    ],
  });
  await writeCell(actor, {
    reviewId,
    documentId: document.id,
    columnIndex: 2,
    summary: isRed ? "Vendor training permitted" : isYellow ? "Silent — clarify" : "Training prohibited",
    flag: isRed ? "red" : isYellow ? "yellow" : "green",
    reasoning: isRed
      ? "The clause expressly permits model improvement."
      : isYellow
        ? "The agreement does not address AI training."
        : "The clause expressly prohibits AI training.",
    citations: [
      {
        page: 1,
        quote: isRed
          ? "Vendor may use customer data to improve its models."
          : isYellow
            ? "The agreement is silent on AI training."
            : "Vendor may not use customer inputs or outputs to train or improve AI models.",
      },
    ],
  });
}

console.log(reviewId);
