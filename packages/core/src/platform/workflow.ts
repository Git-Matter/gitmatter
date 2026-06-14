import { randomUUID } from "node:crypto";
import { and, asc, count, desc, eq, ilike, inArray, or } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { commits, matters, workflows } from "@workspace/db/schema";
import type { TabularColumn } from "@workspace/db/schema";
import { type Actor, recordCommit } from "../core/commit.js";

type WorkflowInput = {
  title: string;
  type: "assistant" | "tabular";
  promptMd: string;
  columnsConfig?: TabularColumn[];
};

export async function createWorkflow(actor: Actor, input: WorkflowInput & { matterId: string }) {
  const workflowId = randomUUID();
  const [matter] = await db
    .select({ tenantId: matters.tenantId })
    .from(matters)
    .where(eq(matters.id, input.matterId));
  if (!matter) throw new Error("Matter not found");
  await recordCommit({
    artifactType: "workflow",
    artifactId: workflowId,
    actor,
    op: "create",
    message: `Created workflow "${input.title}"`,
    apply: async ({ tx, commitId }) => {
      const fieldCommits: Record<string, string> = {
        "field/title": commitId,
        "field/type": commitId,
        "field/prompt_md": commitId,
        "field/columns_config": commitId,
      };
      await tx.insert(workflows).values({
        id: workflowId,
        userId: actor.userId,
        tenantId: matter.tenantId,
        matterId: input.matterId,
        createdBy: actor.userId,
        title: input.title,
        type: input.type,
        promptMd: input.promptMd,
        columnsConfig: input.columnsConfig ?? null,
        fieldCommits,
      });
      return {
        changes: [
          { path: "field/title", before: null, after: input.title },
          { path: "field/type", before: null, after: input.type },
          { path: "field/prompt_md", before: null, after: input.promptMd },
          { path: "field/columns_config", before: null, after: input.columnsConfig ?? null },
        ],
      };
    },
  });
  return workflowId;
}

export async function updateWorkflow(
  actor: Actor,
  workflowId: string,
  patch: Partial<WorkflowInput>
) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) throw new Error("Workflow not found");

  const fields: Array<{ key: string; col: keyof typeof wf; before: unknown; after: unknown }> = [];
  if (patch.title !== undefined && patch.title !== wf.title)
    fields.push({ key: "field/title", col: "title", before: wf.title, after: patch.title });
  if (patch.type !== undefined && patch.type !== wf.type)
    fields.push({ key: "field/type", col: "type", before: wf.type, after: patch.type });
  if (patch.promptMd !== undefined && patch.promptMd !== wf.promptMd)
    fields.push({
      key: "field/prompt_md",
      col: "promptMd",
      before: wf.promptMd,
      after: patch.promptMd,
    });
  if (patch.columnsConfig !== undefined)
    fields.push({
      key: "field/columns_config",
      col: "columnsConfig",
      before: wf.columnsConfig,
      after: patch.columnsConfig,
    });

  if (!fields.length) return { commit: null, changes: [] };

  return recordCommit({
    artifactType: "workflow",
    artifactId: workflowId,
    actor,
    op: "update",
    message: `Updated ${fields.map((f) => f.key.replace("field/", "")).join(", ")}`,
    apply: async ({ tx, commitId }) => {
      const set: Record<string, unknown> = { updatedAt: new Date() };
      const fieldCommits = { ...wf.fieldCommits };
      for (const f of fields) {
        set[f.col as string] = f.after;
        fieldCommits[f.key] = commitId;
      }
      set.fieldCommits = fieldCommits;
      await tx.update(workflows).set(set).where(eq(workflows.id, workflowId));
      return { changes: fields.map((f) => ({ path: f.key, before: f.before, after: f.after })) };
    },
  });
}

export async function listWorkflows(userId: string) {
  // System workflows + the user's own.
  return db
    .select()
    .from(workflows)
    .where(or(eq(workflows.isSystem, true), eq(workflows.userId, userId)));
}

export type WorkflowListSource = "builtin" | "custom";
export type WorkflowListSort = "title" | "type" | "isSystem" | "createdAt" | "updatedAt";

export type WorkflowListParams = {
  q?: string;
  source?: WorkflowListSource;
  page: number;
  pageSize: number;
  sort?: WorkflowListSort;
  dir?: "asc" | "desc";
};

export async function listWorkflowsPage(userId: string, params: WorkflowListParams) {
  const q = params.q?.trim();
  const access = or(eq(workflows.isSystem, true), eq(workflows.userId, userId));
  const source =
    params.source === "builtin"
      ? eq(workflows.isSystem, true)
      : params.source === "custom"
        ? eq(workflows.isSystem, false)
        : undefined;
  const where = and(access, source, q ? ilike(workflows.title, `%${q}%`) : undefined);
  const sortCols = {
    title: workflows.title,
    type: workflows.type,
    isSystem: workflows.isSystem,
    createdAt: workflows.createdAt,
    updatedAt: workflows.updatedAt,
  };
  const sortCol = sortCols[params.sort ?? "title"];
  const order = params.dir === "asc" ? asc(sortCol) : desc(sortCol);
  const offset = params.page * params.pageSize;

  const [rows, countRows] = await Promise.all([
    db.select().from(workflows).where(where).orderBy(order).limit(params.pageSize).offset(offset),
    db.select({ count: count() }).from(workflows).where(where),
  ]);

  return { rows, rowCount: Number(countRows[0]?.count ?? 0) };
}

export async function getWorkflow(workflowId: string) {
  const [wf] = await db.select().from(workflows).where(eq(workflows.id, workflowId));
  if (!wf) return null;
  const commitIds = [...new Set(Object.values(wf.fieldCommits ?? {}))];
  const blameRows = commitIds.length
    ? await db.select().from(commits).where(inArray(commits.id, commitIds))
    : [];
  const blameById = new Map(blameRows.map((b) => [b.id, b]));
  const blame: Record<string, unknown> = {};
  for (const [field, cid] of Object.entries(wf.fieldCommits ?? {})) {
    blame[field] = blameById.get(cid) ?? null;
  }
  return { workflow: wf, blame };
}

const BUILTINS: WorkflowInput[] = [
  {
    title: "Contract Summary",
    type: "assistant",
    promptMd:
      "Summarize this contract: parties, term, key obligations, termination, governing law, and any unusual or risky clauses.",
  },
  {
    title: "Credit Agreement Summary",
    type: "assistant",
    promptMd: [
      "## Credit Agreement Summary",
      "",
      "Review the uploaded credit agreement and produce a comprehensive legal summary covering the following topics. For each section, identify the key provisions, quote the relevant clause or schedule references, and flag any unusual, onerous, or non-market terms.",
      "",
      "1. **Lenders** — All lenders or members of the lender syndicate, including their full legal name and role (e.g. mandated lead arranger, original lender, agent bank)",
      "2. **Borrowers** — All borrowers, including their full legal name and jurisdiction of incorporation",
      "3. **Guarantors** — All guarantors, including their full legal name and the scope of their guarantee obligation",
      "4. **Other Parties** — Any other material parties (e.g. facility agent, security agent, hedge counterparties, issuing bank) and their roles",
      "5. **Date of Agreement** — Date of the credit agreement",
      "6. **Facilities** — Each facility available (e.g. Revolving Credit Facility, Term Loan A, Term Loan B, Term Loan C), the facility type, tranche name, and any key structural features",
      "7. **Amount** — Total committed amount across all facilities, the currency, and breakdown by tranche if applicable",
      "8. **Purpose** — Stated purpose for which borrowings may be used and any restrictions on use of proceeds",
      "9. **Interest** — Applicable reference rate (e.g. SOFR, EURIBOR, base rate), the margin, any margin ratchet mechanism, and how interest periods are structured",
      "10. **Commitment Fee** — Commitment or utilisation fees, the applicable rate, how they are calculated, and the basis (e.g. undrawn commitment, average utilisation)",
      "11. **Repayment Schedule** — Repayment profile for each facility, whether by scheduled instalments or bullet repayment, and the repayment dates and amounts",
      "12. **Maturity** — Final maturity date for each facility",
      "13. **Security** — Each class of security granted or required (e.g. share pledges, fixed and floating charges, real estate mortgages, account pledges) and the assets or entities over which security is taken",
      "14. **Guarantees** — Guarantee obligations, the guarantors, the scope of the guarantee, and any limitations (e.g. up-stream guarantee limitations, guarantor coverage test)",
      "15. **Financial Covenants** — Each financial covenant, the metric (e.g. leverage ratio, interest cover, cashflow cover), the applicable test, testing frequency, and any equity cure rights",
      "16. **Events of Default** — Each event of default, noting any grace periods, materiality thresholds, or cross-default provisions",
      "17. **Assignment** — Restrictions or permissions on assignment or transfer (e.g. white/blacklists, borrower consent for lender transfers; restrictions on borrower assignment)",
      "18. **Change of Control** — What constitutes a change of control, what obligations it triggers (e.g. mandatory prepayment, cancellation, lender consent), and any cure period",
      "19. **Prepayment Fee** — Any prepayment fees, make-whole premiums, or soft-call protections, the applicable fee, the period during which it applies, and any exceptions (e.g. prepayment from insurance proceeds or asset disposals)",
      "20. **Governing Law** — Governing law of the agreement",
      "21. **Dispute Resolution** — Whether disputes go to litigation or arbitration, the chosen forum or seat, and any submission to jurisdiction provisions",
      "",
      "Deliver the summary inline in your chat response — do NOT call generate_docx. Only produce a downloadable Word document if the user explicitly asks for one.",
    ].join("\n"),
  },
  {
    title: "Shareholder Agreement Summary",
    type: "assistant",
    promptMd: [
      "## Shareholder Agreement Summary",
      "",
      "Review the uploaded shareholder agreement and produce a comprehensive legal summary covering the following topics. For each section, identify the key provisions, quote the relevant clause references, and flag any unusual, onerous, or market-standard deviations.",
      "",
      "1. **Parties & Shareholdings** — Full legal names, roles, share classes held, and percentage interests (on a fully diluted basis if stated)",
      "2. **Share Classes & Rights** — For each class: voting rights, dividend rights, liquidation preference, conversion or redemption features",
      "3. **Board Composition & Governance** — Board size, director appointment rights (and the shareholding thresholds required to maintain them), quorum, and casting vote",
      "4. **Reserved Matters** — Decisions requiring a special majority, unanimity, or a specific shareholder's consent; note the threshold and whose consent is required for each",
      "5. **Pre-emption on New Shares** — Who holds pre-emption rights, procedure, timeline, and any carve-outs (e.g. employee option schemes)",
      "6. **Transfer Restrictions** — Lock-up periods, prohibited transfers, permitted transfers (e.g. to affiliates), and any board or shareholder approval requirements",
      "7. **Right of First Refusal / Pre-emption on Transfer** — Trigger, procedure, pricing mechanics, and any exceptions",
      "8. **Drag-Along Rights** — Who holds the right, threshold to trigger, conditions (e.g. minimum price, independent valuation), and minority protections",
      "9. **Tag-Along Rights** — Who holds the right, triggering threshold, exercise procedure, and price terms",
      "10. **Anti-Dilution Protections** — Type (full ratchet, weighted average), trigger events, calculation mechanics, and exceptions",
      "11. **Dividend Policy** — Any obligation or target to pay dividends, preferential dividend rights, and restrictions on distributions",
      "12. **Exit & Liquidity** — Agreed exit routes (trade sale, IPO, drag sale), timelines, and liquidation preferences on exit",
      "13. **Deadlock** — Deadlock definition, escalation and resolution mechanisms (e.g. Russian roulette, put/call options), and consequences if unresolved",
      "14. **Non-Compete & Non-Solicitation** — Who is bound, scope of activities and geography, duration, and carve-outs",
      "15. **Governing Law & Dispute Resolution** — Applicable law, forum, arbitration or litigation, and any mandatory escalation steps",
      "",
      "Produce the summary as a downloadable Word document with the generate_docx tool: one heading block per topic above followed by paragraph blocks for its content. Provide the download link; do not also paste the full summary inline.",
    ].join("\n"),
  },
  {
    title: "Generate CP Checklist",
    type: "assistant",
    promptMd: [
      "## Generate Conditions Precedent Checklist",
      "",
      "Review the uploaded credit agreement or financing document and generate a comprehensive Conditions Precedent (CP) checklist.",
      "",
      "You MUST use the generate_docx tool to produce the checklist as a downloadable Word document. Do not display the checklist inline — generate the .docx file and provide the download link.",
      "",
      "Structure the document as follows:",
      "- For each category of conditions (e.g. Corporate, Financial, Legal, Security), add a heading block with the category name.",
      "- Under each category heading, add one table block whose first row is the header row with exactly these four columns in this order: Index, Clause Number, Clause, Status.",
      "  1. Index — sequential number within the category (1, 2, 3…)",
      "  2. Clause Number — the clause or schedule reference from the agreement",
      "  3. Clause — a concise description of the condition precedent",
      "  4. Status — leave blank (empty string) for the user to fill in",
      "",
      "Before finalizing, double-check every table: each must have exactly the four columns above in the same order, the header row must match exactly (Index, Clause Number, Clause, Status), every row must have four cells, the Index column must be sequential starting from 1 within each category, and no cell should contain stray markdown, newlines, or placeholder text (use an empty string for Status).",
    ].join("\n"),
  },
  {
    title: "NDA Review",
    type: "tabular",
    promptMd: "Extract key NDA terms across documents.",
    columnsConfig: [
      { index: 0, name: "Term", prompt: "What is the term/duration?" },
      { index: 1, name: "Governing Law", prompt: "What is the governing law?" },
      { index: 2, name: "Mutual?", prompt: "Is the NDA mutual or one-way?", format: "yes_no" },
    ],
  },
  {
    title: "Liability & Indemnity",
    type: "tabular",
    promptMd: "Extract liability and indemnity terms.",
    columnsConfig: [
      { index: 0, name: "Liability Cap", prompt: "What is the limitation of liability / cap?" },
      { index: 1, name: "Indemnity", prompt: "Summarize the indemnification obligations." },
    ],
  },
];

/** Idempotently seed the system workflow templates. */
export async function seedBuiltinWorkflows() {
  for (const b of BUILTINS) {
    const existing = await db.select().from(workflows).where(eq(workflows.title, b.title));
    if (existing.some((w) => w.isSystem)) continue;
    await db.insert(workflows).values({
      title: b.title,
      type: b.type,
      promptMd: b.promptMd,
      columnsConfig: b.columnsConfig ?? null,
      isSystem: true,
    });
  }
}
