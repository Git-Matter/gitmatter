import type { LegalAiGuideContent } from "@/marketing/LegalAiGuide";

export const LEGAL_AI_GUIDE: LegalAiGuideContent = {
  eyebrow: "legal AI",
  title: "Legal AI for contract work that a team can check.",
  lead: "Legal AI can speed up review, redlining, extraction, drafting, and research. It should make the first pass easier, not remove the lawyer responsible for the final decision.",
  explanation:
    "A useful legal AI workflow keeps the source material, proposed work, reviewer decision, and final result connected. That lets a team check an answer against the document, apply its own position, and explain the outcome later.",
  checks: [
    {
      title: "Start with the source",
      body: "Use the agreement, playbook, and matter documents as the working context. A useful answer should lead the reviewer back to the relevant passage, not ask them to trust a summary alone.",
    },
    {
      title: "Keep a person in the decision",
      body: "Let AI identify issues and propose a first pass, then let the lawyer accept, reject, or change the result. The decision belongs to the person responsible for the matter.",
    },
    {
      title: "Keep the work explainable",
      body: "When a clause changes, record who made the change, why it was made, and the exact before and after. That record makes review, handover, and later questions much simpler.",
    },
  ],
  related: [
    { to: "/legal-ai-audit-trail", title: "Legal AI with an audit trail" },
    { to: "/self-hosted-legal-ai", title: "Self-hosted legal AI" },
  ],
};

export const AUDIT_TRAIL_GUIDE: LegalAiGuideContent = {
  eyebrow: "legal AI audit trail",
  title: "Legal AI with an audit trail, not a black box.",
  lead: "An audit trail gives a legal team a clear record of the work around an AI result: the person involved, the reason for the change, and the exact before and after.",
  explanation:
    "For contract work, the useful question is rarely just whether AI produced a good suggestion. A team also needs to know what was accepted, what was changed, and who made the call. A complete record makes that information available without rebuilding the story from chat messages and file versions.",
  checks: [
    {
      title: "Attribute every change",
      body: "Record whether a person or AI initiated the work, and identify the member who approved or changed it. Attribution creates a clear handover point and avoids anonymous edits.",
    },
    {
      title: "Preserve the exact difference",
      body: "Keep the text before and after an edit together with the reason for it. A reviewer should be able to inspect a clause without comparing separate exports by hand.",
    },
    {
      title: "Make history part of the workflow",
      body: "The record should sit beside review, redlining, drafting, and matter documents. History is useful when it is part of normal work, not a separate compliance task at the end.",
    },
  ],
  related: [
    { to: "/legal-ai", title: "Legal AI for contract work" },
    { to: "/self-hosted-legal-ai", title: "Self-hosted legal AI" },
  ],
};

export const SELF_HOSTED_GUIDE: LegalAiGuideContent = {
  eyebrow: "self-hosted legal AI",
  title: "Self-hosted legal AI for teams that need control.",
  lead: "Self-hosting lets a team run the application stack on infrastructure it controls. It can pair that with its own model account and its own operational policies for legal work.",
  explanation:
    "Self-hosting does not remove the need for security, access control, or a careful AI workflow. It gives the firm a clearer boundary: it chooses the infrastructure, the storage, the model provider account, and the people who can access the system.",
  checks: [
    {
      title: "Decide where the stack runs",
      body: "Choose the environment that matches the firm's operational requirements, then set clear ownership for database, object storage, backups, updates, and incident response.",
    },
    {
      title: "Use the firm's model account",
      body: "Connect the model provider account the firm has approved. Keep credentials encrypted, limit access to the people who administer them, and use the provider settings that meet the firm's retention requirements.",
    },
    {
      title: "Control access around the matter",
      body: "Give people access according to the work they need to do. Matter roles and document sharing should make the boundary visible to the team, not just to an administrator.",
    },
  ],
  related: [
    { to: "/legal-ai", title: "Legal AI for contract work" },
    { to: "/legal-ai-audit-trail", title: "Legal AI with an audit trail" },
  ],
};
