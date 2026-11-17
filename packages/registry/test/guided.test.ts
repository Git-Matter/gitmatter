import { describe, expect, test } from "vite-plus/test";
import { buildGuidedPrompt, GUIDED_TASK_IDS, GUIDED_TASKS } from "../src/guided.js";
import { resolveChatJurisdiction } from "../src/jurisdiction.js";

describe("Australian guided task instructions", () => {
  test("conversation context survives defaults and explicit changes remain possible", () => {
    expect(resolveChatJurisdiction({ conversation: "AU-NSW", matter: "AU", user: "US" })).toBe(
      "AU-NSW"
    );
    expect(resolveChatJurisdiction({ request: "", conversation: "AU-NSW", user: "US" })).toBe(
      "AU-NSW"
    );
    expect(resolveChatJurisdiction({ request: "AU-VIC", conversation: "AU-NSW", user: "US" })).toBe(
      "AU-VIC"
    );
    expect(resolveChatJurisdiction({ matter: "AU-QLD", user: "US" })).toBe("AU-QLD");
    expect(resolveChatJurisdiction({ user: "US" })).toBe("US");
  });
  test("all three actions share stable reusable workflow definitions", () => {
    expect(GUIDED_TASKS.map((task) => task.id)).toEqual(GUIDED_TASK_IDS);
    expect(new Set(GUIDED_TASKS.map((task) => task.workflowTitle)).size).toBe(3);
  });

  test("client update preserves matter, source identity, preferences, and draft boundary", () => {
    const prompt = buildGuidedPrompt({
      task: "client-update",
      jurisdiction: "AU-NSW",
      matterId: "selected-matter",
      documents: [{ id: "source-one", title: "Client instructions" }],
      instructions: "We act for the customer; explain missing instructions.",
      practice: {
        displayName: "Example Practice",
        correspondenceHeader: "Example Practice\nSydney",
        signOff: "Kind regards, Alex",
        instructions: "Plain English",
      },
    });
    expect(prompt).toContain("matterId selected-matter");
    expect(prompt).toContain("document:source-one");
    expect(prompt).toContain("AU-NSW");
    expect(prompt).toContain("Example Practice\nSydney");
    expect(prompt).toContain("Kind regards, Alex");
    expect(prompt).toContain("generate_docx");
    expect(prompt).toContain("Do not email or send");
    expect(prompt).toContain("Never invent page numbers");
    expect(prompt).toContain("Do not calculate legal deadlines");
  });

  test("templates ask for missing source and client context rather than invent it", () => {
    const prompt = buildGuidedPrompt({ task: "matter-briefing", jurisdiction: "AU" });
    expect(prompt).toContain("ask for them before preparing");
    expect(prompt).toContain("Ask for the client's role");
    expect(prompt).toContain("unconfirmed");
    expect(prompt).toContain("Do not assume that an event occurred");
  });
});
