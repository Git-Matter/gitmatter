// Single source of truth for the marketing catalog: platform features and
// solutions (use cases). Drives the /platform and /solutions index pages,
// their $slug child pages, and the header dropdown menus (nav.ts).
// House rule: every line here must describe something the product actually
// does — no invented metrics, testimonials, or certifications.

export function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

export type FeatureSection = {
  title: string;
  lead: string;
  points: { name: string; desc: string }[];
};

export type Feature = {
  slug: string;
  tag: string;
  title: string;
  body: string;
  /** One-liner for the header menu. */
  menuDesc: string;
  clip: string;
  /** Hero paragraph on the feature's own page. */
  intro: string;
  /** Capability sections on the feature's own page. */
  sections: FeatureSection[];
  /** "How teams use it" — concrete, truthful scenarios. */
  uses: string[];
};

export type Solution = {
  slug: string;
  tag: string;
  title: string;
  body: string;
  who: string;
  /** One-liner for the header menu. */
  menuDesc: string;
};

const feature = (f: Omit<Feature, "slug">): Feature => ({
  ...f,
  slug: slugify(f.tag),
});
const solution = (s: Omit<Solution, "slug">): Solution => ({
  ...s,
  slug: slugify(s.tag),
});

export const FEATURES: Feature[] = [
  feature({
    tag: "Legal research",
    title: "Research the law and Australian IP without leaving the matter.",
    body: "Search US case law and Australian patents and trade marks in the assistant or through your connected MCP agent. In Australia, queries, IP Australia sources, and tool activity stay visible in the assistant session.",
    menuDesc: "US case law and Australian IP search, in the assistant.",
    clip: "/features/legal-research.mp4",
    intro:
      "Jurisdiction-aware research tools bring US case law and IP Australia patent and trade-mark search into the same assistant session as the matter work.",
    sections: [
      {
        title: "Research for the selected jurisdiction",
        lead: "The assistant and connected MCP agents receive the research tools available for the selected jurisdiction.",
        points: [
          {
            name: "US case law",
            desc: "Search US case law opinions and verify reporter citations through CourtListener.",
          },
          {
            name: "Australian IP",
            desc: "Search Australian trade marks and patents, use advanced trade-mark queries, and open individual records through IP Australia.",
          },
          {
            name: "In the work session",
            desc: "Research is read-only. The query, sources, and tool activity remain visible in the assistant session alongside the resulting answer.",
          },
        ],
      },
    ],
    uses: [
      "Check Australian trade marks before proposing a new brand",
      "Search Australian patent records for a technology or application number",
      "Find US case law relevant to a disputed contract term",
      "Give a connected AI agent jurisdiction-appropriate research tools over MCP",
    ],
  }),
  feature({
    tag: "Matter workspace",
    title: "Every document for the matter, in one working space.",
    body: "Upload and organize agreements, correspondence, and supporting files. Read them, compare versions, share access with the matter team, and use the same source material across chat, review, redlining, and drafting.",
    menuDesc: "Organize the matter's documents and work from one source.",
    clip: "/features/overview.mp4",
    intro:
      "A shared workspace for the documents, conversations, reviews, and generated work that belong to a matter — with access and history kept alongside the work.",
    sections: [
      {
        title: "The complete matter in one place",
        lead: "Keep the source documents and the work produced from them together, instead of spreading the record across folders, chats, and separate review tools.",
        points: [
          {
            name: "Documents and folders",
            desc: "Upload PDF and Word files, organize them in folders, and open them beside the assistant without leaving the matter.",
          },
          {
            name: "One source for every tool",
            desc: "The assistant, tabular reviews, redlines, drafting, and workflows all work from documents filed in the same matter.",
          },
          {
            name: "Versions stay together",
            desc: "New document versions remain connected to the original file, so the team can follow how the document changed over time.",
          },
        ],
      },
      {
        title: "Shared with the right people",
        lead: "The workspace follows the matter team and keeps access decisions close to the documents they protect.",
        points: [
          {
            name: "Matter roles",
            desc: "Staff each matter with viewers, editors, and owners so people receive the access their work requires.",
          },
          {
            name: "Document-level sharing",
            desc: "Share an individual document when someone needs that file without opening the rest of the matter.",
          },
          {
            name: "Work with a history",
            desc: "Documents, review tables, and generated work keep their changes and attribution in the same audit spine.",
          },
        ],
      },
    ],
    uses: [
      "Keep every agreement and supporting file for a transaction together",
      "Open a contract beside the assistant while reviewing its terms",
      "Give outside counsel access to one document without sharing the full matter",
      "Follow a document from its first upload through later versions and redlines",
    ],
  }),
  feature({
    tag: "Assistant",
    title: "Ask about the matter. Get answers with sources.",
    body: "Work with the documents filed in a matter. Open a document or ask the assistant to examine the relevant files, with answers linked back to their sources. Runs on your firm's LLM key.",
    menuDesc: "Ask about the matter, get answers with sources.",
    clip: "/features/assistant.mp4",
    intro:
      "A chat inside the matter workspace that can read its documents when needed, help with the work, and show the sources behind its answers.",
    sections: [
      {
        title: "Work from the matter's documents",
        lead: "The assistant can read the documents filed in the matter, so you can ask about the file without copying text into a separate chat.",
        points: [
          {
            name: "Cited answers",
            desc: "Every answer links to the exact passage it came from. Checking the AI takes one click, not a re-read of the document.",
          },
          {
            name: "Matter scope",
            desc: "Conversations run inside a matter with its document list available, and document reads still follow the member's access.",
          },
          {
            name: "Long documents handled",
            desc: "Large agreements are chunked and retrieved precisely, so questions about clause 14 of a 300-page agreement come back with the right passage.",
          },
        ],
      },
      {
        title: "On your key, on the record",
        lead: "The assistant runs on your firm's own LLM account, and its use is part of the matter history.",
        points: [
          {
            name: "Your own LLM key",
            desc: "Claude, Gemini, OpenAI, or OpenRouter — stored encrypted, configured for zero data retention, never used to train anyone's model.",
          },
          {
            name: "Recorded sessions",
            desc: "Assistant activity is attributable to the member who ran it, in the same history as every other change on the matter.",
          },
        ],
      },
    ],
    uses: [
      "Summarize the open issues in the relevant matter documents before a call",
      "Ask whether an NDA's confidentiality obligations survive termination",
      "Check a clause against the position taken in an earlier draft",
      "Draft a follow-up document from the source material filed in the matter",
    ],
  }),
  feature({
    tag: "Tabular review",
    title: "A hundred contracts. One pass.",
    body: "Ask the same questions of every document in a stack and get the answers back as a table. Each cell links to the spot it came from and to who ran it. The outliers surface themselves.",
    menuDesc: "One set of questions across a whole stack.",
    clip: "/features/review.mp4",
    intro:
      "Define the questions once, run them across every document in a stack, and get back a table where every cell can prove where it came from.",
    sections: [
      {
        title: "One question set, every document",
        lead: "Instead of opening contracts one by one, describe what you need to know and let the review run across the whole stack.",
        points: [
          {
            name: "Reusable question sets",
            desc: "Governing law, term, liability caps, change-of-control — define the columns once and reuse them on the next stack.",
          },
          {
            name: "Answers as a table",
            desc: "Results land in a grid: one row per document, one column per question, exportable for the deal team.",
          },
          {
            name: "Outliers surface themselves",
            desc: "When ninety-seven contracts say New York and three say something else, the table makes the three impossible to miss.",
          },
        ],
      },
      {
        title: "Every cell can prove itself",
        lead: "A review you can't verify is a review you have to redo. Every value keeps its provenance.",
        points: [
          {
            name: "Source links per cell",
            desc: "Each value links to the exact passage in the document it was extracted from — the source is one click away.",
          },
          {
            name: "Run attribution",
            desc: "Each cell also traces to who ran the review and when, in the matter's history.",
          },
        ],
      },
    ],
    uses: [
      "Extract key terms from a due-diligence data room into one table",
      "Check a portfolio of NDAs for non-standard confidentiality terms",
      "Build a lease abstract across a property portfolio",
      "Triage inbound contracts by liability cap and indemnity language",
    ],
  }),
  feature({
    tag: "Redline & drafting",
    title: "The first pass is done before you open the file.",
    body: "Mark up agreements against your own playbook. Suggestions land as tracked changes you accept, reject, or trace back — and drafts start from your templates, not a blank page.",
    menuDesc: "First-pass markups from your own playbook.",
    clip: "/features/redline.mp4",
    intro:
      "AI marks up the agreement against your firm's own positions. Every suggestion arrives as a tracked change with its reasoning — nothing applies itself.",
    sections: [
      {
        title: "Your playbook makes the first pass",
        lead: "The markup reflects positions your firm has already decided on, not a model's general taste in contracts.",
        points: [
          {
            name: "Playbook-driven review",
            desc: "The AI flags clauses that deviate from your standard positions and suggests wording from your approved fallbacks.",
          },
          {
            name: "Suggestions, never silent edits",
            desc: "Every proposed change lands as a tracked change awaiting review. Only a named lawyer's acceptance turns it into the document.",
          },
          {
            name: "Reasoning attached",
            desc: "Each suggestion carries why it was made, attached to the change itself — not buried in a chat log.",
          },
        ],
      },
      {
        title: "Drafting from your own paper",
        lead: "New documents start from the firm's templates and clause library, not a blank page.",
        points: [
          {
            name: "Template-based drafts",
            desc: "Generate agreements and standard documents from your templates, with the routine parts filled and judgment left to you.",
          },
          {
            name: "Word in, Word out",
            desc: "Documents come in and go out as .docx, with tracked changes intact for counterparties who live in Word.",
          },
          {
            name: "Every round in one history",
            desc: "AI passes, lawyer edits, and accepted counterparty changes stay in one chronological history — version seven is explainable against version two.",
          },
        ],
      },
    ],
    uses: [
      "First-pass markup of an inbound MSA against the firm playbook",
      "Turn a signed term sheet into a first-draft agreement",
      "Apply the standard fallback to every unilateral-discretion clause",
      "Reconcile a counterparty's redline against your last position",
    ],
  }),
  feature({
    tag: "Workflows",
    title: "Turn good process into a button.",
    body: "Capture review, extraction, and drafting as simple, repeatable steps. Run them on the next stack of documents, share them across the team, and stop re-explaining the same job.",
    menuDesc: "Turn good process into a repeatable button.",
    clip: "/features/workflow.mp4",
    intro:
      "The jobs your team repeats — intake review, extraction, first-pass markup — captured once as a workflow and run on the next stack with a click.",
    sections: [
      {
        title: "Capture the job once",
        lead: "A workflow is the steps a good reviewer would take, written down so they run the same way every time.",
        points: [
          {
            name: "Composable steps",
            desc: "Chain review, extraction, and drafting into one runnable sequence instead of re-briefing the same job each time.",
          },
          {
            name: "Shared across the team",
            desc: "Workflows are shared, so the process the senior lawyer designed is the process everyone runs.",
          },
          {
            name: "Run on the next stack",
            desc: "Point an existing workflow at a new set of documents and get consistent output without re-explaining anything.",
          },
        ],
      },
      {
        title: "Consistent and accountable",
        lead: "Repeatable process is only useful if you can see what it did.",
        points: [
          {
            name: "Every run on the record",
            desc: "Workflow runs are attributed like any other change: who ran it, on which documents, with what result.",
          },
          {
            name: "Agents can drive them",
            desc: "A connected AI agent can trigger the same workflows over MCP — same steps, same record.",
          },
        ],
      },
    ],
    uses: [
      "Standard intake review for every inbound NDA",
      "The same diligence pass on each new data room",
      "Monthly re-extraction of key dates across active matters",
      "A drafting sequence that starts from the right template every time",
    ],
  }),
  feature({
    tag: "Clause library & playbooks",
    title: "Your standard positions, in one place.",
    body: "Approved clauses, fallbacks, and the playbooks the AI reviews against — shared across the firm, so every markup starts from the positions you've already decided on.",
    menuDesc: "Your standard positions, in one place.",
    clip: "/features/library.mp4",
    intro:
      "The clauses your firm has approved, the fallbacks it accepts, and the walk-aways it doesn't — in one shared library that both lawyers and the AI work from.",
    sections: [
      {
        title: "One source of standard positions",
        lead: "Positions live in a library, not in a senior lawyer's memory or a folder of old deals.",
        points: [
          {
            name: "Approved clauses and fallbacks",
            desc: "Preferred wording, acceptable fallbacks, and walk-away positions, organized and shared across the firm.",
          },
          {
            name: "Playbooks the AI reviews against",
            desc: "Redlines and reviews run against these positions, so the AI's first pass reflects decisions the firm already made.",
          },
          {
            name: "Drafting reuse",
            desc: "Drafts pull from the same approved language, so new documents start from positions you stand behind.",
          },
        ],
      },
      {
        title: "Positions that keep up",
        lead: "A playbook only helps if it reflects what the firm decides today, not last year.",
        points: [
          {
            name: "Update in one place",
            desc: "Change a fallback once and every future markup and draft uses the new position.",
          },
          {
            name: "Changes on the record",
            desc: "Library and playbook edits are attributable changes in the history, like everything else in gitmatter.",
          },
        ],
      },
    ],
    uses: [
      "Codify the firm's standard positions for commercial contracts",
      "Give the AI the fallback wording for liability caps",
      "Share one clause library across every matter team",
      "Update a position once after a partner decision, firm-wide",
    ],
  }),
  feature({
    tag: "Audit trail",
    title: "Every change is on the record.",
    body: "Person or AI, every edit is a commit with an author, a message, and the exact before and after. Open any clause and see how it got there. Read it, share it, or undo it.",
    menuDesc: "Every change on the record: who, what, why.",
    clip: "/features/audit.mp4",
    intro:
      "gitmatter's spine: every change on a matter — by a person in the UI or an AI agent — is a commit with an author, a message, and the exact before and after, in one history.",
    sections: [
      {
        title: "One history for people and AI",
        lead: "Human edits and AI edits land in the same record, so there is nothing to reconcile after the fact.",
        points: [
          {
            name: "Author, message, diff",
            desc: "Each change records who made it, why, and the precise field-level before and after — down to the clause.",
          },
          {
            name: "AI edits labeled as AI",
            desc: "Changes made by a connected agent are recorded under the agent's name, inside the session of the lawyer who connected it.",
          },
          {
            name: "No way around it",
            desc: "There is no write path that bypasses the commit history — not for admins, not for the API, not for the AI.",
          },
        ],
      },
      {
        title: "Answers when someone asks",
        lead: 'Six months later, the question is always "who changed this clause, and why?" The history answers it.',
        points: [
          {
            name: "Blame on any clause",
            desc: "Open any clause and see every change that touched it, in order, with authors and reasons.",
          },
          {
            name: "Precise undo",
            desc: "Any commit can be inspected and reversed on its own, without unwinding the work that came after it.",
          },
        ],
      },
    ],
    uses: [
      "Show which language the AI proposed and which lawyer approved it",
      "Reconstruct how a liability cap moved across a negotiation",
      "Undo one bad change without losing the edits after it",
      "Give supervision reviews a readable record instead of a log file",
    ],
  }),
  feature({
    tag: "Bring your own agent",
    title: "ChatGPT and Claude plug straight in.",
    body: "Connect the assistant your firm already pays for over MCP — no new chatbot, no second login. The agent drives gitmatter's tools; gitmatter records every step it takes.",
    menuDesc: "ChatGPT and Claude plug straight in.",
    clip: "/features/agent.mp4",
    intro:
      "Connect ChatGPT or Claude to gitmatter as a connector, and the assistant your firm already uses can do real matter work — with every action on the record.",
    sections: [
      {
        title: "A five-minute, no-code connection",
        lead: "gitmatter is an MCP server with a secure sign-in, so connecting an assistant works like linking any two apps.",
        points: [
          {
            name: "ChatGPT and Claude connectors",
            desc: "Add gitmatter's address as a custom connector, sign in, approve — no token to copy for the standard path.",
          },
          {
            name: "Command-line agents too",
            desc: "Claude Code, Codex, and similar CLI agents connect over the same OAuth flow, or with a scoped token for self-hosted instances.",
          },
          {
            name: "Acts as you, not as a superuser",
            desc: "The agent gets the access of the member who connected it and can only see that member's matters.",
          },
        ],
      },
      {
        title: "The agent drives, gitmatter records",
        lead: "The assistant decides what to ask for; gitmatter does the work and writes the history.",
        points: [
          {
            name: "Real tools, not copy-paste",
            desc: "The agent can open matters, review stacks, propose redlines, and extract tables through gitmatter's tools.",
          },
          {
            name: "Every action attributed",
            desc: "Each tool call lands in the audit trail under the assistant's name, inside your session.",
          },
          {
            name: "Swap agents, keep the record",
            desc: "The matter history lives in gitmatter, so changing AI vendors next year changes nothing about your record.",
          },
        ],
      },
    ],
    uses: [
      "Ask Claude to review twelve NDAs and table the differences",
      "Have ChatGPT run the firm's intake workflow on new documents",
      "Let a CLI agent draft from templates on a self-hosted instance",
      "Read the matter history to see exactly what the agent did",
    ],
  }),
];

export const SOLUTIONS: Solution[] = [
  solution({
    tag: "Contract redline",
    title: "AI contract redline and review.",
    body: "Mark up agreements against your own playbook. The AI flags risky or off-standard clauses and suggests new wording, so the first pass is done before you open the file. Every suggestion lands as a change you can accept, reject, or trace back.",
    who: "For commercial and transactional lawyers drowning in first-pass review.",
    menuDesc: "AI contract redline and review.",
  }),
  solution({
    tag: "Data extraction",
    title: "Clause and tabular data extraction.",
    body: "Pull dates, parties, amounts, and key clauses out of a stack of contracts into a clean table. No copy-paste. Each value links back to the exact spot it came from, so the source is one click away.",
    who: "For due-diligence and contract-intake teams working at volume.",
    menuDesc: "Clause and tabular data extraction.",
  }),
  solution({
    tag: "Drafting",
    title: "AI legal document generation.",
    body: "Draft agreements and standard documents from your templates and prior work. The AI fills the routine parts; you keep judgment on the rest. Every draft is saved with who asked for what and when.",
    who: "For teams that draft the same kinds of documents over and over.",
    menuDesc: "Document generation from your templates.",
  }),
  solution({
    tag: "Audit trail",
    title: "Audit trail and version control for legal documents.",
    body: "Every change — by a person in the UI or by an AI agent — is a commit with an author, a message, a field-level diff, and blame, all in one history. Open any clause and see exactly how it got there. Built for client-data duties, eDiscovery, and supervision rules.",
    who: "For general counsel, risk, and compliance who must show their work.",
    menuDesc: "Version control for legal documents.",
  }),
  solution({
    tag: "Bring your own agent",
    title: "Connect ChatGPT or Claude over MCP.",
    body: "Plug the AI client your firm already uses into gitmatter as an MCP connector. The agent drives the tools; gitmatter does the work and records every action. No new chatbot to learn, no second login.",
    who: "For firms already standardized on ChatGPT, Claude Desktop, or Claude web.",
    menuDesc: "Connect ChatGPT or Claude over MCP.",
  }),
  solution({
    tag: "Bring your own key",
    title: "Your own LLM key, zero data retention.",
    body: "Run gitmatter's own features on your firm's LLM key — Claude, Gemini, OpenAI, or OpenRouter — stored encrypted and configured so nothing is kept or used for training. Privacy concerns are the top reason firms stall on AI; this is the answer.",
    who: "For firms blocked on AI by confidentiality and data-privacy rules.",
    menuDesc: "Your own LLM key, zero data retention.",
  }),
];

export const getFeature = (slug: string) => FEATURES.find((f) => f.slug === slug);
export const getSolution = (slug: string) => SOLUTIONS.find((s) => s.slug === slug);
