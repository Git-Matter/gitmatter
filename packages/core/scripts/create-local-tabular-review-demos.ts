import { db } from "@workspace/db/client";
import { user } from "@workspace/db/schema";
import {
  createClient,
  createDocument,
  createMatter,
  createReview,
  writeCell,
} from "../src/index.js";

type Flag = "green" | "yellow" | "red";

type Finding = {
  summary: string;
  flag: Flag;
  reasoning: string;
  quote: string;
};

type Demo = {
  key: string;
  client: string;
  matter: string;
  practiceArea: string;
  review: string;
  documentTitle: (number: number) => string;
  columns: Array<{
    name: string;
    prompt: string;
    finding: (number: number) => Finding;
  }>;
};

const pad = (number: number) => String(number).padStart(3, "0");

const demos: Demo[] = [
  {
    key: "acquisition",
    client: "Northstar Acquisition Co.",
    matter: "Project Atlas — customer contract diligence",
    practiceArea: "Mergers and acquisitions",
    review: "Customer contracts — change of control review",
    documentTitle: (number) => `customer-agreement-${pad(number)}.md`,
    columns: [
      {
        name: "Change of control",
        prompt: "Identify whether a change of control triggers consent or termination rights.",
        finding: (number) => {
          const red = [17, 42, 86].includes(number);
          const yellow = !red && number % 13 === 0;
          return red
            ? {
                summary: "Consent required",
                flag: "red",
                reasoning: "The customer must consent before the proposed acquisition closes.",
                quote: "Supplier may not undergo a change of control without Customer's prior written consent.",
              }
            : yellow
              ? {
                  summary: "Termination right",
                  flag: "yellow",
                  reasoning: "The customer may terminate following a change of control.",
                  quote: "Customer may terminate this Agreement within 30 days after a change of control.",
                }
              : {
                  summary: "Permitted",
                  flag: "green",
                  reasoning: "The agreement permits assignment in connection with a change of control.",
                  quote: "Either party may assign this Agreement in connection with a merger or change of control.",
                };
        },
      },
      {
        name: "Annual contract value",
        prompt: "Extract the annual contract value.",
        finding: (number) => {
          const value = [17, 42, 86].includes(number) ? 1_200_000 + number * 10_000 : 80_000 + number * 4_000;
          return {
            summary: `$${value.toLocaleString("en-US")}`,
            flag: value >= 1_000_000 ? "red" : value >= 400_000 ? "yellow" : "green",
            reasoning: "The annual fees clause states the recurring contract value.",
            quote: `Annual subscription fees are $${value.toLocaleString("en-US")}.`,
          };
        },
      },
      {
        name: "Renewal date",
        prompt: "Extract the next renewal date and flag renewals within 90 days.",
        finding: (number) => ({
          summary: number % 9 === 0 ? "30 September 2026" : "31 March 2027",
          flag: number % 9 === 0 ? "yellow" : "green",
          reasoning: "The renewal clause states the next renewal date.",
          quote: `The next renewal date is ${number % 9 === 0 ? "30 September 2026" : "31 March 2027"}.`,
        }),
      },
    ],
  },
  {
    key: "leases",
    client: "Harbour Retail Group",
    matter: "National store lease portfolio",
    practiceArea: "Real estate",
    review: "Retail leases — obligations and break rights",
    documentTitle: (number) => `retail-lease-${pad(number)}.md`,
    columns: [
      {
        name: "Break right",
        prompt: "Identify the next tenant break right and its notice period.",
        finding: (number) => {
          const red = [12, 55, 78].includes(number);
          return red
            ? {
                summary: "No tenant break",
                flag: "red",
                reasoning: "The lease runs to expiry without an early tenant break right.",
                quote: "The Tenant has no right to terminate this Lease before the Expiry Date.",
              }
            : {
                summary: number % 8 === 0 ? "6 months' notice" : "3 months' notice",
                flag: number % 8 === 0 ? "yellow" : "green",
                reasoning: "The break clause states the required notice period.",
                quote: `The Tenant may break the Lease by giving ${number % 8 === 0 ? "six" : "three"} months' written notice.`,
              };
        },
      },
      {
        name: "Repair obligation",
        prompt: "Classify the tenant's repair obligation.",
        finding: (number) => {
          const red = [12, 55, 78].includes(number);
          return {
            summary: red ? "Full structural repair" : number % 10 === 0 ? "Broad repair" : "Internal only",
            flag: red ? "red" : number % 10 === 0 ? "yellow" : "green",
            reasoning: red
              ? "The tenant is responsible for structural and non-structural repair."
              : "The repair covenant is limited to the demised interior.",
            quote: red
              ? "Tenant shall maintain and repair the structure, roof, foundations and interior of the Premises."
              : "Tenant shall maintain the non-structural interior of the Premises.",
          };
        },
      },
      {
        name: "Rent review",
        prompt: "Identify the next rent review mechanism.",
        finding: (number) => ({
          summary: number % 7 === 0 ? "Open market" : "CPI capped at 4%",
          flag: number % 7 === 0 ? "yellow" : "green",
          reasoning: "The rent review clause specifies the applicable mechanism.",
          quote: number % 7 === 0
            ? "Rent will be reviewed to the open market rental value."
            : "Rent will increase by CPI, capped at four percent per year.",
        }),
      },
    ],
  },
  {
    key: "employment",
    client: "Meridian People Operations",
    matter: "Post-acquisition workforce harmonisation",
    practiceArea: "Employment",
    review: "Employment agreements — restrictive terms review",
    documentTitle: (number) => `employment-agreement-${pad(number)}.md`,
    columns: [
      {
        name: "Notice period",
        prompt: "Extract the employee notice period.",
        finding: (number) => {
          const red = [23, 64, 95].includes(number);
          return {
            summary: red ? "12 months" : number % 12 === 0 ? "6 months" : "3 months",
            flag: red ? "red" : number % 12 === 0 ? "yellow" : "green",
            reasoning: "The termination clause states the contractual notice period.",
            quote: `Either party may terminate employment by giving ${red ? "twelve" : number % 12 === 0 ? "six" : "three"} months' notice.`,
          };
        },
      },
      {
        name: "Non-compete",
        prompt: "Identify the length and scope of any post-termination non-compete.",
        finding: (number) => {
          const red = [23, 64, 95].includes(number);
          return {
            summary: red ? "24 months — global" : number % 9 === 0 ? "12 months" : "6 months",
            flag: red ? "red" : number % 9 === 0 ? "yellow" : "green",
            reasoning: red
              ? "The restriction is unusually long and applies worldwide."
              : "The restriction is limited in time and scope.",
            quote: red
              ? "Employee must not compete with the Company anywhere in the world for 24 months."
              : `Employee must not compete in the Territory for ${number % 9 === 0 ? "twelve" : "six"} months.`,
          };
        },
      },
      {
        name: "Bonus entitlement",
        prompt: "Determine whether the annual bonus is discretionary or contractual.",
        finding: (number) => ({
          summary: number % 11 === 0 ? "Contractual" : "Discretionary",
          flag: number % 11 === 0 ? "yellow" : "green",
          reasoning: "The remuneration clause states whether payment is guaranteed.",
          quote: number % 11 === 0
            ? "Employee is entitled to an annual bonus of 20 percent of base salary."
            : "Any annual bonus is entirely discretionary and is not guaranteed.",
        }),
      },
    ],
  },
];

const [owner] = await db.select().from(user).limit(1);

if (!owner?.tenantId) {
  throw new Error("No local user with a tenant was found");
}

const results: Record<string, string> = {};

for (const demo of demos) {
  const client = await createClient(owner.id, owner.tenantId, { name: demo.client });
  const matter = await createMatter(owner.id, {
    clientId: client.id,
    name: demo.matter,
    practiceArea: demo.practiceArea,
  });

  const documents = [];
  for (let number = 1; number <= 100; number += 1) {
    const findings = demo.columns.map((column) => column.finding(number));
    documents.push(
      await createDocument(owner.id, {
        title: demo.documentTitle(number),
        markdown: `# ${demo.documentTitle(number)}\n\n${findings.map((finding) => finding.quote).join("\n\n")}`,
        fileType: "text/markdown",
        matterId: matter.id,
      }),
    );
  }

  const actor = {
    type: "agent" as const,
    userId: owner.id,
    agentLabel: "Codex tabular review demo",
  };
  const reviewId = await createReview(actor, {
    title: demo.review,
    matterId: matter.id,
    documentIds: documents.map((document) => document.id),
    columnsConfig: demo.columns.map((column, index) => ({
      index,
      name: column.name,
      prompt: column.prompt,
    })),
  });

  for (const [index, document] of documents.entries()) {
    const number = index + 1;
    for (const [columnIndex, column] of demo.columns.entries()) {
      const finding = column.finding(number);
      await writeCell(actor, {
        reviewId,
        documentId: document.id,
        columnIndex,
        summary: finding.summary,
        flag: finding.flag,
        reasoning: finding.reasoning,
        citations: [{ page: 1, quote: finding.quote }],
      });
    }
  }

  results[demo.key] = reviewId;
}

console.log(JSON.stringify(results, null, 2));
