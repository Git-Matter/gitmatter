import { sql } from "@workspace/db/client";

export type ReadinessReport = { ok: boolean; checks: Record<string, string> };

/**
 * Readiness probe: can we actually serve? A DB round-trip is required — its
 * failure makes us unready. PDF extraction runs in-process (pdf.js), so there's
 * no external extraction service to probe.
 */
export async function checkReadiness(): Promise<ReadinessReport> {
  const checks: Record<string, string> = {};
  let healthy = true;
  try {
    await sql`select 1`;
    checks.db = "up";
  } catch {
    checks.db = "down";
    healthy = false;
  }
  return { ok: healthy, checks };
}
