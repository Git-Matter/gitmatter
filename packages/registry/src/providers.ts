// Tool providers and the jurisdiction -> provider/tool queries. Pure data + pure
// functions, imported by BOTH the backend (to decide which tools to build) and
// the frontend (to show which tools are available). Adding a provider is a data
// edit here plus its handlers in core's catalog.ts.

import { type Jurisdiction, jurisdictionMatches } from "./jurisdiction.js";
import { TOOL, TOOL_META, type ToolMeta } from "./tools.js";

export const SOURCE_IDS = [
  "courtlistener",
  "ipaustralia",
  "uklegislation",
  "eurlex",
  "egovjapan",
  "rechtspraak",
  "legifrance",
  "canlii",
  "korealaw",
  "govinfo",
] as const;

export type ProviderId = (typeof SOURCE_IDS)[number];
export type SourceId = ProviderId;

export type ToolProvider = {
  id: ProviderId;
  name: string;
  /** Patterns this provider serves: exact ("US-NY"), prefix ("US" matches US-*), or "*" (any). */
  jurisdictions: Jurisdiction[];
  tools: ToolMeta[];
};

export const PROVIDERS: ToolProvider[] = [
  {
    id: "courtlistener",
    name: "CourtListener",
    jurisdictions: ["US"], // federal -> also serves US-* sub-jurisdictions
    // Baked into the gitmatter backend (not a consumed sidecar). Exposed as our
    // own tools over our MCP server and in chat; gated to US jurisdictions.
    tools: [TOOL_META[TOOL.searchCaseLaw], TOOL_META[TOOL.verifyCitations]],
  },
  {
    id: "ipaustralia",
    name: "IP Australia",
    jurisdictions: ["AU"],
    // Baked into the gitmatter backend (like CourtListener). Read-only patent and
    // trade mark search over our MCP server and in chat; gated to AU.
    tools: [
      TOOL_META[TOOL.searchTrademarks],
      TOOL_META[TOOL.getTrademark],
      TOOL_META[TOOL.searchTrademarksAdvanced],
      TOOL_META[TOOL.pageTrademarksAdvanced],
      TOOL_META[TOOL.searchPatents],
      TOOL_META[TOOL.getPatent],
    ],
  },
  {
    id: "govinfo",
    name: "govinfo (US GPO)",
    jurisdictions: ["US"],
    // US federal statutes and documents via the GPO govinfo API.
    tools: [TOOL_META[TOOL.searchUsFederalLaw], TOOL_META[TOOL.getUsFederalPackage]],
  },
  {
    id: "uklegislation",
    name: "legislation.gov.uk",
    jurisdictions: ["UK"],
    // UK statute book, official open API (no key).
    tools: [TOOL_META[TOOL.searchUkLegislation], TOOL_META[TOOL.getUkLegislation]],
  },
  {
    id: "eurlex",
    name: "EUR-Lex",
    jurisdictions: ["EU"],
    // EU legislation and case law via the Publications Office endpoints.
    tools: [TOOL_META[TOOL.searchEuLaw], TOOL_META[TOOL.getEuLaw]],
  },
  {
    id: "legifrance",
    name: "Légifrance",
    jurisdictions: ["FR"],
    // French codes/statutes via the PISTE API (server-env OAuth credentials).
    tools: [TOOL_META[TOOL.searchFrenchLaw], TOOL_META[TOOL.getFrenchLaw]],
  },
  {
    id: "rechtspraak",
    name: "de Rechtspraak",
    jurisdictions: ["NL"],
    // Dutch court decisions, official open data API (no key).
    tools: [TOOL_META[TOOL.searchDutchCaseLaw], TOOL_META[TOOL.getDutchCaseLaw]],
  },
  {
    id: "canlii",
    name: "CanLII",
    jurisdictions: ["CA"],
    // Canadian case law metadata; bring-your-own CanLII API key.
    tools: [TOOL_META[TOOL.searchCanadianCaseLaw], TOOL_META[TOOL.getCanadianCase]],
  },
  {
    id: "egovjapan",
    name: "e-Gov 法令検索",
    jurisdictions: ["JP"],
    // Japanese statutes via the e-Gov Law API v2 (no key).
    tools: [TOOL_META[TOOL.searchJapanLaws], TOOL_META[TOOL.getJapanLaw]],
  },
  {
    id: "korealaw",
    name: "국가법령정보센터 (law.go.kr)",
    jurisdictions: ["KR"],
    // Korean statutes via the law.go.kr Open API (bring-your-own OC key).
    tools: [TOOL_META[TOOL.searchKoreanLaws], TOOL_META[TOOL.getKoreanLaw]],
  },
];

export function sourcesFor(jurisdiction: Jurisdiction): ToolProvider[] {
  return PROVIDERS.filter((p) =>
    p.jurisdictions.some((pat) => jurisdictionMatches(pat, jurisdiction))
  );
}

export const providersFor = sourcesFor;

export function toolsFor(jurisdiction: Jurisdiction): Array<ToolMeta & { providerId: ProviderId }> {
  return sourcesFor(jurisdiction).flatMap((p) => p.tools.map((t) => ({ ...t, providerId: p.id })));
}
