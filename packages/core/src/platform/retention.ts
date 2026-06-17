import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import {
  auditEvents,
  chats,
  mcpAccessTokens,
  oauthAccessTokens,
  oauthAuthCodes,
} from "@workspace/db/schema";
import { getEnv } from "../core/config.js";

// Retention purges. Each window is env-configurable; an explicit window of 0
// disables that purge (keep forever). All are idempotent and safe to run on boot
// + on a schedule, mirroring purgeExpiredDocuments.

// Resolve a retention window. Unset or empty → the default (NOT 0: an empty env
// var must never collapse the window to "purge everything older than now"). An
// explicit numeric value (incl. 0 = disabled) is honored; a non-numeric value
// falls back to the default.
function retentionDays(name: string, fallback: number): number {
  const raw = getEnv(name);
  if (raw == null || raw.trim() === "") return fallback;
  const v = Number(raw);
  return Number.isFinite(v) && v >= 0 ? v : fallback;
}

function olderThan(days: number) {
  return sql`now() - interval '${sql.raw(String(days))} days'`;
}

/**
 * Purge dead auth/token records: expired OAuth auth codes (always), plus OAuth
 * access tokens and static MCP tokens revoked longer ago than the retention
 * window. Live tokens (null revokedAt) are never touched; access-token rows are
 * kept while only their access token has expired, since the row also backs the
 * still-valid refresh token.
 */
export async function purgeExpiredTokens(): Promise<void> {
  const days = retentionDays("TOKEN_RETENTION_DAYS", 30);

  // Expired auth codes are dead once expired — always purged, independent of the
  // revoked-token window.
  await db.delete(oauthAuthCodes).where(lt(oauthAuthCodes.expiresAt, sql`now()`));

  // A 0 (or negative) window disables revoked-token purging (keep forever).
  if (days <= 0) return;

  await db
    .delete(oauthAccessTokens)
    .where(
      and(isNotNull(oauthAccessTokens.revokedAt), lt(oauthAccessTokens.revokedAt, olderThan(days)))
    );

  await db
    .delete(mcpAccessTokens)
    .where(
      and(isNotNull(mcpAccessTokens.revokedAt), lt(mcpAccessTokens.revokedAt, olderThan(days)))
    );
}

/** Purge audit events older than the retention window (default 365 days; 0 = off). */
export async function purgeOldAuditEvents(): Promise<void> {
  const days = retentionDays("AUDIT_RETENTION_DAYS", 365);
  if (days <= 0) return;
  await db.delete(auditEvents).where(lt(auditEvents.createdAt, olderThan(days)));
}

/**
 * Purge non-pinned chats inactive longer than the retention window. Default 0
 * (disabled — keep chat history forever); set CHAT_RETENTION_DAYS to enable.
 * chat_messages cascade-delete with their chat. Pinned chats are never purged.
 */
export async function purgeOldChats(): Promise<void> {
  const days = retentionDays("CHAT_RETENTION_DAYS", 0);
  if (days <= 0) return;
  await db.delete(chats).where(and(eq(chats.pinned, false), lt(chats.updatedAt, olderThan(days))));
}
