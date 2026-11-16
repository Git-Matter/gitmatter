import { z } from "zod";
import { TOOL } from "@workspace/registry";
import { getDutchCaseLaw, searchDutchCaseLaw } from "../../platform/external/rechtspraak.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// de Rechtspraak open data is a public API — no key gate, unlike CourtListener.
export function buildRechtspraakTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchDutchCaseLaw,
      description:
        "Search Dutch court decisions (rechtspraak.nl open data, no key). The index filters by metadata only — decision date (YYYY-MM-DD), court (creator), subject area — NOT full text; an optional query keyword is matched client-side against returned titles/summaries. Results are in Dutch.",
      schema: {
        query: z.string().optional(),
        date: z.string().optional(),
        creator: z.string().optional(),
        subject: z.string().optional(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        void recordProviderCall("rechtspraak", { userId: actor.userId });
        try {
          return await searchDutchCaseLaw(args);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getDutchCaseLaw,
      description:
        "Get a Dutch court decision by ECLI (e.g. 'ECLI:NL:HR:2014:952') from rechtspraak.nl: metadata (title, court, date) plus the judgment text in Dutch, truncated around 8000 characters.",
      schema: { ecli: z.string() },
      handler: async ({ ecli }) => {
        void recordProviderCall("rechtspraak", { userId: actor.userId });
        try {
          return await getDutchCaseLaw({ ecli: ecli as string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
