// 국가법령정보센터 (law.go.kr) Open API client — Korean statutes. Free access,
// but every request needs an "OC" credential (the local-part of the email the
// caller registered at open.law.go.kr), passed as an OC query param. Bring your
// own OC (each user supplies theirs in Settings → Legal research), with an
// optional shared server-env fallback (KOREALAW_OC) for self-hosted instances.

import { fetchWithTimeout } from "../../core/fetch.js";
import { getEnv } from "../../core/config.js";
import { getUserApiKey } from "../../core/keys.js";

const BASE = "https://www.law.go.kr/DRF";

/** Cap on plain-text output returned to the model. */
const MAX_TEXT_CHARS = 8_000;

/** Max results per search (the API's display param). */
const MAX_DISPLAY = 20;

/** User's own law.go.kr OC, else the shared server-env OC, else null. */
export async function resolveKoreaLawOc(userId: string): Promise<string | null> {
  const userKey = await getUserApiKey(userId, "korealaw");
  if (userKey) return userKey;
  return getEnv("KOREALAW_OC")?.trim() || null;
}

// The API sometimes answers an invalid OC or bad request with an HTML error
// page and HTTP 200. Detect a non-JSON body and throw a clear error instead of
// letting JSON.parse produce a cryptic one. Never echo the OC back in errors —
// it is a credential and the failing URL contains it.
async function kFetch(oc: string, path: string, params: Record<string, string>): Promise<unknown> {
  const search = new URLSearchParams({ OC: oc, type: "JSON", ...params });
  const res = await fetchWithTimeout(`${BASE}${path}?${search.toString()}`, {
    headers: { Accept: "application/json" },
    timeoutMs: 30_000,
  });
  const body = await res.text();
  if (!res.ok) {
    throw new Error(`law.go.kr error (${res.status}): ${body.slice(0, 200)}`);
  }
  const trimmed = body.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) {
    throw new Error(
      "law.go.kr returned a non-JSON response (likely an HTML error page — check that the OC credential is registered at open.law.go.kr)."
    );
  }
  return JSON.parse(trimmed) as unknown;
}

/** The API nests single results as a bare object instead of a one-element array. */
function toArray<T>(value: T | T[] | undefined | null): T[] {
  if (value == null) return [];
  return Array.isArray(value) ? value : [value];
}

type Rec = Record<string, unknown>;

const str = (v: unknown): string | undefined => (typeof v === "string" ? v : undefined);

export async function searchKoreanLaws(oc: string, args: { query: string; limit?: number }) {
  const display = Math.min(Math.max(args.limit ?? 10, 1), MAX_DISPLAY);
  const data = (await kFetch(oc, "/lawSearch.do", {
    target: "law",
    query: args.query,
    display: String(display),
  })) as { LawSearch?: { law?: Rec | Rec[] } };
  const results = toArray(data.LawSearch?.law).map((r) => ({
    lawId: str(r["법령ID"]),
    name: str(r["법령명한글"]),
    lawNumber: str(r["법령번호"]),
    promulgationDate: str(r["공포일자"]),
    enforcementDate: str(r["시행일자"]),
    link: str(r["법령상세링크"]),
  }));
  return { query: args.query, results };
}

/** Recursively collect article text: any string under a key ending in 내용 (content). */
function collectText(node: unknown, out: string[]): void {
  if (node == null) return;
  if (Array.isArray(node)) {
    for (const item of node) collectText(item, out);
    return;
  }
  if (typeof node === "object") {
    for (const [key, value] of Object.entries(node as Rec)) {
      if (key.endsWith("내용")) {
        if (typeof value === "string") out.push(value.trim());
        else collectText(value, out);
      } else {
        collectText(value, out);
      }
    }
  }
}

export async function getKoreanLaw(oc: string, args: { lawId: string }) {
  const data = (await kFetch(oc, "/lawService.do", {
    target: "law",
    ID: args.lawId,
  })) as { 법령?: Rec };
  const law = data["법령"] ?? {};
  const basic = (law["기본정보"] ?? {}) as Rec;
  const name = str(basic["법령명_한글"]) ?? str(basic["법령명한글"]) ?? str(law["법령명한글"]);
  // Articles live under 법령.조문.조문단위 (조문 units); flatten to plain text.
  const parts: string[] = [];
  collectText(law["조문"], parts);
  const text = parts
    .filter(Boolean)
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  const truncated = text.length > MAX_TEXT_CHARS;
  return {
    lawId: args.lawId,
    name,
    text: truncated ? text.slice(0, MAX_TEXT_CHARS) : text,
    truncated,
    ...(truncated ? { note: `Text truncated to ${MAX_TEXT_CHARS} characters.` } : {}),
  };
}
