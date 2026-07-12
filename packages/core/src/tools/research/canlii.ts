import { z } from "zod";
import { TOOL } from "@workspace/registry";
import {
  getCanadianCase,
  resolveCanliiKey,
  searchCanadianCaseLaw,
} from "../../platform/external/canlii.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// Returned when a user invokes a CanLII tool without a key (their own in
// Settings → Legal research, or the server-env fallback).
const NO_CANLII_KEY = {
  error: "No CanLII API key. Add one in Settings → Legal research.",
} as const;

export function buildCanliiTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchCanadianCaseLaw,
      description:
        "Browse Canadian case law metadata (CanLII). Metadata browse/citator API only — no full-text search. " +
        "Call without databaseId to list the available court databases, then call again with a databaseId " +
        "and optional published/decision date filters (YYYY-MM-DD) to list recent decisions.",
      schema: {
        databaseId: z.string().optional(),
        publishedAfter: z.string().optional(),
        publishedBefore: z.string().optional(),
        decisionDateAfter: z.string().optional(),
        decisionDateBefore: z.string().optional(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        const key = await resolveCanliiKey(actor.userId);
        if (!key) return NO_CANLII_KEY;
        void recordProviderCall("canlii", { userId: actor.userId });
        try {
          return await searchCanadianCaseLaw(key, args);
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getCanadianCase,
      description:
        "Get a Canadian decision's metadata from CanLII (title, citation, docket number, decision date, " +
        "keywords, URL) plus the cases it cites (citator). Metadata only — no decision full text.",
      schema: {
        databaseId: z.string(),
        caseId: z.string(),
      },
      handler: async (args) => {
        const key = await resolveCanliiKey(actor.userId);
        if (!key) return NO_CANLII_KEY;
        void recordProviderCall("canlii", { userId: actor.userId });
        try {
          return await getCanadianCase(key, args as { databaseId: string; caseId: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
