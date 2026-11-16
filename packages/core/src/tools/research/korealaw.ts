import { z } from "zod";
import { TOOL } from "@workspace/registry";
import {
  getKoreanLaw,
  resolveKoreaLawOc,
  searchKoreanLaws,
} from "../../platform/external/korealaw.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// Returned when a KR-jurisdiction user invokes a law.go.kr tool without an OC
// credential (their own in Settings → Legal research, or the server-env fallback).
const NO_OC = {
  error: "No law.go.kr OC credential. Add one in Settings → Legal research.",
} as const;

export function buildKoreaLawTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchKoreanLaws,
      description:
        "Search Korean statutes on 국가법령정보센터 (law.go.kr) by keyword. Results are in Korean.",
      schema: {
        query: z.string(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        const oc = await resolveKoreaLawOc(actor.userId);
        if (!oc) return NO_OC;
        void recordProviderCall("korealaw", { userId: actor.userId });
        try {
          return await searchKoreanLaws(oc, args as { query: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getKoreanLaw,
      description:
        "Get a Korean law's articles from law.go.kr by 법령ID (from search_korean_laws). Text is Korean.",
      schema: { lawId: z.string() },
      handler: async ({ lawId }) => {
        const oc = await resolveKoreaLawOc(actor.userId);
        if (!oc) return NO_OC;
        void recordProviderCall("korealaw", { userId: actor.userId });
        try {
          return await getKoreanLaw(oc, { lawId: lawId as string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
