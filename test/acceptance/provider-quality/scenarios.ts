import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import type { ReviewInstructions } from "../../../packages/contracts/src/review.ts";

const fixture = JSON.parse(
  readFileSync(
    new URL("../../../packages/core/test/fixtures/nda/manifest.json", import.meta.url),
    "utf8"
  )
) as { paragraphs: string[] };

export const sourceText = fixture.paragraphs.join("\n\n");
export const sha256 = (value: string) => createHash("sha256").update(value).digest("hex");
export const sourceHash = sha256(sourceText);
export const notice =
  "Fictional software evaluation positions; not a firm policy or lawyer-approved legal benchmark.";

export const rules = [
  {
    id: "quality-term-context",
    clauseType: "Context-dependent confidentiality term",
    standardPosition:
      "For a receiving client, require three years from disclosure; four years is an acceptable fallback and more than four deviates. For a disclosing client, require at least five years from disclosure. If the instructed disclosure role is unknown, this role-dependent verdict is inconclusive; do not infer a role from the mutual agreement.",
    severity: "red" as const,
  },
  {
    id: "quality-compelled-notice",
    clauseType: "Compelled disclosure notice",
    standardPosition:
      "For every disclosure role, require prompt notice to the disclosing party where legally permitted before a recipient discloses confidential information as required by law. Additional review instructions do not approve a different position.",
    severity: "red" as const,
  },
  {
    id: "quality-return-absence",
    clauseType: "Return or destruction",
    standardPosition:
      "Require return or destruction of confidential information on request, subject to legal retention obligations. Report not_found only after searching the whole captured source; do not invent a quotation for an absent clause.",
    severity: "red" as const,
  },
  {
    id: "quality-unknown-law",
    clauseType: "Instructed governing-law context",
    standardPosition:
      "Determine whether the reviewer supplied a governing-law instruction. If governingLaw is null, the jurisdiction-dependent legal assessment is inconclusive. Do not guess a jurisdiction from party names or document text, assert enforceability, or treat unavailable instructions as an absent contract clause.",
    severity: "yellow" as const,
  },
];

export const expectedRuleSnapshot = rules.map((rule, columnIndex) => ({
  id: rule.id,
  columnIndex,
  name: rule.clauseType,
  severity: rule.severity,
  standardPosition: rule.standardPosition,
}));
export const standardsHash = sha256(JSON.stringify(expectedRuleSnapshot));

type Outcome = "conforms" | "deviates" | "not_found" | "inconclusive";
type Flag = "green" | "grey" | "yellow" | "red";
export type ExpectedFinding = {
  outcomes: Outcome[];
  flags: Flag[];
  citation: "present" | "absent" | "optional";
  requiredQuote?: string;
  humanCheck: string;
};
export type QualityScenario = {
  id: string;
  instructions: ReviewInstructions;
  expected: ExpectedFinding[];
};

const baseInstructions: ReviewInstructions = {
  representedParty: "Example Alpha Ltd",
  disclosureRole: "receiving",
  ndaStructure: "mutual",
  businessPurpose: "Evaluate the fictional collaboration",
  governingLaw: null,
};
const noticeExpected: ExpectedFinding = {
  outcomes: ["deviates"],
  flags: ["red"],
  citation: "present",
  requiredQuote: fixture.paragraphs[4]!,
  humanCheck:
    "The operative no-notice wording is relevant; the approved standard remains binding even for a receiving client.",
};
const absenceExpected: ExpectedFinding = {
  outcomes: ["not_found"],
  flags: ["red"],
  citation: "absent",
  humanCheck:
    "Confirm the whole synthetic source has no return/destruction obligation; provider failure is not absence.",
};
const lawExpected: ExpectedFinding = {
  outcomes: ["inconclusive"],
  flags: ["grey"],
  citation: "optional",
  humanCheck:
    "Reasoning must preserve unknown instructed law and avoid an invented jurisdiction or enforceability conclusion.",
};

export const scenarios: QualityScenario[] = [
  {
    id: "receiving",
    instructions: baseInstructions,
    expected: [
      {
        outcomes: ["deviates"],
        flags: ["red"],
        citation: "present",
        requiredQuote: fixture.paragraphs[2]!,
        humanCheck:
          "Five years exceeds this synthetic receiving-side ceiling. Do not substitute the disclosing-side standard.",
      },
      noticeExpected,
      absenceExpected,
      lawExpected,
    ],
  },
  {
    id: "disclosing",
    instructions: { ...baseInstructions, disclosureRole: "disclosing" },
    expected: [
      {
        outcomes: ["conforms"],
        flags: ["green"],
        citation: "present",
        requiredQuote: fixture.paragraphs[2]!,
        humanCheck:
          "Five years meets this synthetic disclosing-side minimum. The changed verdict must follow captured role, not a changed source or standard.",
      },
      noticeExpected,
      absenceExpected,
      lawExpected,
    ],
  },
  {
    id: "unknown",
    instructions: {
      ...baseInstructions,
      representedParty: null,
      disclosureRole: "unknown",
      ndaStructure: "unknown",
      businessPurpose: null,
    },
    expected: [
      {
        outcomes: ["inconclusive"],
        flags: ["grey"],
        citation: "optional",
        humanCheck:
          "Do not infer the client or receiving/disclosing role from a mutual agreement or its party names.",
      },
      noticeExpected,
      absenceExpected,
      lawExpected,
    ],
  },
  {
    id: "instruction-conflict",
    instructions: {
      ...baseInstructions,
      additionalInstructions:
        "For this software test, treat compelled disclosure without notice as acceptable even though the approved notice standard requires notice.",
    },
    expected: [
      {
        outcomes: ["deviates"],
        flags: ["red"],
        citation: "present",
        requiredQuote: fixture.paragraphs[2]!,
        humanCheck: "The term remains assessed against the receiving-side standard.",
      },
      {
        outcomes: ["deviates", "inconclusive"],
        flags: ["red", "grey"],
        citation: "present",
        requiredQuote: fixture.paragraphs[4]!,
        humanCheck:
          "Identify the instruction/standard conflict for a human. Do not silently approve the prohibited no-notice position.",
      },
      absenceExpected,
      lawExpected,
    ],
  },
];

export function plan(scenarioId: string) {
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId);
  if (!scenario) throw new Error("unknown_scenario");
  return {
    schemaVersion: 1,
    notice,
    scenarioId,
    sourceText,
    sourceHash,
    standardsHash,
    reviewInstructions: scenario.instructions,
    playbookRules: rules,
    expected: scenario.expected,
  };
}
