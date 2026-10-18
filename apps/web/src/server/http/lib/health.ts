import { sql } from "@workspace/db/client";
import type { ReadinessReport } from "@workspace/contracts";

/**
 * Readiness probe: can we actually serve? A DB round-trip is required — its
 * failure makes us unready. PDF extraction runs in-process (pdf.js), so there's
 * no external extraction service to probe.
 */
export async function checkReadiness(release?: string): Promise<ReadinessReport> {
  const checks: Record<string, string> = {};
  let healthy = true;
  try {
    await sql`select 1`;
    checks.db = "up";
  } catch {
    checks.db = "down";
    healthy = false;
  }
  // This label permits deployment comparison. It does not attest the container
  // digest, applied migrations, or the independently deployed docs application.
  return { ok: healthy, checks, release: release?.trim() || null };
}

export async function readinessResponse(release?: string): Promise<Response> {
  const report = await checkReadiness(release);
  return Response.json(report, {
    status: report.ok ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
