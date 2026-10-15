import { reviewInstructionsSchema } from "../../../packages/contracts/src/review.ts";
import {
  expectedRuleSnapshot,
  scenarios,
  sha256,
  sourceHash,
  sourceText,
  standardsHash,
} from "./scenarios.ts";

type RawObject = Record<string, unknown>;
const object = (value: unknown): RawObject =>
  value !== null && typeof value === "object" && !Array.isArray(value) ? (value as RawObject) : {};

/** This scores supplied observations, never authenticates their provider origin. */
export function scoreObservation(input: unknown) {
  const observation = object(input);
  const scenario = scenarios.find((candidate) => candidate.id === observation.scenarioId);
  if (!scenario) throw new Error("unknown_scenario");
  const captured = object(observation.capturedReview);
  const snapshot = object(object(captured.review).inputSnapshot);
  const metadataFailures: string[] = [];
  if (!["live_provider", "authored_fixture"].includes(String(observation.origin)))
    metadataFailures.push("observation_origin_required");
  if (snapshot.revision !== 2) metadataFailures.push("captured_revision_not_2");
  const instructions = reviewInstructionsSchema.safeParse(snapshot.reviewInstructions);
  if (
    !instructions.success ||
    JSON.stringify(instructions.data) !==
      JSON.stringify(reviewInstructionsSchema.parse(scenario.instructions))
  )
    metadataFailures.push("captured_instructions_mismatch");
  const documents = Array.isArray(snapshot.documents) ? snapshot.documents.map(object) : [];
  if (documents.length !== 1 || documents[0]?.text !== sourceText)
    metadataFailures.push("synthetic_source_mismatch");
  const actualRules = Array.isArray(snapshot.rules)
    ? snapshot.rules.map(object).map((rule) => ({
        id: rule.id,
        columnIndex: rule.columnIndex,
        name: rule.name,
        severity: rule.severity,
        standardPosition: rule.standardPosition,
      }))
    : [];
  if (sha256(JSON.stringify(actualRules)) !== standardsHash)
    metadataFailures.push("captured_standards_mismatch");
  const cells = Array.isArray(captured.cells) ? captured.cells.map(object) : [];
  if (cells.length !== expectedRuleSnapshot.length) metadataFailures.push("unexpected_cell_count");
  const rows = expectedRuleSnapshot.map((rule, index) => {
    const expected = scenario.expected[index]!;
    const matches = cells.filter((cell) => cell.columnIndex === rule.columnIndex);
    const cell = matches[0] ?? {};
    const content = object(cell.content),
      finding = object(cell.finding);
    const failures: string[] = [];
    if (matches.length !== 1) failures.push("missing_or_duplicate_cell");
    if (cell.status !== "done") failures.push("execution_not_done");
    if (cell.documentId !== documents[0]?.id) failures.push("wrong_source_document");
    if (!cell.lastCommitId || finding.revisionId !== cell.lastCommitId)
      failures.push("missing_finding_commit_reference");
    if (!expected.outcomes.includes(finding.outcome as never)) failures.push("unexpected_outcome");
    if (!expected.flags.includes(content.flag as never)) failures.push("unexpected_flag");
    if (finding.outcome === "inconclusive" && content.flag !== "grey")
      failures.push("inconclusive_must_stay_grey");
    if (
      typeof content.summary !== "string" ||
      !content.summary.trim() ||
      typeof content.reasoning !== "string" ||
      !content.reasoning.trim()
    )
      failures.push("empty_assessment");
    const citations = Array.isArray(cell.citations) ? cell.citations.map(object) : [];
    if (citations.some((citation) => Object.hasOwn(citation, "page")))
      failures.push("unverified_page_claim");
    if (expected.citation === "present" && citations.length === 0)
      failures.push("required_citation_missing");
    if (expected.citation === "absent" && citations.length > 0)
      failures.push("absence_has_fabricated_citation");
    if (
      citations.some(
        (citation) =>
          typeof citation.quote !== "string" ||
          !citation.quote.trim() ||
          !sourceText.includes(citation.quote)
      )
    )
      failures.push("quotation_not_exact_source_text");
    if (
      expected.requiredQuote &&
      !citations.some(
        (citation) =>
          typeof citation.quote === "string" &&
          expected.requiredQuote!.includes(citation.quote) &&
          citation.quote.length >= 12
      )
    )
      failures.push("operative_quotation_missing");
    return {
      ruleId: rule.id,
      technicalChecksPassed: failures.length === 0,
      failures,
      outcome: ["conforms", "deviates", "not_found", "inconclusive"].includes(
        String(finding.outcome)
      )
        ? String(finding.outcome)
        : null,
      citationCount: citations.length,
      humanCheck: expected.humanCheck,
    };
  });
  return {
    schemaVersion: 1,
    scenarioId: scenario.id,
    inputOriginClaim: ["live_provider", "authored_fixture"].includes(String(observation.origin))
      ? String(observation.origin)
      : null,
    providerOriginIndependentlyVerified: false,
    sourceHash,
    standardsHash,
    technicalChecksPassed:
      metadataFailures.length === 0 && rows.every((row) => row.technicalChecksPassed),
    metadataFailures,
    rows,
    legalQualitySignoff: "not_established",
    requiredNextEvidence:
      "Verify live provider/usage/audit receipts and have an eligible legal reviewer judge semantic relevance, approved positions and unknown-context handling.",
  };
}
