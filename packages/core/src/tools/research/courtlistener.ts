import { z } from "zod";
import { TOOL } from "@workspace/registry";
import {
  recordProviderCall,
  resolveCourtListenerKey,
  searchCaseLaw,
  verifyCitations,
} from "../../platform/index.js";
import type { ToolContext, ToolSpec } from "../types.js";

// Returned when a US-jurisdiction user invokes a CourtListener tool without a key
// (their own in Settings → Legal research, or the server-env fallback).
const NO_CL_KEY = {
  error: "No CourtListener API key. Add one in Settings → Legal research.",
} as const;

export function buildCourtListenerTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchCaseLaw,
      description:
        "Search US case law opinions (CourtListener) by keyword, with optional court/date filters.",
      schema: {
        query: z.string(),
        court: z.string().optional(),
        filedAfter: z.string().optional(),
        filedBefore: z.string().optional(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        const token = await resolveCourtListenerKey(actor.userId);
        if (!token) return NO_CL_KEY;
        void recordProviderCall("courtlistener", { userId: actor.userId });
        try {
          return await searchCaseLaw(token, args as { query: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.verifyCitations,
      description:
        "Verify/normalize US reporter citations (e.g. '467 U.S. 837') against CourtListener.",
      schema: { citations: z.array(z.string()) },
      handler: async ({ citations }) => {
        const token = await resolveCourtListenerKey(actor.userId);
        if (!token) return NO_CL_KEY;
        void recordProviderCall("courtlistener", { userId: actor.userId });
        try {
          return await verifyCitations(token, citations as string[]);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
