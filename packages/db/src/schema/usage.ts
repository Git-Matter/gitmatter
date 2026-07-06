import { index, integer, pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";

// Append-only usage meter. One row per metered event (an LLM completion, an MCP
// tool call, a CourtListener request, an extraction job). Budgets are evaluated
// by summing rows in a rolling time window; enforcement is log-only for now
// (over-budget emits a `budget.exceeded` audit event, never rejects). Kept apart
// from audit_events so high-volume metering never crowds the security log.

export type UsageKind = "llm" | "tool" | "courtlistener" | "ipaustralia" | "extraction";

export const usageEvents = pgTable(
  "usage_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    kind: text("kind").$type<UsageKind>().notNull(),
    userId: text("user_id"),
    tenantId: uuid("tenant_id"),
    // The matter this spend belongs to (best-effort) — lets a firm bill LLM
    // usage to a matter as a client disbursement. Null = not attributable.
    matterId: uuid("matter_id"),
    // Identifies the charging principal for per-token (MCP) metering.
    tokenId: uuid("token_id"),
    // Free-form descriptors: provider/model for llm, tool name for tool calls.
    provider: text("provider"),
    model: text("model"),
    tool: text("tool"),
    inputTokens: integer("input_tokens"),
    outputTokens: integer("output_tokens"),
    cachedInputTokens: integer("cached_input_tokens"),
    cacheWriteTokens: integer("cache_write_tokens"),
    cacheReadTokens: integer("cache_read_tokens"),
    cacheMode: text("cache_mode"),
    cacheKey: text("cache_key"),
    // Generic unit count for kinds that meter by occurrence (tool/cl/extraction).
    count: integer("count").notNull().default(1),
    createdAt: timestamp("created_at").defaultNow().notNull(),
  },
  (t) => [
    index("usage_events_user_created_idx").on(t.userId, t.createdAt),
    index("usage_events_tenant_created_idx").on(t.tenantId, t.createdAt),
    index("usage_events_token_created_idx").on(t.tokenId, t.createdAt),
    index("usage_events_matter_created_idx").on(t.matterId, t.createdAt),
  ]
);

export type UsageEvent = typeof usageEvents.$inferSelect;
