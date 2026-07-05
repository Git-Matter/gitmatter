import { jsonb, pgTable, text, timestamp, unique, uuid } from "drizzle-orm/pg-core";
import { user } from "./auth.js";
import type { MatterRole } from "./matters.js";

// Encrypted bring-your-own provider keys (AES-256-GCM).
export const userApiKeys = pgTable(
  "user_api_keys",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id")
      .notNull()
      .references(() => user.id, { onDelete: "cascade" }),
    provider: text("provider").default("anthropic").notNull(),
    encrypted: text("encrypted").notNull(),
    iv: text("iv").notNull(),
    authTag: text("auth_tag").notNull(),
    createdAt: timestamp("created_at").defaultNow().notNull(),
    updatedAt: timestamp("updated_at").defaultNow().notNull(),
  },
  (t) => [unique("user_api_key_unique").on(t.userId, t.provider)]
);

// Bearer tokens that let Claude Desktop / CLI / Cowork drive gitmatter via the
// exposed MCP server. The token maps to a gitmatter user; only the hash is stored.
export const mcpAccessTokens = pgTable("mcp_access_tokens", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: text("user_id")
    .notNull()
    .references(() => user.id, { onDelete: "cascade" }),
  tokenHash: text("token_hash").notNull().unique(),
  label: text("label").notNull(),
  // Least-privilege scope. Null = unscoped (full power of the minting user),
  // which is also what every pre-scope token gets. A non-null allowedMatterIds
  // restricts the token to those matters; maxRole caps its effective role.
  allowedMatterIds: jsonb("allowed_matter_ids").$type<string[]>(),
  maxRole: text("max_role").$type<MatterRole>(),
  createdAt: timestamp("created_at").defaultNow().notNull(),
  lastUsedAt: timestamp("last_used_at"),
  revokedAt: timestamp("revoked_at"),
});

export type UserApiKey = typeof userApiKeys.$inferSelect;
export type McpAccessToken = typeof mcpAccessTokens.$inferSelect;
