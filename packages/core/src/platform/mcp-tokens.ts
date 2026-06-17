import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { mcpAccessTokens } from "@workspace/db/schema";
import { recordAudit } from "./audit.js";

// Emit at most one mcp_token.use audit event per token per this window.
const USE_AUDIT_THROTTLE_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a token. The plaintext is returned once; only its hash is stored. */
export async function mintMcpToken(userId: string, label: string): Promise<string> {
  const token = `gc_${randomBytes(32).toString("hex")}`;
  const [row] = await db
    .insert(mcpAccessTokens)
    .values({ userId, label, tokenHash: hashToken(token) })
    .returning({ id: mcpAccessTokens.id });
  void recordAudit({
    eventType: "mcp_token.mint",
    actorId: userId,
    target: row?.id,
    metadata: { label },
  });
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
  void recordAudit({ eventType: "mcp_token.revoke", actorId: userId, target: id });
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
  const now = new Date();
  await db.update(mcpAccessTokens).set({ lastUsedAt: now }).where(eq(mcpAccessTokens.id, row.id));
  // Throttle the audit row: resolveMcpToken runs on every MCP request, so emit at
  // most one "use" event per session window instead of one per tool call (which
  // would double writes on a hot path and grow audit_events unbounded). lastUsedAt
  // still records exact last use on every call.
  const lastUsed = row.lastUsedAt?.getTime() ?? 0;
  if (now.getTime() - lastUsed > USE_AUDIT_THROTTLE_MS) {
    void recordAudit({
      eventType: "mcp_token.use",
      actorId: row.userId,
      target: row.id,
      metadata: { label: row.label },
    });
  }
  return { userId: row.userId, label: row.label };
}
