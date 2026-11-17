import { z } from "zod";
import { TOOL } from "@workspace/registry";
import { getJapanLaw, searchJapanLaws } from "../../platform/external/egovjapan.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// e-Gov 法令検索 Law API v2 is an open API — no key gate.
export function buildEgovJapanTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchJapanLaws,
      description:
        "Search Japanese statutes by law title on e-Gov (法令検索). Query in Japanese; results (titles, law numbers) are in Japanese.",
      schema: {
        query: z.string(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        void recordProviderCall("egovjapan", { userId: actor.userId });
        try {
          return await searchJapanLaws(args as { query: string; limit?: number });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getJapanLaw,
      description:
        "Get a Japanese law's full text from e-Gov by law ID (from search_japan_laws). Text is Japanese and truncated at ~8000 characters.",
      schema: { lawId: z.string() },
      handler: async (args) => {
        void recordProviderCall("egovjapan", { userId: actor.userId });
        try {
          return await getJapanLaw(args as { lawId: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
