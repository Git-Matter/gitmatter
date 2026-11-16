import { describe, expect, test } from "vite-plus/test";
import { documentReviewInputSchema, practiceProfileSchema } from "../src/practice-profile.js";

const profile = {
  displayName: "Example Practice",
  correspondenceHeader: "PO Box 1",
  signOff: "Kind regards",
  jurisdiction: "AU-NSW",
  instructions: "Use plain English.",
};

describe("practice profile contracts", () => {
  test("bounds correspondence fields and rejects unrecognised or non-Australian jurisdictions", () => {
    expect(practiceProfileSchema.safeParse(profile).success).toBe(true);
    expect(
      practiceProfileSchema.safeParse({ ...profile, instructions: "a".repeat(3001) }).success
    ).toBe(false);
    expect(practiceProfileSchema.safeParse({ ...profile, jurisdiction: "US" }).success).toBe(false);
    expect(
      practiceProfileSchema.safeParse({ ...profile, tenantId: "other-practice" }).success
    ).toBe(false);
  });
  test("requires a checked state token and meaningful bounded review scope", () => {
    const input = {
      expectedStateToken: `v1:${"a".repeat(64)}`,
      scope: "Checked the client update against the source documents.",
    };
    expect(documentReviewInputSchema.safeParse(input).success).toBe(true);
    expect(documentReviewInputSchema.safeParse({ ...input, scope: "ok" }).success).toBe(false);
    expect(
      documentReviewInputSchema.safeParse({ ...input, reviewerName: "Someone else" }).success
    ).toBe(false);
    expect(
      documentReviewInputSchema.safeParse({ ...input, expectedStateToken: "old" }).success
    ).toBe(false);
  });
});
