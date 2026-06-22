import { describe, expect, test } from "vite-plus/test";
import { jurisdictionMatches, providersFor, resolveJurisdiction, toolsFor } from "../src/index.js";

describe("registry", () => {
  test("federal jurisdiction covers sub-jurisdictions", () => {
    expect(jurisdictionMatches("US", "US-NY")).toBe(true);
    expect(jurisdictionMatches("US", "US")).toBe(true);
    expect(jurisdictionMatches("US", "EU")).toBe(false);
    expect(jurisdictionMatches("*", "anything")).toBe(true);
  });

  test("CourtListener serves US, not EU", () => {
    const us = providersFor("US-NY").map((p) => p.id);
    expect(us).toContain("courtlistener");
    const eu = providersFor("EU").map((p) => p.id);
    expect(eu).not.toContain("courtlistener");
  });

  test("toolsFor flattens provider tools", () => {
    expect(toolsFor("US").map((t) => t.name)).toContain("search_case_law");
    expect(toolsFor("EU").map((t) => t.name)).not.toContain("search_case_law");
  });

  test("resolveJurisdiction: artifact > user > default", () => {
    expect(resolveJurisdiction("US-CA", "US-NY")).toBe("US-CA");
    expect(resolveJurisdiction(null, "US-NY")).toBe("US-NY");
    expect(resolveJurisdiction(null, null)).toBe("US");
  });
});
