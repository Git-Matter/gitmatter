// Tool providers and the jurisdiction -> provider/tool queries. Pure data + pure
// functions, imported by BOTH the backend (to decide which tools to build) and
// the frontend (to show which tools are available). Adding a provider is a data
// edit here plus its handlers in core's catalog.ts.

import { type Jurisdiction, jurisdictionMatches } from "./jurisdiction.js";
import { TOOL, TOOL_META, type ToolMeta } from "./tools.js";

export const SOURCE_IDS = ["courtlistener", "ipaustralia"] as const;

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
