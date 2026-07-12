// Jurisdiction codes and resolution. No provider/tool knowledge lives here.

/** ISO-ish jurisdiction code. "US" is federal; "US-NY" etc. are sub-jurisdictions. */
export type Jurisdiction = string;

/** Known jurisdictions, for UI selectors. Extend freely. */
export const JURISDICTIONS: { code: Jurisdiction; label: string }[] = [
  { code: "US", label: "United States (Federal)" },
  { code: "US-NY", label: "United States — New York" },
  { code: "US-CA", label: "United States — California" },
  { code: "US-DE", label: "United States — Delaware" },
  { code: "EU", label: "European Union" },
  { code: "UK", label: "United Kingdom" },
  { code: "AU", label: "Australia" },
  { code: "CA", label: "Canada" },
  { code: "FR", label: "France" },
  { code: "NL", label: "Netherlands" },
  { code: "JP", label: "Japan" },
  { code: "KR", label: "South Korea" },
];

export const DEFAULT_JURISDICTION: Jurisdiction = "US";

/** Does a provider pattern cover a target jurisdiction? "US" covers "US-NY"; "*" covers all. */
export function jurisdictionMatches(pattern: Jurisdiction, target: Jurisdiction): boolean {
  if (pattern === "*" || pattern === target) return true;
  if (pattern.endsWith("-*")) return target.startsWith(pattern.slice(0, -1));
  // Federal/country code covers its sub-jurisdictions ("US" -> "US-NY").
  return target.startsWith(`${pattern}-`);
}

/** Resolve effective jurisdiction: artifact overrides user default overrides system default. */
export function resolveJurisdiction(
  artifact?: Jurisdiction | null,
  userDefault?: Jurisdiction | null
): Jurisdiction {
  return artifact || userDefault || DEFAULT_JURISDICTION;
}
