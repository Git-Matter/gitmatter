import { z } from "zod";
import { TOOL } from "@workspace/registry";
import { getEuLaw, searchEuLaw } from "../../platform/external/eurlex.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// EUR-Lex is open data — no key gate; calls are budget-tracked per user.
export function buildEurLexTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchEuLaw,
      description:
        "Search EU legislation and case law on EUR-Lex by title keyword. Returns CELEX numbers, titles, dates, and resource types.",
      schema: {
        query: z.string(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        void recordProviderCall("eurlex", { userId: actor.userId });
        try {
          return await searchEuLaw(args as { query: string; limit?: number });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getEuLaw,
      description:
        "Get the text of an EU legal act from EUR-Lex by CELEX number (e.g. 32016R0679 for the GDPR).",
      schema: { celex: z.string() },
      handler: async (args) => {
        void recordProviderCall("eurlex", { userId: actor.userId });
        try {
          return await getEuLaw(args as { celex: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
