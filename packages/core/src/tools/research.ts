import { z } from "zod";
import { type ProviderId, TOOL } from "@workspace/registry";
import {
  getPatent,
  getTrademark,
  hasPatentCreds,
  hasTrademarkCreds,
  pageTrademarksAdvanced,
  recordCourtListenerCall,
  recordIpAustraliaCall,
  resolveCourtListenerKey,
  searchCaseLaw,
  searchPatents,
  searchTrademarksAdvanced,
  searchTrademarks,
  verifyCitations,
} from "../platform/index.js";
import type { ToolContext, ToolSpec } from "./types.js";

// Returned when a US-jurisdiction user invokes a CourtListener tool without a key
// (their own in Settings → Legal research, or the server-env fallback).
const NO_CL_KEY = {
  error: "No CourtListener API key. Add one in Settings → Legal research.",
} as const;

// Returned when an AU-jurisdiction user invokes an IP Australia tool but the
// server-env credentials for that product are not configured.
const NO_IPA_PATENT_KEY = {
  error: "IP Australia patent search is not configured on this instance.",
} as const;
const NO_IPA_TRADEMARK_KEY = {
  error: "IP Australia trade mark search is not configured on this instance.",
} as const;

const trademarkStatus = z.enum([
  "PENDING",
  "REGISTERED",
  "REFUSED",
  "REMOVED",
  "NEVER_REGISTERED",
  "DISCONTINUED",
]);
const trademarkSort = z.object({
  field: z
    .enum(["NUMBER", "IR_NUMBER", "STATUS", "WORDS", "PRIORITY_DATE", "RENEWAL_DUE_DATE"])
    .optional(),
  direction: z.enum(["ASCENDING", "DESCENDING"]).optional(),
});
const trademarkWord = z.object({
  text: z.string(),
  type: z.enum([
    "EXACT",
    "PREFIX",
    "PART",
    "SUFFIX",
    "PHONETIC",
    "FUZZY",
    "STEM",
    "NON_WILDCARD_EXACT",
    "WORD_ONLY_EXACT",
    "TRANSLITERATION_EXACT",
  ]),
});
const trademarkDate = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
  type: z.enum([
    "LODGEMENT_DATE",
    "FILING",
    "CONVENTION_DATE",
    "DIVISIONAL_DATE",
    "NOTIFICATION_DATE",
    "FIRST_REPORT",
    "ACCEPTANCE_DUE",
    "ACCEPTANCE",
    "ACCEPTANCE_ADVERTISED",
    "REGISTRATION_DUE",
    "ENTERED_ON_REGISTER",
    "REGISTERED_FROM",
    "REGISTRATION_ADVERTISED",
    "RENEWAL_DUE",
    "WITHDRAWAL",
    "WITHDRAWAL_ADVERTISED",
    "LAPSING",
    "PRIORITY_DATE",
    "LAPSING_ADVERTISED",
  ]),
});
const trademarkAdvancedQuery = z.object({
  addressForService: z.string().optional(),
  claimant: z.string().optional(),
  classNumber: z
    .object({
      text: z.string(),
      type: z.enum(["SINGLE", "ASSOCIATED", "ASSOCIATED_PRE_2012"]),
    })
    .optional(),
  date: trademarkDate.optional(),
  flags: z
    .array(z.enum(["NON_USE", "INTERNATIONAL_REGISTRATION", "REGULATED", "SERIES"]))
    .optional(),
  goodsAndServices: z.string().optional(),
  image: z.object({ text: z.string(), type: z.enum(["EXACT", "PART"]) }).optional(),
  irNumber: z.string().optional(),
  acnArbnAbn: z.string().optional(),
  kinds: z
    .array(
      z.enum([
        "WORD",
        "FIGURATIVE",
        "FANCY",
        "COLOUR",
        "SCENT",
        "SHAPE",
        "SOUND",
        "MOVEMENT",
        "FEEL",
        "HOLOGRAM",
        "POSITION",
        "TASTE",
        "TRACER",
        "OTHER",
      ])
    )
    .optional(),
  opponent: z.string().optional(),
  otherInformation: z.string().optional(),
  owner: z.string().optional(),
  removalApplicant: z.string().optional(),
  statuses: z
    .array(
      z.enum([
        "PENDING_REGISTERED_REFUSED",
        "PENDING_REGISTERED",
        "PENDING",
        "REGISTERED",
        "REFUSED",
        "REMOVED",
        "NEVER_REGISTERED",
        "DISCONTINUED",
      ])
    )
    .optional(),
  trademarkNumber: z.string().optional(),
  word: trademarkWord.optional(),
  wordPhrase: z.string().optional(),
});
const trademarkAdvancedRows = z.array(
  z.object({
    op: z.enum(["AND", "OR", "AND_NOT"]).optional(),
    query: trademarkAdvancedQuery,
  })
);
const patentSort = z.object({
  field: z
    .enum([
      "AGENT",
      "APPLICANT",
      "APPLICATION_NUMBER",
      "APPLICATION_STATUS",
      "EARLIEST_PRIORITY_DATE",
      "FILING_DATE",
      "FIRST_IPC_MARK",
      "INVENTION_TITLE",
      "INVENTOR",
      "PCT_NUMBER",
      "SERIAL_NUMBER",
      "WIPO_NUMBER",
    ])
    .optional(),
  direction: z.enum(["ASC", "DESC"]).optional(),
});

// Baked-in legal research, jurisdiction-gated via the registry: CourtListener
// (US) and IP Australia (AU). Only the providers active for the user's
// jurisdiction contribute tools.
export function buildResearchTools(
  { actor }: ToolContext,
  providerIds: Set<ProviderId>
): ToolSpec[] {
  const tools: ToolSpec[] = [];

  if (providerIds.has("courtlistener")) {
    tools.push(
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
          void recordCourtListenerCall({ userId: actor.userId });
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
          void recordCourtListenerCall({ userId: actor.userId });
          try {
            return await verifyCitations(token, citations as string[]);
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      }
    );
  }

  if (providerIds.has("ipaustralia")) {
    tools.push(
      {
        name: TOOL.searchTrademarks,
        description:
          "Search Australian trade marks (IP Australia) by word/name/number. Returns matching trade mark numbers.",
        schema: {
          query: z.string(),
          quickSearchType: z.array(z.enum(["WORD", "NAME", "NUMBER", "IR_NUMBER"])).optional(),
          status: z.array(trademarkStatus).optional(),
          changedSinceDate: z.string().optional(),
          sort: trademarkSort.optional(),
        },
        handler: async (args) => {
          if (!hasTrademarkCreds()) return NO_IPA_TRADEMARK_KEY;
          void recordIpAustraliaCall({ userId: actor.userId });
          try {
            return await searchTrademarks(args as { query: string });
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      },
      {
        name: TOOL.getTrademark,
        description: "Get a single Australian trade mark (IP Australia) by its trade mark number.",
        schema: { number: z.string() },
        handler: async ({ number }) => {
          if (!hasTrademarkCreds()) return NO_IPA_TRADEMARK_KEY;
          void recordIpAustraliaCall({ userId: actor.userId });
          try {
            return await getTrademark(number as string);
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      },
      {
        name: TOOL.searchTrademarksAdvanced,
        description:
          "Advanced Australian trade mark search (IP Australia). Supports word, phrase, owner, goods/services, class, date, number, IR number, ABN/ACN/ARBN, address for service, parties, image, kind, status, flags, and AND/OR/AND_NOT rows. Returns trade mark numbers.",
        schema: {
          rows: trademarkAdvancedRows,
          changedSinceDate: z.string().optional(),
          sort: trademarkSort.optional(),
        },
        handler: async (args) => {
          if (!hasTrademarkCreds()) return NO_IPA_TRADEMARK_KEY;
          void recordIpAustraliaCall({ userId: actor.userId });
          try {
            return await searchTrademarksAdvanced(args as { rows: unknown[] });
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      },
      {
        name: TOOL.pageTrademarksAdvanced,
        description:
          "Paged advanced Australian trade mark search (IP Australia). Same query shape as search_trademarks_advanced, but returns full trade mark records. Use pageSize <= 100.",
        schema: {
          rows: trademarkAdvancedRows,
          pageNumber: z.number().optional(),
          pageSize: z.number().optional(),
          changedSinceDate: z.string().optional(),
          sort: trademarkSort.optional(),
        },
        handler: async (args) => {
          if (!hasTrademarkCreds()) return NO_IPA_TRADEMARK_KEY;
          void recordIpAustraliaCall({ userId: actor.userId });
          try {
            return await pageTrademarksAdvanced(args as { rows: unknown[] });
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      },
      {
        name: TOOL.searchPatents,
        description:
          "Search Australian patents (IP Australia) by keyword. searchType 'ID' returns application numbers; 'DETAILS' returns basic records. Supports sort fields and searchMode from the IP Australia Patent Search API.",
        schema: {
          query: z.string(),
          searchType: z.enum(["ID", "DETAILS"]).optional(),
          pageSize: z.number().optional(),
          pageNumber: z.number().optional(),
          searchMode: z
            .enum([
              "ADVANCED_FULL_TEXT",
              "ADVANCED_NO_FULL_TEXT",
              "QUICK_ABSTRACT",
              "QUICK_NO_ABSTRACT",
            ])
            .optional(),
          sort: patentSort.optional(),
        },
        handler: async (args) => {
          if (!hasPatentCreds()) return NO_IPA_PATENT_KEY;
          void recordIpAustraliaCall({ userId: actor.userId });
          try {
            return await searchPatents(args as { query: string });
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      },
      {
        name: TOOL.getPatent,
        description:
          "Get a single Australian patent (IP Australia) by its Australian application number.",
        schema: { number: z.string() },
        handler: async ({ number }) => {
          if (!hasPatentCreds()) return NO_IPA_PATENT_KEY;
          void recordIpAustraliaCall({ userId: actor.userId });
          try {
            return await getPatent(number as string);
          } catch (e) {
            return { error: e instanceof Error ? e.message : "failed" };
          }
        },
      }
    );
  }

  return tools;
}
