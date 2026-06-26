import { describe, expect, test } from "vite-plus/test";
import { PROVIDERS } from "@workspace/registry";
import { buildToolCatalog } from "../src/tools/catalog.js";

// Guards the registry <-> catalog seam. Handler names already come from the
// registry's TOOL constants (so a handler cannot name a tool the registry does
// not know), but nothing forces the reverse: a tool listed in the registry could
// lack a handler. This test closes that gap — every provider tool must be built
// for a jurisdiction the provider serves.

const actor = { type: "agent", userId: "test-user", agentLabel: "test" } as const;

describe("tool catalog <-> registry reconciliation", () => {
  for (const provider of PROVIDERS) {
    test(`every ${provider.id} tool has a handler`, () => {
      const jurisdiction =
        provider.jurisdictions.find((j) => !j.includes("*")) ?? provider.jurisdictions[0]!;
      const built = new Set(
        buildToolCatalog(actor, { jurisdiction, defaultMatterLabel: "Default" }).map((t) => t.name)
      );
      for (const tool of provider.tools) {
        expect(built.has(tool.name), `${tool.name} has no handler`).toBe(true);
      }
    });
  }

  test("tool names are unique across providers", () => {
    const seen = new Set<string>();
    for (const provider of PROVIDERS) {
      for (const tool of provider.tools) {
        expect(seen.has(tool.name), `${tool.name} declared twice`).toBe(false);
        seen.add(tool.name);
      }
    }
  });

  test("sourceIds narrows research tools", () => {
    const built = new Set(
      buildToolCatalog(actor, {
        jurisdiction: "US",
        defaultMatterLabel: "Default",
        sourceIds: [],
      }).map((t) => t.name)
    );
    expect(built.has("search_case_law")).toBe(false);
    expect(built.has("verify_citations")).toBe(false);
  });
});
