/**
 * One-time backfill: assign every matter-less artifact to its owner's default
 * matter, so matter_id can be flipped NOT NULL. Idempotent — safe to re-run; a
 * fresh deploy has no legacy rows and is a no-op. Run: bun packages/core/scripts/backfill-matters.ts
 */
import { eq, isNull } from "drizzle-orm";
import { db, sql } from "@workspace/db/client";
import { chats, contracts, documents, tabularReviews, user } from "@workspace/db/schema";
import { ensureDefaultMatter } from "../src/platform/matters.js";

const TABLES = [
  { name: "contracts", table: contracts },
  { name: "tabular_reviews", table: tabularReviews },
  { name: "documents", table: documents },
  { name: "chats", table: chats },
] as const;

const matterCache = new Map<string, string>();
async function defaultMatterFor(userId: string): Promise<string> {
  const cached = matterCache.get(userId);
  if (cached) return cached;
  const [u] = await db.select({ name: user.name }).from(user).where(eq(user.id, userId));
  const matterId = await ensureDefaultMatter(userId, u?.name ?? "User");
  matterCache.set(userId, matterId);
  return matterId;
}

for (const { name, table } of TABLES) {
  const rows = await db
    .select({ id: table.id, userId: table.userId })
    .from(table)
    .where(isNull(table.matterId));
  let n = 0;
  for (const row of rows) {
    if (!row.userId) continue;
    const matterId = await defaultMatterFor(row.userId);
    await db.update(table).set({ matterId }).where(eq(table.id, row.id));
    n++;
  }
  console.log(`${name}: backfilled ${n} row(s)`);
}

await sql.end();
console.log("done");
