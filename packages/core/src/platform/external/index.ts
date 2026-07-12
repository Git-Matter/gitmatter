export * from "./ipaustralia.js";
export * from "./courtlistener.js";
// uklegislation and rechtspraak both export a parseAtomEntries test helper;
// re-export only their public client surface to avoid the name clash.
export { searchUkLegislation, getUkLegislation, type UkLegislationEntry } from "./uklegislation.js";
export {
  searchDutchCaseLaw,
  getDutchCaseLaw,
  type RechtspraakSearchArgs,
  type RechtspraakEntry,
} from "./rechtspraak.js";
export * from "./eurlex.js";
export * from "./egovjapan.js";
export * from "./legifrance.js";
export * from "./canlii.js";
export * from "./korealaw.js";
export * from "./govinfo.js";
