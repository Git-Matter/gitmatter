import { inspectVersionWordBytes, wordInspectionSafety } from "./inspection.js";

/** Use the shared bounded Word inspection for practitioner review as well. */
export async function inspectDocxRevisions(
  bytes: Uint8Array,
  recorded?: unknown
): Promise<{ hasRevisions: boolean }> {
  const inspection = await inspectVersionWordBytes(Buffer.from(bytes), recorded);
  if (inspection.status !== "complete")
    throw new Error(
      inspection.reasons.includes("missing_body")
        ? "Word document part is missing; revision state cannot be verified"
        : "Word revision state cannot be verified"
    );
  return { hasRevisions: !wordInspectionSafety(inspection, []).safeClean };
}
