import { asc, eq } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { practiceAreas } from "@workspace/db/schema";

// The starter set seeded into a user's list on first use. Formerly the hardcoded
// UI constant PRACTICE_OPTIONS (minus the "Others" sentinel, which inline-add
// replaces).
export const DEFAULT_PRACTICE_AREAS = [
  "General Transactions",
  "Corporate",
  "Finance",
  "Litigation",
  "Real Estate",
  "Tax",
  "Employment",
  "IP",
  "Competition",
  "Tech Transactions",
  "Project Finance",
  "EC/VC",
  "Private Equity",
  "Private Credit",
  "ECM",
  "DCM",
  "Lev Fin",
  "Arbitration",
] as const;

async function namesFor(userId: string): Promise<string[]> {
  const rows = await db
    .select({ name: practiceAreas.name })
    .from(practiceAreas)
    .where(eq(practiceAreas.userId, userId))
    .orderBy(asc(practiceAreas.name));
  return rows.map((r) => r.name);
}

/** A user's practice areas, name-sorted. Lazily seeds the defaults the first
 *  time the user has none. */
export async function listPracticeAreas(userId: string): Promise<string[]> {
  const existing = await namesFor(userId);
  if (existing.length) return existing;
  await db
    .insert(practiceAreas)
    .values(DEFAULT_PRACTICE_AREAS.map((name) => ({ userId, name })))
    .onConflictDoNothing();
  return namesFor(userId);
}

/** Add a practice area to the user's list (idempotent on name). Returns the
 *  trimmed name. */
export async function createPracticeArea(userId: string, name: string): Promise<string> {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Practice area name is required");
  await db.insert(practiceAreas).values({ userId, name: trimmed }).onConflictDoNothing();
  return trimmed;
}
