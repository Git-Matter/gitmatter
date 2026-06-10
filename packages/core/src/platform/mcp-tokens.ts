import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { mcpAccessTokens } from "@workspace/db/schema";

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a token. The plaintext is returned once; only its hash is stored. */
export async function mintMcpToken(userId: string, label: string): Promise<string> {
  const token = `gc_${randomBytes(32).toString("hex")}`;
  await db.insert(mcpAccessTokens).values({ userId, label, tokenHash: hashToken(token) });
  return token;
}

export async function listMcpTokens(userId: string) {
  return db
    .select({
      id: mcpAccessTokens.id,
      label: mcpAccessTokens.label,
      createdAt: mcpAccessTokens.createdAt,
      lastUsedAt: mcpAccessTokens.lastUsedAt,
      revokedAt: mcpAccessTokens.revokedAt,
    })
    .from(mcpAccessTokens)
    .where(eq(mcpAccessTokens.userId, userId))
    .orderBy(desc(mcpAccessTokens.createdAt));
}

export async function revokeMcpToken(userId: string, id: string) {
  await db
    .update(mcpAccessTokens)
    .set({ revokedAt: new Date() })
    .where(and(eq(mcpAccessTokens.id, id), eq(mcpAccessTokens.userId, userId)));
}

/** Resolve a bearer token to the gitcounsel user it was minted by. */
export async function resolveMcpToken(
  token: string
): Promise<{ userId: string; label: string } | null> {
  const [row] = await db
    .select()
    .from(mcpAccessTokens)
    .where(and(eq(mcpAccessTokens.tokenHash, hashToken(token)), isNull(mcpAccessTokens.revokedAt)));
  if (!row) return null;
  await db
    .update(mcpAccessTokens)
    .set({ lastUsedAt: new Date() })
    .where(eq(mcpAccessTokens.id, row.id));
  return { userId: row.userId, label: row.label };
}
