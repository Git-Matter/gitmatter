import { z } from "zod";
import { TOOL } from "@workspace/registry";
import {
  getFrenchLaw,
  hasLegifranceCreds,
  searchFrenchLaw,
} from "../../platform/external/legifrance.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// Returned when an FR-jurisdiction user invokes a Légifrance tool but the
// server-env PISTE credentials are not configured.
const NO_LEGIFRANCE_KEY = {
  error: "Légifrance search is not configured on this instance.",
} as const;

export function buildLegifranceTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchFrenchLaw,
      description:
        "Search French law on Légifrance by keyword. fond selects the corpus: LODA_ETAT (statutes/ordinances/decrees, default), CODE_ETAT (codes in force), JURI (case law). Results are in French.",
      schema: {
        query: z.string(),
        fond: z.enum(["LODA_ETAT", "CODE_ETAT", "JURI"]).optional(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        if (!hasLegifranceCreds()) return NO_LEGIFRANCE_KEY;
        void recordProviderCall("legifrance", { userId: actor.userId });
        try {
          return await searchFrenchLaw(args as { query: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getFrenchLaw,
      description:
        "Get the text of a French law from Légifrance by its identifier: a LEGIARTI id returns one code article; a LEGITEXT/JORFTEXT id returns the act's consolidated text. Text is in French.",
      schema: { textId: z.string() },
      handler: async ({ textId }) => {
        if (!hasLegifranceCreds()) return NO_LEGIFRANCE_KEY;
        void recordProviderCall("legifrance", { userId: actor.userId });
        try {
          return await getFrenchLaw({ textId: textId as string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
