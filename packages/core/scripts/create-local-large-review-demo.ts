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

const client = await createClient(owner.id, owner.tenantId, { name: "Northstar Systems" });
const matter = await createMatter(owner.id, {
  clientId: client.id,
  name: "Northstar AI vendor agreement — 500-page review",
  practiceArea: "Commercial contracts",
});

const pages = Array.from({ length: 500 }, (_, index) => {
  const page = index + 1;
  const body =
    page === 417
      ? "Vendor may not use inputs provided by or on behalf of Customer, or outputs generated from those inputs, to train or otherwise improve artificial intelligence or the Services."
      : "Standard commercial terms, schedules, service descriptions, and operational provisions continue on this page.";
  return `## Page ${page}\n\n${body}`;
}).join("\n\n---\n\n");

const document = await createDocument(owner.id, {
  title: "Northstar-500-page-AI-vendor-agreement-DEMO.md",
  markdown: `# Northstar AI vendor agreement\n\nSynthetic 500-page demonstration agreement.\n\n${pages}`,
  fileType: "text/markdown",
  matterId: matter.id,
});

const actor = { type: "agent" as const, userId: owner.id, agentLabel: "Codex legal review demo" };
const reviewId = await createReview(actor, {
  title: "AI training and data-use rights",
  matterId: matter.id,
  documentIds: [document.id],
  columnsConfig: [
    {
      index: 0,
      name: "AI training rights",
      prompt: "Determine whether the vendor may train on customer inputs or outputs.",
    },
    {
      index: 1,
      name: "Covered data",
      prompt: "Identify the data protected by the AI training restriction.",
    },
    {
      index: 2,
      name: "Recommended action",
      prompt: "Recommend whether counsel should accept, clarify, or redline the restriction.",
    },
  ],
});

const quote =
  "Vendor may not use inputs provided by or on behalf of Customer, or outputs generated from those inputs, to train or otherwise improve artificial intelligence or the Services.";
const findings = [
  ["No. Customer inputs and outputs cannot be used for AI training.", "green", "The clause is an express prohibition."],
  ["Both customer inputs and generated outputs are protected.", "green", "The clause names both data categories."],
  ["Accept, but clarify survival after termination.", "yellow", "The restriction is strong but has no express survival period."],
] as const;

for (const [columnIndex, [summary, flag, reasoning]] of findings.entries()) {
  await writeCell(actor, {
    reviewId,
    documentId: document.id,
    columnIndex,
    summary,
    flag,
    reasoning,
    citations: [{ page: 417, quote }],
  });
}

console.log(reviewId);
