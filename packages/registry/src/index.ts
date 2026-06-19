// Shared jurisdiction -> tool-provider contract. Pure data + pure functions,
// imported by BOTH the backend (to decide which MCP servers to connect) and the
// frontend (to show which tools are available). Adding a provider is a data edit.

/** ISO-ish jurisdiction code. "US" is federal; "US-NY" etc. are sub-jurisdictions. */
export type Jurisdiction = string;

export type Capability = "case_law" | "citation_check" | "doc_extract" | "statutes" | "filings";

export type ToolMeta = { name: string; summary: string };

export type ToolProvider = {
  id: string;
  name: string;
  /** Patterns this provider serves: exact ("US-NY"), prefix ("US" matches US-*), or "*" (any). */
  jurisdictions: Jurisdiction[];
  transport: "mcp-http" | "internal";
  /** Env var holding the server URL (for mcp-http providers). */
  urlEnv?: string;
  authType: "none" | "bearer" | "header";
  capabilities: Capability[];
  tools: ToolMeta[];
};

/** Known jurisdictions, for UI selectors. Extend freely. */
export const JURISDICTIONS: { code: Jurisdiction; label: string }[] = [
  { code: "US", label: "United States (Federal)" },
  { code: "US-NY", label: "United States — New York" },
  { code: "US-CA", label: "United States — California" },
  { code: "US-DE", label: "United States — Delaware" },
  { code: "EU", label: "European Union" },
  { code: "UK", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
];

export const DEFAULT_JURISDICTION: Jurisdiction = "US";

export const PROVIDERS: ToolProvider[] = [
  {
    id: "courtlistener",
    name: "CourtListener",
    jurisdictions: ["US"], // federal -> also serves US-* sub-jurisdictions
    // Baked into the gitmatter backend (not a consumed sidecar). Exposed as our
    // own tools over our MCP server and in chat; gated to US jurisdictions.
    transport: "internal",
    authType: "none",
    capabilities: ["case_law", "citation_check"],
    tools: [
      { name: "search_case_law", summary: "Search US case law opinions." },
      { name: "verify_citations", summary: "Verify/normalize reporter citations." },
    ],
  },
  {
    id: "docling",
    name: "Docling",
    jurisdictions: ["*"], // document extraction is jurisdiction-agnostic
    // Called directly by the gitmatter backend over its REST API (docling-serve),
    // not connected as a consumed MCP server.
    transport: "internal",
    authType: "none",
    capabilities: ["doc_extract"],
    tools: [{ name: "convert_to_markdown", summary: "Convert a document to markdown." }],
  },
];

/** Does a provider pattern cover a target jurisdiction? "US" covers "US-NY"; "*" covers all. */
export function jurisdictionMatches(pattern: Jurisdiction, target: Jurisdiction): boolean {
  if (pattern === "*" || pattern === target) return true;
  if (pattern.endsWith("-*")) return target.startsWith(pattern.slice(0, -1));
  // Federal/country code covers its sub-jurisdictions ("US" -> "US-NY").
  return target.startsWith(`${pattern}-`);
}

export function providersFor(jurisdiction: Jurisdiction): ToolProvider[] {
  return PROVIDERS.filter((p) =>
    p.jurisdictions.some((pat) => jurisdictionMatches(pat, jurisdiction))
  );
}

export function toolsFor(jurisdiction: Jurisdiction): Array<ToolMeta & { providerId: string }> {
  return providersFor(jurisdiction).flatMap((p) =>
    p.tools.map((t) => ({ ...t, providerId: p.id }))
  );
}

/** Resolve effective jurisdiction: artifact overrides user default overrides system default. */
export function resolveJurisdiction(
  artifact?: Jurisdiction | null,
  userDefault?: Jurisdiction | null
): Jurisdiction {
  return artifact || userDefault || DEFAULT_JURISDICTION;
}
