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
  searchUkLegislation: "search_uk_legislation",
  getUkLegislation: "get_uk_legislation",
  searchEuLaw: "search_eu_law",
  getEuLaw: "get_eu_law",
  searchJapanLaws: "search_japan_laws",
  getJapanLaw: "get_japan_law",
  searchDutchCaseLaw: "search_dutch_case_law",
  getDutchCaseLaw: "get_dutch_case_law",
  searchFrenchLaw: "search_french_law",
  getFrenchLaw: "get_french_law",
  searchCanadianCaseLaw: "search_canadian_case_law",
  getCanadianCase: "get_canadian_case",
  searchKoreanLaws: "search_korean_laws",
  getKoreanLaw: "get_korean_law",
  searchUsFederalLaw: "search_us_federal_law",
  getUsFederalPackage: "get_us_federal_package",
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
  [TOOL.searchUkLegislation]: {
    name: TOOL.searchUkLegislation,
    label: "Search UK legislation",
    summary: "Search UK statutes on legislation.gov.uk.",
    promptStarter: "Search UK legislation for ",
    traceLabel: "Searched UK legislation",
  },
  [TOOL.getUkLegislation]: {
    name: TOOL.getUkLegislation,
    label: "Get UK legislation",
    summary: "Get a UK act or section from legislation.gov.uk.",
    promptStarter: "Get the UK act ",
    traceLabel: "Read UK legislation",
  },
  [TOOL.searchEuLaw]: {
    name: TOOL.searchEuLaw,
    label: "Search EU law",
    summary: "Search EU legislation and case law on EUR-Lex.",
    promptStarter: "Search EU law for ",
    traceLabel: "Searched EU law",
  },
  [TOOL.getEuLaw]: {
    name: TOOL.getEuLaw,
    label: "Get EU law",
    summary: "Get an EU legal act from EUR-Lex by CELEX number.",
    promptStarter: "Get EU act CELEX ",
    traceLabel: "Read EU law",
  },
  [TOOL.searchJapanLaws]: {
    name: TOOL.searchJapanLaws,
    label: "Search Japanese laws",
    summary: "Search Japanese statutes on e-Gov.",
    promptStarter: "Search Japanese laws for ",
    traceLabel: "Searched Japanese laws",
  },
  [TOOL.getJapanLaw]: {
    name: TOOL.getJapanLaw,
    label: "Get Japanese law",
    summary: "Get a Japanese law's text from e-Gov by law ID.",
    promptStarter: "Get Japanese law ",
    traceLabel: "Read Japanese law",
  },
  [TOOL.searchDutchCaseLaw]: {
    name: TOOL.searchDutchCaseLaw,
    label: "Search Dutch case law",
    summary: "Search Dutch court decisions on rechtspraak.nl.",
    promptStarter: "Search Dutch case law for ",
    traceLabel: "Searched Dutch case law",
  },
  [TOOL.getDutchCaseLaw]: {
    name: TOOL.getDutchCaseLaw,
    label: "Get Dutch decision",
    summary: "Get a Dutch court decision by ECLI.",
    promptStarter: "Get Dutch decision ECLI ",
    traceLabel: "Read Dutch decision",
  },
  [TOOL.searchFrenchLaw]: {
    name: TOOL.searchFrenchLaw,
    label: "Search French law",
    summary: "Search French codes and statutes on Légifrance.",
    promptStarter: "Search French law for ",
    traceLabel: "Searched French law",
  },
  [TOOL.getFrenchLaw]: {
    name: TOOL.getFrenchLaw,
    label: "Get French law",
    summary: "Get a French code article or act from Légifrance.",
    promptStarter: "Get French law text ",
    traceLabel: "Read French law",
  },
  [TOOL.searchCanadianCaseLaw]: {
    name: TOOL.searchCanadianCaseLaw,
    label: "Search Canadian case law",
    summary: "Search Canadian court decisions on CanLII.",
    promptStarter: "Search Canadian case law for ",
    traceLabel: "Searched Canadian case law",
  },
  [TOOL.getCanadianCase]: {
    name: TOOL.getCanadianCase,
    label: "Get Canadian case",
    summary: "Get a Canadian decision's metadata and citations from CanLII.",
    promptStarter: "Get Canadian case ",
    traceLabel: "Read Canadian case",
  },
  [TOOL.searchKoreanLaws]: {
    name: TOOL.searchKoreanLaws,
    label: "Search Korean laws",
    summary: "Search Korean statutes on law.go.kr.",
    promptStarter: "Search Korean laws for ",
    traceLabel: "Searched Korean laws",
  },
  [TOOL.getKoreanLaw]: {
    name: TOOL.getKoreanLaw,
    label: "Get Korean law",
    summary: "Get a Korean law's text from law.go.kr.",
    promptStarter: "Get Korean law ",
    traceLabel: "Read Korean law",
  },
  [TOOL.searchUsFederalLaw]: {
    name: TOOL.searchUsFederalLaw,
    label: "Search US federal law",
    summary: "Search US federal statutes and documents on govinfo.",
    promptStarter: "Search US federal law for ",
    traceLabel: "Searched US federal law",
  },
  [TOOL.getUsFederalPackage]: {
    name: TOOL.getUsFederalPackage,
    label: "Get US federal package",
    summary: "Get a govinfo package's summary by package ID.",
    promptStarter: "Get govinfo package ",
    traceLabel: "Read US federal package",
  },
} satisfies Record<ToolName, ToolMeta>;

export function toolMeta(name: ToolName): ToolMeta {
  return TOOL_META[name];
}
