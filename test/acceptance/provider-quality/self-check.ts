import assert from "node:assert/strict";
import { expectedRuleSnapshot, scenarios, sourceText } from "./scenarios.ts";
import { scoreObservation } from "./scorer.ts";

function authoredObservation(scenarioId: string) {
  const scenario = scenarios.find((candidate) => candidate.id === scenarioId)!;
  return {
    origin: "authored_fixture",
    scenarioId,
    capturedReview: {
      review: {
        inputSnapshot: {
          revision: 2,
          reviewInstructions: scenario.instructions,
          documents: [{ id: "synthetic-document", text: sourceText }],
          rules: structuredClone(expectedRuleSnapshot),
        },
      },
      cells: scenario.expected.map((expected, columnIndex) => ({
        columnIndex,
        documentId: "synthetic-document",
        status: "done",
        lastCommitId: `synthetic-commit-${columnIndex}`,
        content: {
          summary: "Authored scorer self-check",
          reasoning: "Deterministic fixture; not provider output",
          flag: expected.flags[0],
        },
        finding: { revisionId: `synthetic-commit-${columnIndex}`, outcome: expected.outcomes[0] },
        citations: expected.requiredQuote ? [{ quote: expected.requiredQuote }] : [],
      })),
    },
  };
}
for (const scenario of scenarios) {
  const result = scoreObservation(authoredObservation(scenario.id));
  assert.equal(result.technicalChecksPassed, true);
  assert.equal(result.providerOriginIndependentlyVerified, false);
  assert.equal(result.legalQualitySignoff, "not_established");
}
const fabricated = authoredObservation("receiving");
fabricated.capturedReview.cells[0]!.citations = [{ quote: "Fabricated operative words" }];
assert.equal(scoreObservation(fabricated).technicalChecksPassed, false);
const wrongRole = authoredObservation("receiving");
wrongRole.capturedReview.review.inputSnapshot.reviewInstructions = scenarios[1]!.instructions;
assert.equal(
  scoreObservation(wrongRole).metadataFailures.includes("captured_instructions_mismatch"),
  true
);
const fabricatedAbsence = authoredObservation("unknown");
fabricatedAbsence.capturedReview.cells[2]!.citations = [{ quote: sourceText.split("\n\n")[0]! }];
assert.equal(scoreObservation(fabricatedAbsence).technicalChecksPassed, false);
const failed = authoredObservation("receiving");
failed.capturedReview.cells[0]!.status = "error";
assert.equal(scoreObservation(failed).technicalChecksPassed, false);
const wrongSource = authoredObservation("receiving");
wrongSource.capturedReview.review.inputSnapshot.documents[0]!.text = "A different synthetic source";
assert.equal(
  scoreObservation(wrongSource).metadataFailures.includes("synthetic_source_mismatch"),
  true
);
const wrongStandard = authoredObservation("receiving");
wrongStandard.capturedReview.review.inputSnapshot.rules[0]!.standardPosition =
  "Different test standard";
assert.equal(
  scoreObservation(wrongStandard).metadataFailures.includes("captured_standards_mismatch"),
  true
);
const duplicate = authoredObservation("receiving");
duplicate.capturedReview.cells.push(duplicate.capturedReview.cells[0]!);
assert.equal(scoreObservation(duplicate).technicalChecksPassed, false);
const wrongCommit = authoredObservation("receiving");
wrongCommit.capturedReview.cells[0]!.finding.revisionId = "synthetic-unrelated-commit";
assert.equal(scoreObservation(wrongCommit).technicalChecksPassed, false);
const unsupportedPage = authoredObservation("receiving");
Object.assign(unsupportedPage.capturedReview.cells[0]!.citations[0]!, { page: 1 });
assert.equal(
  scoreObservation(unsupportedPage).rows[0]!.failures.includes("unverified_page_claim"),
  true
);
console.log(
  JSON.stringify({
    evidenceTier: "offline_scorer_self_check",
    scenarios: scenarios.length,
    rejectionChecks: 9,
    passed: true,
    providerCalls: 0,
    legalQualitySignoff: "not_established",
  })
);
