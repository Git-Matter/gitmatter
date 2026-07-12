import { z } from "zod";
import { TOOL } from "@workspace/registry";
import {
  getUsFederalPackage,
  resolveGovinfoKey,
  searchUsFederalLaw,
} from "../../platform/external/govinfo.js";
import { recordProviderCall } from "../../platform/usage.js";
import type { ToolContext, ToolSpec } from "../types.js";

// Returned when a user invokes a govinfo tool without a key (their own in
// Settings → Legal research, or the server-env fallback).
const NO_GOVINFO_KEY = {
  error: "No govinfo API key. Add one in Settings → Legal research.",
} as const;

export function buildGovinfoTools({ actor }: ToolContext): ToolSpec[] {
  return [
    {
      name: TOOL.searchUsFederalLaw,
      description:
        "Search US federal statutes and documents on govinfo (US GPO) by keyword, with an optional collection filter (USCODE, PLAW, CFR, FR, STATUTE).",
      schema: {
        query: z.string(),
        collection: z.string().optional(),
        limit: z.number().optional(),
      },
      handler: async (args) => {
        const key = await resolveGovinfoKey(actor.userId);
        if (!key) return NO_GOVINFO_KEY;
        void recordProviderCall("govinfo", { userId: actor.userId });
        try {
          return await searchUsFederalLaw(key, args as { query: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
    {
      name: TOOL.getUsFederalPackage,
      description:
        "Get a govinfo package's summary (title, collection, dates, download links) by package ID.",
      schema: { packageId: z.string() },
      handler: async (args) => {
        const key = await resolveGovinfoKey(actor.userId);
        if (!key) return NO_GOVINFO_KEY;
        void recordProviderCall("govinfo", { userId: actor.userId });
        try {
          return await getUsFederalPackage(key, args as { packageId: string });
        } catch (e) {
          return { error: e instanceof Error ? e.message : "failed" };
        }
      },
    },
  ];
}
