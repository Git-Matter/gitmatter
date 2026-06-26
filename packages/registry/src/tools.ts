// Tool-name catalog — the single source of truth for tool names. Both the
// provider metadata (providers.ts) and the backend handlers (core's catalog.ts)
// reference these constants, so a tool name cannot drift between the two sides:
// a typo there fails to compile instead of silently building a dead tool.

export const TOOL = {
  searchCaseLaw: "search_case_law",
  verifyCitations: "verify_citations",
  searchTrademarks: "search_trademarks",
  getTrademark: "get_trademark",
  searchTrademarksAdvanced: "search_trademarks_advanced",
  pageTrademarksAdvanced: "page_trademarks_advanced",
  searchPatents: "search_patents",
  getPatent: "get_patent",
} as const;

export type ToolName = (typeof TOOL)[keyof typeof TOOL];

export type ToolMeta = {
  name: ToolName;
  /** Short label for chips and compact UI. */
  label: string;
  /** One-sentence capability summary for settings/help surfaces. */
  summary: string;
  /** Natural-language starter inserted by the chat composer. */
  promptStarter: string;
  /** Past-tense label for assistant step timelines. */
  traceLabel: string;
};

export const TOOL_META = {
  [TOOL.searchCaseLaw]: {
    name: TOOL.searchCaseLaw,
    label: "Search case law",
    summary: "Search US case law opinions.",
    promptStarter: "Search case law for ",
    traceLabel: "Searched case law",
  },
  [TOOL.verifyCitations]: {
    name: TOOL.verifyCitations,
    label: "Verify citations",
    summary: "Verify/normalize reporter citations.",
    promptStarter: "Verify these citations: ",
    traceLabel: "Verified citations",
  },
  [TOOL.searchTrademarks]: {
    name: TOOL.searchTrademarks,
    label: "Search trade marks",
    summary: "Search Australian trade marks.",
    promptStarter: "Search Australian trade marks for ",
    traceLabel: "Searched trade marks",
  },
  [TOOL.getTrademark]: {
    name: TOOL.getTrademark,
    label: "Get trade mark",
    summary: "Get an Australian trade mark by number.",
    promptStarter: "Get Australian trade mark number ",
    traceLabel: "Read trade mark",
  },
  [TOOL.searchTrademarksAdvanced]: {
    name: TOOL.searchTrademarksAdvanced,
    label: "Advanced trade mark search",
    summary: "Advanced Australian trade mark search.",
    promptStarter: "Run an advanced Australian trade mark search for ",
    traceLabel: "Searched trade marks",
  },
  [TOOL.pageTrademarksAdvanced]: {
    name: TOOL.pageTrademarksAdvanced,
    label: "Trade mark records",
    summary: "Paged Australian trade mark records.",
    promptStarter: "Find full Australian trade mark records for ",
    traceLabel: "Read trade mark records",
  },
  [TOOL.searchPatents]: {
    name: TOOL.searchPatents,
    label: "Search patents",
    summary: "Search Australian patents.",
    promptStarter: "Search Australian patents for ",
    traceLabel: "Searched patents",
  },
  [TOOL.getPatent]: {
    name: TOOL.getPatent,
    label: "Get patent",
    summary: "Get an Australian patent by application number.",
    promptStarter: "Get Australian patent application number ",
    traceLabel: "Read patent",
  },
} satisfies Record<ToolName, ToolMeta>;

export function toolMeta(name: ToolName): ToolMeta {
  return TOOL_META[name];
}
