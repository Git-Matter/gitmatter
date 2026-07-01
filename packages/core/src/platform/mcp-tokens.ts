import { createHash, randomBytes } from "node:crypto";
import { and, desc, eq, isNull } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { type MatterRole, mcpAccessTokens, user, userSettings } from "@workspace/db/schema";
import type { TokenScope } from "../core/commit.js";
import { recordAudit } from "./audit.js";

// Emit at most one mcp_token.use audit event per token per this window. Also
// gates the lastUsedAt write, so a busy token isn't written on every request.
const USE_AUDIT_THROTTLE_MS = 5 * 60 * 1000;

export function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

/** Mint a token. The plaintext is returned once; only its hash is stored.
 *  An omitted/empty scope mints an unscoped token (full power of the user). */
export async function mintMcpToken(
  userId: string,
  label: string,
  scope?: { allowedMatterIds?: string[] | null; maxRole?: MatterRole | null }
): Promise<string> {
  const token = `gc_${randomBytes(32).toString("hex")}`;
  const allowedMatterIds = scope?.allowedMatterIds?.length ? scope.allowedMatterIds : null;
  const maxRole = scope?.maxRole ?? null;
  const [row] = await db
    .insert(mcpAccessTokens)
    .values({ userId, label, tokenHash: hashToken(token), allowedMatterIds, maxRole })
    .returning({ id: mcpAccessTokens.id });
  void recordAudit({
    eventType: "mcp_token.mint",
    actorId: userId,
    target: row?.id,
    metadata: { label, matterCount: allowedMatterIds?.length ?? null, maxRole },
  });
  return token;
}

export async function listMcpTokens(userId: string) {
  return db
    .select({
      id: mcpAccessTokens.id,
      label: mcpAccessTokens.label,
      allowedMatterIds: mcpAccessTokens.allowedMatterIds,
      maxRole: mcpAccessTokens.maxRole,
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

/** Resolve a bearer token to the gitmatter user it was minted by. `tokenId` is
 *  the token's row id, so per-token metering can attribute usage to it. */
export async function resolveMcpToken(
  token: string
): Promise<{ tokenId: string; userId: string; label: string } | null> {
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
  return { tokenId: row.id, userId: row.userId, label: row.label };
}

export type McpAccount = {
  tokenId: string;
  userId: string;
  label: string;
  tenantId: string | null;
  jurisdiction: string | null;
  /** Least-privilege restriction minted into the token; null = unscoped. */
  scope: TokenScope | null;
};

// Short-lived cache of resolved accounts, keyed by token hash. A connected client
// makes many calls per minute; without this each one re-runs the lookup. On a
// global so a dev HMR reload keeps the cache. Trade-off: a revoked token keeps
// working until its entry expires (≤ CACHE_TTL_MS).
const CACHE_TTL_MS = 60 * 1000;
const CACHE = Symbol.for("gitmatter.mcpAccountCache");
const gCache = globalThis as Record<
  symbol,
  Map<string, { account: McpAccount; expiresAt: number }> | undefined
>;
const accountCache = (gCache[CACHE] ??= new Map());

/**
 * Resolve a static MCP token to its full account — tokenId, user, tenant, and
 * jurisdiction — in ONE joined query (token → user → settings), cached briefly.
 * This replaces the old hot path that ran three separate reads (token lookup,
 * then jurisdiction, then tenant). Last-use is recorded out of band and
 * throttled, so a busy token no longer triggers a write on every request.
 */
export async function resolveMcpAccount(token: string): Promise<McpAccount | null> {
  const hash = hashToken(token);
  const now = Date.now();
  const cached = accountCache.get(hash);
  if (cached && cached.expiresAt > now) return cached.account;

  const [row] = await db
    .select({
      tokenId: mcpAccessTokens.id,
      userId: mcpAccessTokens.userId,
      label: mcpAccessTokens.label,
      allowedMatterIds: mcpAccessTokens.allowedMatterIds,
      maxRole: mcpAccessTokens.maxRole,
      lastUsedAt: mcpAccessTokens.lastUsedAt,
      tenantId: user.tenantId,
      jurisdiction: userSettings.jurisdiction,
    })
    .from(mcpAccessTokens)
    .innerJoin(user, eq(user.id, mcpAccessTokens.userId))
    .leftJoin(userSettings, eq(userSettings.userId, mcpAccessTokens.userId))
    .where(and(eq(mcpAccessTokens.tokenHash, hash), isNull(mcpAccessTokens.revokedAt)));
  if (!row) return null;

  const account: McpAccount = {
    tokenId: row.tokenId,
    userId: row.userId,
    label: row.label,
    tenantId: row.tenantId,
    jurisdiction: row.jurisdiction,
    scope:
      row.allowedMatterIds || row.maxRole
        ? { matterIds: row.allowedMatterIds ?? null, maxRole: row.maxRole ?? null }
        : null,
  };
  accountCache.set(hash, { account, expiresAt: now + CACHE_TTL_MS });

  // Record use out of band, throttled: skip both the write and the audit unless
  // it has been longer than the window since this token last recorded use. Keeps
  // lastUsedAt approximately fresh (±window) without a write on every request.
  const lastUsed = row.lastUsedAt?.getTime() ?? 0;
  if (now - lastUsed > USE_AUDIT_THROTTLE_MS) {
    void Promise.resolve(
      db
        .update(mcpAccessTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(mcpAccessTokens.id, row.tokenId))
    ).catch(() => {});
    void recordAudit({
      eventType: "mcp_token.use",
      actorId: row.userId,
      target: row.tokenId,
      metadata: { label: row.label },
    });
  }
  return account;
}
