import { z } from "zod";
import { TOOL } from "@workspace/registry";
import { getUkLegislation, searchUkLegislation } from "../../platform/external/uklegislation.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// legislation.gov.uk is open data — no API key gate, unlike CourtListener.
export function buildUkLegislationTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchUkLegislation,
      description:
        "Search UK legislation (statutes and statutory instruments) by keyword on legislation.gov.uk.",
      schema: {
        query: z.string(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        void recordProviderCall("uklegislation", { userId: actor.userId });
        try {
          return await searchUkLegislation(args as { query: string; limit?: number });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getUkLegislation,
      description:
        "Fetch the plain text of a UK act or instrument from legislation.gov.uk by type " +
        "(e.g. 'ukpga'), year, and number — optionally a single section.",
      schema: {
        type: z.string(),
        year: z.string(),
        number: z.string(),
        section: z.string().optional(),
      },
      handler: async (args) => {
        void recordProviderCall("uklegislation", { userId: actor.userId });
        try {
          return await getUkLegislation(args as { type: string; year: string; number: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
