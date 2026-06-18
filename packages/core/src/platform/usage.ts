import { and, eq, gte, isNotNull, type SQL, sql } from "drizzle-orm";
import { db } from "@workspace/db/client";
import { documentVersions, documents, type UsageKind, usageEvents } from "@workspace/db/schema";
import { getEnvNumber } from "../core/config.js";
import { logEvent } from "../core/log.js";
import { recordAudit } from "./audit.js";

// Spending meter. Each metered action appends a usage_events row, then the
// relevant budgets are summed over a rolling window. Enforcement is LOG-ONLY:
// going over budget emits a structured `budget.exceeded` log + audit row, but
// never rejects the action. A budget env unset or <= 0 disables that check.
// Everything is best-effort — metering must never break the action it observes.

const windowMinutes = () => getEnvNumber("BUDGET_WINDOW_MINUTES", 60);
const since = (minutes: number) => new Date(Date.now() - minutes * 60_000);

async function flag(
  scope: string,
  who: { actorId?: string | null; tenantId?: string | null },
  detail: Record<string, unknown>
): Promise<void> {
  logEvent("warn", "budget.exceeded", { scope, ...who, ...detail });
  await recordAudit({
    eventType: "budget.exceeded",
    actorId: who.actorId ?? null,
    tenantId: who.tenantId ?? null,
    metadata: { scope, ...detail },
  });
}

/** Sum input+output tokens for LLM rows matching `scope` within the window. */
async function sumLlmTokens(scope: SQL, after: Date): Promise<number> {
  const [row] = await db
    .select({
      total: sql<number>`coalesce(sum(coalesce(${usageEvents.inputTokens}, 0) + coalesce(${usageEvents.outputTokens}, 0)), 0)`,
    })
    .from(usageEvents)
    .where(and(eq(usageEvents.kind, "llm"), scope, gte(usageEvents.createdAt, after)));
  return Number(row?.total ?? 0);
}

/** Count rows of a kind matching `scope` within the window. */
async function countInWindow(kind: UsageKind, scope: SQL, after: Date): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${usageEvents.count}), 0)` })
    .from(usageEvents)
    .where(and(eq(usageEvents.kind, kind), scope, gte(usageEvents.createdAt, after)));
  return Number(row?.total ?? 0);
}

/** Record one LLM completion's token usage and check per-user/per-tenant budgets. */
export async function recordLlmUsage(e: {
  userId: string;
  tenantId?: string | null;
  provider?: string | null;
  model?: string | null;
  inputTokens?: number;
  outputTokens?: number;
}): Promise<void> {
  try {
    await db.insert(usageEvents).values({
      kind: "llm",
      userId: e.userId,
      tenantId: e.tenantId ?? null,
      provider: e.provider ?? null,
      model: e.model ?? null,
      inputTokens: e.inputTokens ?? 0,
      outputTokens: e.outputTokens ?? 0,
    });
    const after = since(windowMinutes());
    const userBudget = getEnvNumber("USER_LLM_TOKEN_BUDGET", 0);
    if (userBudget > 0) {
      const used = await sumLlmTokens(eq(usageEvents.userId, e.userId), after);
      if (used > userBudget)
        await flag(
          "user_llm",
          { actorId: e.userId, tenantId: e.tenantId },
          { used, budget: userBudget }
        );
    }
    const tenantBudget = getEnvNumber("TENANT_LLM_TOKEN_BUDGET", 0);
    if (tenantBudget > 0 && e.tenantId) {
      const used = await sumLlmTokens(eq(usageEvents.tenantId, e.tenantId), after);
      if (used > tenantBudget)
        await flag(
          "tenant_llm",
          { actorId: e.userId, tenantId: e.tenantId },
          { used, budget: tenantBudget }
        );
    }
  } catch {
    // best-effort: never let metering break a completed LLM call
  }
}

/** Record one MCP tool call and check the per-token call budget. */
export async function recordToolCall(e: {
  tokenId?: string | null;
  userId: string;
  tenantId?: string | null;
  tool: string;
}): Promise<void> {
  try {
    await db.insert(usageEvents).values({
      kind: "tool",
      userId: e.userId,
      tenantId: e.tenantId ?? null,
      tokenId: e.tokenId ?? null,
      tool: e.tool,
    });
    const budget = getEnvNumber("MCP_TOKEN_CALL_BUDGET", 0);
    if (budget > 0 && e.tokenId) {
      const used = await countInWindow(
        "tool",
        eq(usageEvents.tokenId, e.tokenId),
        since(windowMinutes())
      );
      if (used > budget)
        await flag(
          "mcp_token",
          { actorId: e.userId, tenantId: e.tenantId },
          { tokenId: e.tokenId, used, budget }
        );
    }
  } catch {
    // best-effort
  }
}

/** Record one CourtListener request and check the per-user per-minute budget. */
export async function recordCourtListenerCall(e: {
  userId: string;
  tenantId?: string | null;
}): Promise<void> {
  try {
    await db
      .insert(usageEvents)
      .values({ kind: "courtlistener", userId: e.userId, tenantId: e.tenantId ?? null });
    const budget = getEnvNumber("COURTLISTENER_CALL_BUDGET_PER_MIN", 0);
    if (budget > 0) {
      const used = await countInWindow("courtlistener", eq(usageEvents.userId, e.userId), since(1));
      if (used > budget)
        await flag("courtlistener", { actorId: e.userId, tenantId: e.tenantId }, { used, budget });
    }
  } catch {
    // best-effort
  }
}

/** Record one extraction job and check the per-user queue budget. */
export async function recordExtraction(e: {
  userId: string;
  tenantId?: string | null;
}): Promise<void> {
  try {
    await db
      .insert(usageEvents)
      .values({ kind: "extraction", userId: e.userId, tenantId: e.tenantId ?? null });
    const budget = getEnvNumber("EXTRACTION_QUEUE_BUDGET", 0);
    if (budget > 0) {
      const used = await countInWindow(
        "extraction",
        eq(usageEvents.userId, e.userId),
        since(windowMinutes())
      );
      if (used > budget)
        await flag("extraction", { actorId: e.userId, tenantId: e.tenantId }, { used, budget });
    }
  } catch {
    // best-effort
  }
}

// --- Per-tenant storage quota (HARD limit) -------------------------------
// Unlike the meters above, this is enforced: a write that would push a tenant
// over its quota is REJECTED, not just logged. Every user in a tenant (law firm)
// shares one pool, so the quota is keyed by tenantId, not userId.
//
// S3 best practice: do NOT enumerate the bucket (ListObjectsV2/HeadObject) on the
// upload path — it is slow, costs per-request, and is eventually consistent. The
// database is the authoritative usage ledger: every stored object is one
// document_versions row carrying its sizeBytes, and a version's storagePath is
// nulled the moment its bytes are freed. Summing that column is the exact, cheap,
// strongly-consistent measure of the tenant's live S3 footprint. Reconcile drift
// against the bucket out-of-band (CloudWatch BucketSizeBytes / S3 Inventory), not
// inline. Soft-deleted documents still occupy S3 until the retention purge, and
// their versions still carry storagePath, so they correctly count here.

const BYTES_PER_GB = 1024 * 1024 * 1024;
const STORAGE_QUOTA_GB_DEFAULT = 5; // 5 GB per tenant

/**
 * The configured per-tenant storage cap in bytes. `TENANT_STORAGE_QUOTA_GB` is
 * set in gigabytes (fractional allowed, e.g. "0.5"); <= 0 disables the check.
 */
export function tenantStorageQuotaBytes(): number {
  return getEnvNumber("TENANT_STORAGE_QUOTA_GB", STORAGE_QUOTA_GB_DEFAULT) * BYTES_PER_GB;
}

/** Live S3 footprint for a tenant: sum of sizeBytes over versions whose bytes still exist. */
export async function tenantStorageBytes(tenantId: string): Promise<number> {
  const [row] = await db
    .select({ total: sql<number>`coalesce(sum(${documentVersions.sizeBytes}), 0)` })
    .from(documentVersions)
    .innerJoin(documents, eq(documents.id, documentVersions.documentId))
    .where(and(eq(documents.tenantId, tenantId), isNotNull(documentVersions.storagePath)));
  return Number(row?.total ?? 0);
}

/** Thrown when a store would exceed the tenant's quota. Routes map it to HTTP 507. */
export class StorageQuotaError extends Error {
  readonly used: number;
  readonly incoming: number;
  readonly limit: number;
  constructor(used: number, incoming: number, limit: number) {
    const gb = (n: number) => (n / (1024 * 1024 * 1024)).toFixed(2);
    super(
      `Storage quota exceeded: this organization uses ${gb(used)} GB of its ${gb(limit)} GB limit; this ${gb(incoming)} GB file would exceed it.`
    );
    this.name = "StorageQuotaError";
    this.used = used;
    this.incoming = incoming;
    this.limit = limit;
  }
}

/**
 * Guard a pending store against the tenant's shared quota. Call BEFORE writing
 * bytes to S3. Throws StorageQuotaError if the tenant's current footprint plus
 * `incomingBytes` would exceed the cap. A quota of <= 0 disables the check.
 *
 * Note: this is a check-then-write, so two concurrent uploads can both pass and
 * briefly overshoot by up to one request's size — an acceptable bound for a
 * coarse storage cap (an exact cap would need a locked counter row).
 */
export async function assertStorageWithinQuota(
  tenantId: string,
  incomingBytes: number
): Promise<void> {
  const limit = tenantStorageQuotaBytes();
  if (limit <= 0) return;
  const used = await tenantStorageBytes(tenantId);
  if (used + incomingBytes > limit) throw new StorageQuotaError(used, incomingBytes, limit);
}
