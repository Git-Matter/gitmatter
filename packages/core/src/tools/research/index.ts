import type { ProviderId } from "@workspace/registry";
import type { ToolContext, ToolSpec } from "../types.js";
import { buildCanliiTools } from "./canlii.js";
import { buildCourtListenerTools } from "./courtlistener.js";
import { buildEgovJapanTools } from "./egovjapan.js";
import { buildEurLexTools } from "./eurlex.js";
import { buildGovinfoTools } from "./govinfo.js";
import { buildIpAustraliaTools } from "./ipaustralia.js";
import { buildKoreaLawTools } from "./korealaw.js";
import { buildLegifranceTools } from "./legifrance.js";
import { buildRechtspraakTools } from "./rechtspraak.js";
import { buildUkLegislationTools } from "./uklegislation.js";

// Baked-in legal research, jurisdiction-gated via the registry. One module per
// provider; only the providers active for the user's jurisdiction contribute
// tools. Adding a provider: registry data edit + a module here + this map.
// The full Record makes a missing module a compile error, not a dead provider.
const BUILDERS: Record<ProviderId, (ctx: ToolContext) => ToolSpec[]> = {
  courtlistener: buildCourtListenerTools,
  ipaustralia: buildIpAustraliaTools,
  uklegislation: buildUkLegislationTools,
  eurlex: buildEurLexTools,
  egovjapan: buildEgovJapanTools,
  rechtspraak: buildRechtspraakTools,
  legifrance: buildLegifranceTools,
  canlii: buildCanliiTools,
  korealaw: buildKoreaLawTools,
  govinfo: buildGovinfoTools,
};

export function buildResearchTools(ctx: ToolContext, providerIds: Set<ProviderId>): ToolSpec[] {
  return [...providerIds].flatMap((id) =>
    BUILDERS[id](ctx).map((tool) => ({ ...tool, readOnly: true, openWorld: true }))
  );
}
