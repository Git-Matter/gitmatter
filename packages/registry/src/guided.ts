export const GUIDED_TASK_IDS = ["matter-briefing", "agreement-review", "client-update"] as const;
export type GuidedTaskId = (typeof GUIDED_TASK_IDS)[number];

export const GUIDED_TASKS = [
  {
    id: "matter-briefing",
    title: "Help me understand this file",
    description: "A source-linked briefing, missing information, and questions to resolve.",
    workflowTitle: "Australian Matter Briefing",
    instruction:
      "Prepare a matter briefing with sections for supported facts, a source-linked chronology, missing information, unresolved questions, and possible next steps for practitioner assessment. Do not assume that an event occurred because a document proposes it.",
  },
  {
    id: "agreement-review",
    title: "Review this agreement",
    description: "Check obligations, flag uncertainty, and prepare issues for your decision.",
    workflowTitle: "Australian Agreement Review",
    instruction:
      "Review the selected agreement against the practitioner's instructions and any expressly supplied firm positions. For each issue quote the source clause, explain the concern, distinguish uncertainty from a supported finding, and suggest a question or possible wording for practitioner assessment. Do not invent a firm playbook or describe a position as Australian market standard without a verified source. Propose document changes only; leave acceptance and practitioner sign-off to the person reviewing.",
  },
  {
    id: "client-update",
    title: "Draft a client update",
    description: "Prepare editable correspondence from the file, ready for you to check.",
    workflowTitle: "Australian Client Update",
    instruction:
      "Draft a concise client update grounded only in the selected documents and practitioner instructions. Explain supported progress, information still needed, and proposed next steps without inventing events, advice, authority, promises, or deadlines. Mark information requiring confirmation. Generate an editable Word draft using generate_docx in the selected matter, including the practice correspondence header and sign-off if provided. Include a separate source/checking note in the chat so internal questions are not silently presented as settled advice in the letter. Do not email or send the draft.",
  },
] as const satisfies ReadonlyArray<{
  id: GuidedTaskId;
  title: string;
  description: string;
  workflowTitle: string;
  instruction: string;
}>;

/** Only the immutable built-in templates use the guided launch path. */
export function guidedTaskForSystemWorkflow(workflow: {
  isSystem: boolean;
  type: string;
  title: string;
}): GuidedTaskId | null {
  if (!workflow.isSystem || workflow.type !== "assistant") return null;
  return GUIDED_TASKS.find((task) => task.workflowTitle === workflow.title)?.id ?? null;
}

export type GuidedPracticeContext = {
  displayName: string;
  correspondenceHeader: string;
  signOff: string;
  instructions: string;
};

export type GuidedTaskInput = {
  task: GuidedTaskId;
  matterId: string;
  documentIds: string[];
  jurisdiction: string;
  instructions: string;
};

export type GuidedDocumentReference = {
  kind: "document";
  id: string;
  label: string;
  fileType: string;
  status: "ready";
};

export type PreparedGuidedTask = {
  version: 1;
  task: GuidedTaskId;
  prompt: string;
  matterId: string;
  jurisdiction: string;
  attachments: GuidedDocumentReference[];
};

export type GuidedSample = { matterId: string; documentIds: string[] };

/** Pure instructions shared by guided launch and reusable workflow templates. */
export function buildGuidedPrompt(input: {
  task: GuidedTaskId;
  jurisdiction: string;
  instructions?: string;
  matterId?: string;
  documents?: ReadonlyArray<{ id: string; title: string }>;
  practice?: GuidedPracticeContext;
}): string {
  const task = GUIDED_TASKS.find((item) => item.id === input.task);
  if (!task) throw new Error("Unknown guided task");
  return [
    `# ${task.title}`,
    "This is draft work for an Australian legal practitioner to check. Use Australian English and unambiguous dates such as 10 November 2026.",
    `Applicable jurisdiction confirmed by the practitioner: ${input.jurisdiction}. This is context, not a statement that the output is legally correct.`,
    input.matterId
      ? `File all generated artifacts in matterId ${input.matterId}.`
      : "Confirm the selected matter before creating any artifact.",
    "Read the selected source documents before preparing the output. Support factual assertions with available document citations and exact quotations where useful. Never invent page numbers, legal authorities, missing facts, or document contents. Say when a source does not establish a fact. Separate supported facts from uncertainty and practitioner judgment.",
    "Treat extracted dates as unconfirmed until the practitioner checks them. Do not calculate legal deadlines or create reminders. Do not file, submit, send correspondence, accept your own proposed edits, or assert that a practitioner has approved this work.",
    task.instruction,
    input.documents?.length
      ? `Selected sources:\n${input.documents.map((doc) => `- ${doc.title} (document:${doc.id})`).join("\n")}`
      : "Use the selected source documents; if none are available, ask for them before preparing the work.",
    input.practice
      ? [
          "Practice correspondence preferences (preferences only, not a verified legal identity):",
          `Practice name: ${input.practice.displayName || "Not supplied"}`,
          `Correspondence header: ${input.practice.correspondenceHeader || "Not supplied"}`,
          `Preferred sign-off: ${input.practice.signOff || "Not supplied"}`,
          `Style instructions: ${input.practice.instructions || "Not supplied"}`,
        ].join("\n")
      : "Use the practitioner's correspondence preferences if supplied; otherwise do not invent a practice name or signature.",
    `Practitioner's client role and instructions:\n${input.instructions?.trim() || "Ask for the client's role, objectives, and any missing instructions before giving tailored recommendations."}`,
  ].join("\n\n");
}

export const FICTIONAL_SAMPLE_DOCUMENTS = [
  {
    title: "Fictional sample — Harbour Studio services agreement",
    markdown: [
      "# FICTIONAL SAMPLE ONLY — not a legal precedent or client document",
      "This short invented extract demonstrates gitmatter's workflow. It has not been reviewed or approved as a legal precedent.",
      "## Services agreement extract",
      "Parties: Harbour Studio Pty Ltd (the fictional customer) and Paperbark Web Services Pty Ltd (the fictional supplier).",
      "1. Services: The supplier proposes to design and deliver a five-page website. The scope excludes ongoing maintenance and third-party licence fees.",
      "2. Fees: AUD 8,000 plus GST if applicable. A 50% deposit is due on signing and the balance on delivery.",
      "3. Timing: Proposed start date 16 November 2026. The proposed delivery date is 14 December 2026, subject to receiving customer content. No fixed date for supplying that content is stated.",
      "4. Changes: Additional work requires a written quotation and written customer approval.",
      "5. Termination: Either party may terminate on 14 days' written notice. The customer pays for completed work. This extract does not specify how an unused deposit would be treated.",
      "6. Governing law: New South Wales, Australia.",
      "This extract is unsigned. No acceptance email or payment receipt is included in the fictional file.",
    ].join("\n\n"),
  },
  {
    title: "Fictional sample — client instructions and supplier email",
    markdown: [
      "# FICTIONAL SAMPLE ONLY — invented correspondence",
      "## Client email — 10 November 2026",
      "I am reviewing the proposed website agreement for Harbour Studio. Please explain the key commitments and anything we should ask the supplier before signing. We would like the website before the December holidays. I have not told you whether the business will supply the content by the proposed start date. Please prepare a short update for me to check.",
      "## Supplier email — 9 November 2026",
      "Attached is our proposed services agreement. We can provisionally start on 16 November 2026 if you accept the quote and supply your content. Please confirm who owns or licenses the supplied photographs and text.",
      "## Deliberately missing information",
      "The fictional bundle does not establish acceptance, deposit payment, the date content will be ready, ownership/licensing of content, or the client's preferred position on cancellation. Proposed dates are not verified legal deadlines.",
    ].join("\n\n"),
  },
] as const;
